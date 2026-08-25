# Handoff 19c — the Itinerary Desk (LLM in the package builder)

Replaces the paste box as the main way into a package. You describe the trip, or a change to
one, in your own words; it replies in prose and writes the fields. It can build from nothing and
edit what is on screen, in the same conversation.

**It does not work until an API key is bound — see Setup at the bottom.**

---

## What shipped

| file | what |
|---|---|
| `functions/_lib/packagePrompt.js` | **new.** The house rulebook the model is given, plus the one tool it can call. Server-side on purpose: `functions/_lib/` is not routed by Pages, so nothing here is reachable from a browser and nothing here can be edited by one. |
| `functions/api/package-chat.js` | **new.** The endpoint. Checks the caller is signed in, calls the model, re-emits its stream. |
| `src/lib/packageChat.ts` | **new.** Message shapes, the stream reader, and the normaliser that turns what the model sent into values the builder can hold. |
| `src/pages/PackageBuilder.tsx` | the Itinerary Desk panel at the top of the builder; the paste box demoted below it. |
| `src/lib/packageImport.ts` | three bug fixes found by using it on a real quote — see §4. |

---

## 1. How it works

One tool, `update_package`, every field optional, so a call is a patch. `days`, when present, is
the **complete** new array: the model re-emits all six days to change one. That costs a few
hundred tokens and removes an entire class of index-drift bug — asking for "a shorter day 3"
cannot renumber day 5.

The model is sent the current package as JSON on every turn, so "swap the Alexandria day for
Sakkara" works without the agent restating anything.

**Patches apply to React state, never to the database.** A wrong turn is undone by the Undo
button or by the next sentence. Save and Publish are still pressed by hand, and the package is
still a draft until they are.

**Photographs are not chosen by the model.** It names the places a day visits, in order; the
client resolves each to a picture through `sitePhoto()` — the same alias table the compact sheet
and the paste importer use. So a Karnak day gets the same photograph however it was built. The
model may name a path explicitly and that wins.

### The stream

`api.anthropic.com` speaks SSE, with events split across chunks and tool arguments arriving as a
dribble of JSON fragments. Parsing that in the browser would put the fiddly half in the hardest
place to debug, so the Function consumes the SSE and re-emits newline-delimited JSON — one
object per line, four kinds:

```
{"t":"text","d":"…"}                        a fragment of the reply
{"t":"tool","id":"…","name":"…","input":{}} a completed, parsed tool call
{"t":"done"}
{"t":"error","message":"…"}
```

The client's entire parser is: split on newlines, `JSON.parse` each. The model's real `tool_use`
id is forwarded so the panel can pair its `tool_result` with it rather than inventing one.

### Two things the endpoint refuses

- **Anyone not signed in.** It spends real money per call, so it hands the caller's Supabase
  access token back to Supabase and asks whose it is. No token, or an unrecognised one, gets
  nothing.
- **A runaway panel.** 40 messages, 24k characters per message, 120k total, `max_tokens` 8000.

---

## 2. What the model is told, and why

`HOUSE_RULES` in `packagePrompt.js` is the interesting file. Most of it is either a convention
lifted from packages already published, or a mistake that has already been made once:

- **Never invent a price.** No figure from the agent means the price fields are left alone and
  the reply says so. A wrong number on a page a client opens is the worst thing this can produce.
- **Never put a personal name anywhere client-facing.** It goes in `internalLabel`, which is
  private. Stated three separate ways in the prompt because a published page carried one
  client's name on another client's link for weeks (handoff 19 §1c).
- **Never promise a named hotel when two star tiers are quoted** — the price table carries the
  properties per tier and the day cards stay empty.
- **Never tick a meal the client pays for.** "Optional dinner, 55 USD extra" is not an included
  dinner; it is an exclusion with a price.
- **Never write a date, flight time, price or opening time it was not given.** "Morning flight",
  not "07:00 flight".
- **Ask, do not guess,** on exactly five things: dates, guest count, occupancy, star rating,
  price. Everything else it decides and lists under `assumptions`.
- Day titles carry no "Day 3 —" prefix; the document numbers days itself. Verified against the
  database: 744 of 755 stored days have no prefix.
- Nights = days − 1, the last day has no night, and both edges are called out — a flight landing
  at 01:25 belongs to the night before, and a 03:25 departure needs the whole preceding night
  with the room held to the transfer.

The panel shows three things under every reply: **Applied** (which fields changed), **Assumed**
(what it decided on its own), and **Not applied** (anything the normaliser rejected).

That last one exists because silence is worse than an error. The model answered `"next Saturday"`
for a date in testing; dropping it is correct, but without the line the agent sees a confident
reply, no departure date, and no reason why.

---

## 3. Verified

No API key was available, so the model itself was never called. Everything around it was tested
end to end in node, and the two halves most likely to break — the SSE reader and the NDJSON
reader — were tested against a **deliberately hostile** fake stream: events split mid-`data:`
line, tool arguments dribbled in three fragments, and the client's side re-chopped into 37-byte
pieces.

- `npx tsc --noEmit` clean; `vite build` clean.
- The Function returns 200 `application/x-ndjson`; the reply text reassembles byte-identical
  through both readers; the tool JSON parses exactly; the real tool id survives.
- The normaliser was fed wrong types on purpose: `pax: "1"` → `1`; `nights: "4"` → `4`;
  `dbl: "4,200 USD"` → `4200`; `roomBasis: "SINGLE"` → `single`; blank site names stripped; a
  `meals` object **missing `dinner`** filled to `false` rather than left undefined (as
  `undefined` it renders as an unticked box that silently drops a meal from a client's board
  basis); `departureDate: "next Saturday"`, `pax: 0`, `roomBasis: "family"` and
  `priceColumns: "both"` all rejected and reported.

**Not verified:** any real reply from a model, and the streaming feel in a browser. The default
model id was checked against the models page in August 2026 (`claude-sonnet-5`), but it stays an
env var because ids change — and the API's own error text is passed straight through, so a wrong
one shows as "The model API returned 404. …" and is a one-variable fix.

---

## 4. Bugs the paste importer had, found by using it on a real quote

Fixed in `src/lib/packageImport.ts`:

1. **The title cut ate half the name.** `"6 Days / 5 Nights – Nile Cruise & the Pyramids of
   Giza"` came out as **"Nile Cruise"** — "Cruise" is on the title-noun list and everything after
   the last such noun was dropped as a marketing tail. The tail is now kept when it contains a
   function word (`&`, `the`, `of`), which is what tells a continuing name from a keyword list.
2. **Protective exclusions duplicated lines the sheet already had.** A sheet already excluding
   "Interior pyramid and tomb entrance fees" and "Optional excursion to Abu Simbel" got both
   back, phrased differently, because the duplicate check compared the first eighteen characters
   of the house line. Each house exclusion now carries a `dupe` pattern matching on the subject.
3. `"01 night accommodation"` rendered as `"1 nights accommodation"`.

---

## 5. Setup — nothing works until this is done

In **Cloudflare Pages → the quotations project → Settings → Environment variables**, add:

| variable | value |
|---|---|
| `ANTHROPIC_API_KEY` | your key. Mark it a **secret**. |
| `SUPABASE_URL` | the same URL as `VITE_SUPABASE_URL`. Public value. |
| `SUPABASE_ANON_KEY` | the same key as `VITE_SUPABASE_ANON_KEY`. Public value. |
| `PACKAGE_CHAT_MODEL` | optional. Overrides the default, which is `claude-sonnet-5`. |

### The key, and what it costs

**Use a key from whichever account you like** — a separate one is better practice, not worse.
Nothing in the code cares whose key it is, and a key scoped to this one app is a key you can
rotate without touching anything else.

**There is no free API tier.** New organisations start in an "Evaluation tier", but that is lower
*rate limits* while account history builds — not free credits. API usage is billed separately
from a Claude Pro or Max subscription; a subscription does not carry API access or credits with
it. (Checked against the pricing and rate-limit docs, August 2026.)

The cost is small enough that it probably should not drive the decision. On `claude-sonnet-5` at
$2 per million input tokens and $10 per million output:

| | |
|---|---|
| a typical turn (~6k in, ~2k out) | **≈ $0.03** |
| a package built over six turns | **≈ $0.19** |
| a hundred packages | **≈ $19** |

Two levers if that ever matters: prompt caching is already on (see below), and
`PACKAGE_CHAT_MODEL=claude-haiku-4-5` is roughly five times cheaper again at some cost in
judgement.

**Prompt caching is on.** The rulebook and the tool schema are identical every turn — about
2,600 tokens — so they are cached and re-read at $0.20 per million instead of $2. The breakpoint
sits on the first system block deliberately: caching works on prefixes (tools, then system, then
messages), so marking the stable block caches tools + rules and leaves the per-turn package JSON
outside it. Marking the last block instead would cache a prefix that never repeats and pay the
write premium for nothing.

Then redeploy. Until the key is bound the panel answers: *"ANTHROPIC_API_KEY is not set on this
deployment."*

The `functions/` directory in this repo had been emptied (`api/convert.js` was moved to
`_to_delete`), so confirm the Pages project still builds Functions from `functions/` — that is
where both new files live.

---

## 6. The paste importer is still there

Demoted, not deleted, under **"Paste a supplier's programme"**. It is a parser: no model, no API
cost, works when the key is missing or the network is down, and it is the better tool for a
straight transcription of a rate sheet that arrived already written. Say the word if you want it
gone.

---

## 7. Still open

Everything in §4 of handoff 19, plus:

- `handoff-19b` — the `/pages/*` middleware fix and the phone viewport fix are **written to the
  website repo but not deployed**.
- The desk has never spoken to a real model.
- The November 16–21 Messenger quote was left alone at your request.
