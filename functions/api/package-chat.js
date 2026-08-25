/**
 * POST /api/package-chat — the builder's conversation with a model.
 *
 * The browser cannot hold the API key, so the call is made here and the reply is streamed
 * back. Three jobs, in order: prove the caller is a signed-in user of this app, call the
 * model, and re-emit its stream in a shape the panel can read without a parser.
 *
 * WHY IT RE-EMITS RATHER THAN PROXIES. Anthropic's SSE is a good protocol and a fiddly one —
 * events split across chunks, tool arguments arriving as a stream of JSON fragments. Parsing
 * that in the browser puts the fiddly half in the place that is hardest to debug and easiest to
 * break. So the SSE is consumed here and re-emitted as newline-delimited JSON, one object per
 * line, four kinds:
 *
 *   {"t":"text","d":"…"}                 a fragment of the reply, in order
 *   {"t":"tool","id":"…","name":"…","input":{…}}  a completed, parsed tool call
 *   {"t":"done"}                         the model finished
 *   {"t":"error","message":"…"}          it did not
 *
 * The client splits on newlines and JSON.parses each line. That is the whole client parser.
 *
 * ENV, all set in Cloudflare Pages → Settings → Environment variables:
 *   ANTHROPIC_API_KEY   (secret, required)
 *   PACKAGE_CHAT_MODEL  (optional) — a model id. It is an env var and not a constant because
 *                       model ids change; if the panel reports a 404 from the API, this is the
 *                       thing to correct, and the API's own message is passed through so the
 *                       wrong id is visible rather than guessable.
 *   SUPABASE_URL, SUPABASE_ANON_KEY (required, and both are public values) — used only to ask
 *                       Supabase whether the caller's token is a real session.
 */

import { HOUSE_RULES, UPDATE_PACKAGE_TOOL, describeCurrent } from '../_lib/packagePrompt.js'

/**
 * Checked against the pricing and models pages in August 2026. `claude-sonnet-5` is the
 * current mid-tier id and is BOTH better and cheaper than the Sonnet 4.5 that was hardcoded
 * here first ($2/$10 per million tokens against $3/$15). Override with PACKAGE_CHAT_MODEL:
 * `claude-haiku-4-5` is a further five times cheaper if this ever needs economising, and
 * `claude-opus-5` is there for the hardest itineraries.
 *
 * Still an env var rather than a constant, because ids change and the wrong one is a 404
 * whose text is passed straight through to the panel.
 */
const DEFAULT_MODEL = 'claude-sonnet-5'
const MAX_TOKENS = 8000

/** Hard caps. A runaway loop in the panel must not be able to spend the whole API budget. */
const LIMITS = {
  messages: 40,
  charsPerMessage: 24000,
  totalChars: 120000,
}

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })

/**
 * Is this a signed-in user of the app?
 *
 * The endpoint spends real money per call, so it cannot be open to the internet. The app already
 * authenticates every agent through Supabase, so the cheapest correct check is to hand the
 * caller's own access token back to Supabase and ask who it belongs to. No token, or a token
 * Supabase does not recognise, gets nothing.
 */
async function verifyUser(request, env) {
  const auth = request.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { ok: false, status: 401, message: 'Not signed in.' }
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return { ok: false, status: 500, message: 'SUPABASE_URL / SUPABASE_ANON_KEY are not set on this deployment.' }
  }
  let res
  try {
    res = await fetch(env.SUPABASE_URL.replace(/\/+$/, '') + '/auth/v1/user', {
      headers: { apikey: env.SUPABASE_ANON_KEY, authorization: 'Bearer ' + token },
    })
  } catch (e) {
    return { ok: false, status: 502, message: 'Could not reach Supabase to check the session.' }
  }
  if (!res.ok) return { ok: false, status: 401, message: 'Your session has expired — sign in again.' }
  return { ok: true }
}

/**
 * Accept only the message shape we send, and only content the model can use.
 *
 * The history the panel replays contains assistant tool_use blocks and the tool_result blocks
 * that answer them, because the API requires that pairing to continue a conversation. Anything
 * else is dropped rather than forwarded — this endpoint decides what reaches the model.
 */
function cleanMessages(raw) {
  if (!Array.isArray(raw)) return { error: 'messages must be an array.' }
  const msgs = raw.slice(-LIMITS.messages)
  let total = 0
  const out = []
  for (const m of msgs) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue
    let content = m.content
    if (typeof content === 'string') {
      if (content.length > LIMITS.charsPerMessage) return { error: 'One of the messages is too long.' }
      total += content.length
      if (!content.trim()) continue
      out.push({ role: m.role, content })
      continue
    }
    if (!Array.isArray(content)) continue
    const blocks = []
    for (const b of content) {
      if (!b || typeof b !== 'object') continue
      if (b.type === 'text' && typeof b.text === 'string') {
        total += b.text.length
        blocks.push({ type: 'text', text: b.text })
      } else if (b.type === 'tool_use' && b.id && b.name) {
        total += JSON.stringify(b.input || {}).length
        blocks.push({ type: 'tool_use', id: b.id, name: b.name, input: b.input || {} })
      } else if (b.type === 'tool_result' && b.tool_use_id) {
        const c = typeof b.content === 'string' ? b.content : ''
        total += c.length
        blocks.push({ type: 'tool_result', tool_use_id: b.tool_use_id, content: c })
      }
    }
    if (blocks.length) out.push({ role: m.role, content: blocks })
  }
  if (total > LIMITS.totalChars) return { error: 'This conversation has grown too long — start a new one.' }
  if (!out.length) return { error: 'Nothing to send.' }
  if (out[out.length - 1].role !== 'user') return { error: 'The last message must be from the agent.' }
  return { messages: out }
}

/** One NDJSON line. */
const line = (obj) => new TextEncoder().encode(JSON.stringify(obj) + '\n')

export async function onRequestPost({ request, env }) {
  const who = await verifyUser(request, env)
  if (!who.ok) return json(who.status, { error: who.message })

  if (!env.ANTHROPIC_API_KEY) {
    return json(500, {
      error:
        'ANTHROPIC_API_KEY is not set on this deployment. Add it in Cloudflare Pages → Settings → ' +
        'Environment variables, then redeploy.',
    })
  }

  let body
  try { body = await request.json() } catch { return json(400, { error: 'Body must be JSON.' }) }

  const cleaned = cleanMessages(body && body.messages)
  if (cleaned.error) return json(400, { error: cleaned.error })

  /**
   * The rulebook is identical on every single turn, and the tool schema with it, so the two
   * of them are cached rather than re-read. Roughly 2,600 tokens move from $2 per million to
   * $0.20 per million, and the reply starts sooner.
   *
   * The breakpoint sits on the FIRST block on purpose. Caching works on prefixes — tools,
   * then system, then messages — so marking the stable block caches tools + rules, and the
   * package JSON below it, which is different every turn, is left outside. Marking the last
   * block instead would cache a prefix that never repeats and pay the write premium for
   * nothing.
   */
  const system = [
    { type: 'text', text: HOUSE_RULES, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: describeCurrent(body && body.package) },
  ]

  let upstream
  try {
    upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: env.PACKAGE_CHAT_MODEL || DEFAULT_MODEL,
        max_tokens: MAX_TOKENS,
        system,
        messages: cleaned.messages,
        tools: [UPDATE_PACKAGE_TOOL],
        stream: true,
      }),
    })
  } catch (e) {
    return json(502, { error: 'Could not reach the model API: ' + (e && e.message ? e.message : String(e)) })
  }

  if (!upstream.ok || !upstream.body) {
    // Pass the API's own words through. A wrong model id, an over-quota key and a bad request
    // are three different problems and the panel should be able to tell them apart.
    let detail = ''
    try {
      const text = await upstream.text()
      try { detail = JSON.parse(text).error?.message || text } catch { detail = text }
    } catch { /* nothing to add */ }
    return json(502, {
      error: `The model API returned ${upstream.status}.` + (detail ? ' ' + String(detail).slice(0, 400) : ''),
    })
  }

  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      // A tool call arrives as a name, then its JSON arguments in fragments, then a stop.
      let toolName = ''
      let toolId = ''
      let toolJson = ''
      let inTool = false

      const emit = (obj) => controller.enqueue(line(obj))

      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })

          // SSE events are separated by a blank line. Anything after the last one is a
          // partial event and stays in the buffer.
          let cut
          while ((cut = buf.indexOf('\n\n')) !== -1) {
            const raw = buf.slice(0, cut)
            buf = buf.slice(cut + 2)
            const dataLine = raw.split('\n').find((l) => l.startsWith('data:'))
            if (!dataLine) continue
            let ev
            try { ev = JSON.parse(dataLine.slice(5).trim()) } catch { continue }

            if (ev.type === 'content_block_start' && ev.content_block?.type === 'tool_use') {
              inTool = true
              toolName = ev.content_block.name || ''
              // Forwarded so the panel can pair its tool_result with the id the model
              // actually used, rather than inventing one that happens to be consistent.
              toolId = ev.content_block.id || ''
              toolJson = ''
            } else if (ev.type === 'content_block_delta') {
              if (ev.delta?.type === 'text_delta' && ev.delta.text) emit({ t: 'text', d: ev.delta.text })
              else if (ev.delta?.type === 'input_json_delta') toolJson += ev.delta.partial_json || ''
            } else if (ev.type === 'content_block_stop') {
              if (inTool) {
                inTool = false
                // An empty argument object is valid JSON that JSON.parse rejects as ''.
                let input = {}
                if (toolJson.trim()) {
                  try { input = JSON.parse(toolJson) } catch {
                    emit({ t: 'error', message: 'The model sent a change I could not read. Ask it to try again.' })
                    toolJson = ''
                    continue
                  }
                }
                emit({ t: 'tool', id: toolId, name: toolName, input })
                toolJson = ''
              }
            } else if (ev.type === 'error') {
              emit({ t: 'error', message: ev.error?.message || 'The model API reported an error.' })
            }
          }
        }
        emit({ t: 'done' })
      } catch (e) {
        emit({ t: 'error', message: 'The reply was cut off: ' + (e && e.message ? e.message : String(e)) })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex',
    },
  })
}
