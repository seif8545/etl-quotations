/**
 * The builder's side of the conversation.
 *
 * Three things live here, and nothing else: the message shapes, the reader for the endpoint's
 * newline-delimited stream, and the normaliser that turns what the model sent into values the
 * builder can actually hold.
 *
 * THE NORMALISER IS THE IMPORTANT PART. Everything arriving from `/api/package-chat` is a
 * model's best effort at a JSON schema — usually right, occasionally a string where a number
 * belongs, a missing uid, a day with no photograph. None of that may reach React state as-is: a
 * `meals` object missing `dinner` renders as an unticked box that silently drops a meal from a
 * client's board basis, and a day without a `uid` breaks the day list's keys. So every field is
 * coerced, and anything unrecognised is dropped rather than trusted.
 *
 * Photographs are resolved HERE rather than by the model. It only has to name the places the day
 * visits; `sitePhoto()` maps a place to a picture using the same alias table the rest of the app
 * uses, so a Karnak day gets the same photograph however it was built. The model may still name
 * a path when it has reason to, and that wins.
 */

import { sitePhoto } from './sitePhotos'
import type { PhotoManifest } from './sitePhotos'

/* ─── what goes over the wire ────────────────────────────────────────────── */

/** A content block, in the shape the model API uses. */
export type Block =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string }

export interface ChatMsg {
  role: 'user' | 'assistant'
  content: string | Block[]
}

/** One line of the endpoint's stream. */
export type StreamEvent =
  | { t: 'text'; d: string }
  | { t: 'tool'; id: string; name: string; input: Record<string, unknown> }
  | { t: 'done' }
  | { t: 'error'; message: string }

/* ─── the builder shapes, restated ───────────────────────────────────────── */
/* Declared here rather than imported from PackageBuilder.tsx so this module stays free of
   React. Structurally identical, which is all the compiler needs. */

export interface ChatMeals { breakfast: boolean; lunch: boolean; dinner: boolean }

export interface ChatDay {
  uid: string
  title: string
  description: string
  photo: string
  sites: string[]
  guide: boolean
  meals: ChatMeals
  hotel: string
}

export interface ChatFixedDay {
  on: boolean
  title: string
  description: string
  photo: string
  meals: ChatMeals
  hotel: string
}

export interface ChatPriceRow {
  category: string
  dbl: number
  single: number
  triple: number
  quad: number
  solo?: number
  hotels: string
}

/** Only the fields the model actually touched. Everything absent is left alone. */
export interface PackagePatch {
  title?: string
  intro?: string
  hero?: string
  internalLabel?: string
  pax?: number
  arrivalDate?: string
  departureDate?: string
  roomBasis?: string
  hotels?: { nights: number; destination: string }[]
  arrival?: ChatFixedDay
  departure?: ChatFixedDay
  days?: ChatDay[]
  included?: string
  excluded?: string
  priceTableOn?: boolean
  priceColumns?: 'all' | 'dbl' | 'single' | 'triple' | 'quad' | 'solo'
  priceRows?: ChatPriceRow[]
}

export interface NormalizedPatch {
  patch: PackagePatch
  /** Field names in plain English, for the one-line "what changed" under the reply. */
  changed: string[]
  /** What the model says it decided on its own. Shown to the agent, never printed. */
  assumptions: string[]
  /**
   * Fields the model sent that were rejected here.
   *
   * Silence would be worse than an error. When the model answers "next Saturday" for a date,
   * dropping it is right — but if the agent is not told, they see a confident reply, no
   * departure date, and no reason why.
   */
  dropped: string[]
}

/* ─── coercion ───────────────────────────────────────────────────────────── */

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)
const bool = (v: unknown, fallback = false): boolean => (typeof v === 'boolean' ? v : fallback)

/** A model sometimes sends "4700" or "4,700 USD" where a number belongs. */
const numOf = (v: unknown, fallback = 0): number => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^\d.\-]/g, ''))
    if (Number.isFinite(n)) return n
  }
  return fallback
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const newUid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const meals = (v: unknown, fallback?: ChatMeals): ChatMeals => {
  const base = fallback ?? { breakfast: false, lunch: false, dinner: false }
  if (!v || typeof v !== 'object') return { ...base }
  const o = v as Record<string, unknown>
  return {
    breakfast: bool(o.breakfast, base.breakfast),
    lunch: bool(o.lunch, base.lunch),
    dinner: bool(o.dinner, base.dinner),
  }
}

const ARRIVAL_PHOTO = 'arrivedepart/arrival-plane.jpg'
const DEPARTURE_PHOTO = 'arrivedepart/departure-plane.jpg'

function fixedDay(v: unknown, fallbackPhoto: string, previous?: ChatFixedDay): ChatFixedDay | undefined {
  if (!v || typeof v !== 'object') return undefined
  const o = v as Record<string, unknown>
  const prev = previous ?? { on: false, title: '', description: '', photo: fallbackPhoto, meals: meals(null), hotel: '' }
  return {
    on: bool(o.on, prev.on),
    title: str(o.title, prev.title),
    description: str(o.description, prev.description),
    photo: str(o.photo) || prev.photo || fallbackPhoto,
    meals: meals(o.meals, prev.meals),
    hotel: str(o.hotel, prev.hotel),
  }
}

/**
 * Turn the tool's arguments into builder values.
 *
 * `previousDays` is passed so a rewrite of the day list can keep each day's uid and, where the
 * model did not name one, its photograph. Without that, asking for "a shorter day 3" would
 * re-key every day in React and lose four photographs the agent had already chosen by hand.
 */
export function normalizePatch(
  input: Record<string, unknown>,
  manifest: PhotoManifest,
  previousDays: ChatDay[] = [],
  previousArrival?: ChatFixedDay,
  previousDeparture?: ChatFixedDay,
): NormalizedPatch {
  const patch: PackagePatch = {}
  const changed: string[] = []
  const dropped: string[] = []
  const has = (k: string) => Object.prototype.hasOwnProperty.call(input, k)

  if (has('title') && str(input.title).trim()) { patch.title = str(input.title).trim(); changed.push('title') }
  if (has('intro') && str(input.intro).trim()) { patch.intro = str(input.intro).trim(); changed.push('cover paragraph') }
  if (has('hero') && str(input.hero).trim()) { patch.hero = str(input.hero).trim(); changed.push('cover photo') }
  if (has('internalLabel')) { patch.internalLabel = str(input.internalLabel).trim(); changed.push('internal label') }

  if (has('pax')) {
    const n = Math.round(numOf(input.pax, 0))
    if (n > 0) { patch.pax = Math.max(1, n) } else dropped.push(`guests ("${String(input.pax)}")`)
    if (n > 0) changed.push('guests')
  }
  for (const [key, field, label] of [
    ['arrivalDate', 'arrivalDate', 'arrival date'],
    ['departureDate', 'departureDate', 'departure date'],
  ] as const) {
    if (!has(key)) continue
    const v = str(input[key]).trim()
    // '' is a deliberate clear; anything that is not a real date is dropped rather than stored.
    if (v === '' || DATE_RE.test(v)) { patch[field] = v; changed.push(label) }
    else dropped.push(`${label} ("${v}") — dates have to be YYYY-MM-DD`)
  }
  if (has('roomBasis')) {
    const v = str(input.roomBasis).trim().toLowerCase()
    if (['single', 'double', 'triple', 'quadruple'].includes(v)) { patch.roomBasis = v; changed.push('room basis') }
    else dropped.push(`room basis ("${str(input.roomBasis)}")`)
  }

  if (has('hotels') && Array.isArray(input.hotels)) {
    patch.hotels = (input.hotels as unknown[])
      .map((h) => {
        const o = (h || {}) as Record<string, unknown>
        return { nights: Math.max(0, Math.round(numOf(o.nights, 0))), destination: str(o.destination).trim() }
      })
      .filter((h) => h.destination || h.nights > 0)
    changed.push('nights')
  }

  const arr = fixedDay(input.arrivalDay, ARRIVAL_PHOTO, previousArrival)
  if (arr) { patch.arrival = arr; changed.push('arrival day') }
  const dep = fixedDay(input.departureDay, DEPARTURE_PHOTO, previousDeparture)
  if (dep) { patch.departure = dep; changed.push('departure day') }

  if (has('days') && Array.isArray(input.days)) {
    patch.days = (input.days as unknown[]).map((d, i) => {
      const o = (d || {}) as Record<string, unknown>
      const prev = previousDays[i]
      const sites = Array.isArray(o.sites)
        ? (o.sites as unknown[]).map((s) => str(s).trim()).filter(Boolean).slice(0, 6)
        : prev?.sites ?? []
      // The model names the places; the app's own alias table turns them into a photograph, so
      // the same day looks the same however it was built.
      let photo = str(o.photo).trim()
      if (!photo) for (const s of sites) { photo = sitePhoto(s, manifest); if (photo) break }
      if (!photo) photo = prev?.photo ?? ''
      return {
        uid: prev?.uid ?? newUid(),
        title: str(o.title, prev?.title ?? '').trim(),
        description: str(o.description, prev?.description ?? ''),
        photo,
        sites,
        guide: bool(o.guide, prev?.guide ?? sites.length > 0),
        meals: meals(o.meals, prev?.meals),
        hotel: str(o.hotel, prev?.hotel ?? ''),
      }
    }).filter((d) => d.title || d.description)
    changed.push(`${patch.days.length} day${patch.days.length === 1 ? '' : 's'}`)
  }

  if (has('included')) { patch.included = str(input.included); changed.push('inclusions') }
  if (has('excluded')) { patch.excluded = str(input.excluded); changed.push('exclusions') }

  if (has('priceTableOn')) { patch.priceTableOn = bool(input.priceTableOn); changed.push('price table') }
  if (has('priceColumns')) {
    const v = str(input.priceColumns).trim()
    if (['all', 'dbl', 'single', 'triple', 'quad', 'solo'].includes(v)) patch.priceColumns = v as PackagePatch['priceColumns']
    else dropped.push(`price columns ("${v}")`)
  }
  if (has('priceRows') && Array.isArray(input.priceRows)) {
    patch.priceRows = (input.priceRows as unknown[]).map((r) => {
      const o = (r || {}) as Record<string, unknown>
      return {
        category: str(o.category).trim() || 'Package',
        dbl: numOf(o.dbl), single: numOf(o.single), triple: numOf(o.triple),
        quad: numOf(o.quad), solo: numOf(o.solo),
        hotels: str(o.hotels).trim(),
      }
    })
    changed.push('prices')
  }

  const assumptions = Array.isArray(input.assumptions)
    ? (input.assumptions as unknown[]).map((a) => str(a).trim()).filter(Boolean)
    : []

  return { patch, changed, assumptions, dropped }
}

/* ─── the stream reader ──────────────────────────────────────────────────── */

export interface StreamHandlers {
  onText: (fragment: string) => void
  onTool: (id: string, name: string, input: Record<string, unknown>) => void
}

/**
 * POST the conversation and read the reply as it arrives.
 *
 * Resolves when the stream ends; throws with a message worth showing when it cannot start or
 * the endpoint reports a failure. The caller owns the abort signal, so closing the panel or
 * sending again cancels the request in flight.
 */
export async function streamPackageChat(
  args: {
    messages: ChatMsg[]
    pkg: unknown
    accessToken: string
    signal?: AbortSignal
  },
  handlers: StreamHandlers,
): Promise<void> {
  const res = await fetch('/api/package-chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer ' + args.accessToken,
    },
    body: JSON.stringify({ messages: args.messages, package: args.pkg }),
    signal: args.signal,
  })

  if (!res.ok || !res.body) {
    let message = `The request failed (${res.status}).`
    try {
      const j = await res.json()
      if (j && typeof j.error === 'string') message = j.error
    } catch { /* keep the status line */ }
    throw new Error(message)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let failure = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let cut: number
    while ((cut = buf.indexOf('\n')) !== -1) {
      const raw = buf.slice(0, cut).trim()
      buf = buf.slice(cut + 1)
      if (!raw) continue
      let ev: StreamEvent
      try { ev = JSON.parse(raw) as StreamEvent } catch { continue }
      if (ev.t === 'text') handlers.onText(ev.d)
      else if (ev.t === 'tool') handlers.onTool(ev.id, ev.name, ev.input)
      else if (ev.t === 'error') failure = ev.message
    }
  }
  if (failure) throw new Error(failure)
}
