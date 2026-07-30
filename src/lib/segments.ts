/**
 * Segment derivation for the compact one-page package sheet.
 *
 * The detailed PDF renders one page per day. The compact sheet instead groups the
 * itinerary into "stay blocks" — e.g. "3 Nights · Cairo & Giza", "4 Nights · Nile
 * Cruise" — so the whole programme fits on a single A4 page.
 *
 * Blocks are derived from the accommodation rows the user already fills in
 * (`hotels: [{ nights, destination }]`), walked against the rendered day sequence.
 * Everything degrades gracefully: packages with no accommodation rows fall back to
 * grouping by the per-day hotel field, and failing that to one block per day.
 * This module never throws — it always returns something renderable.
 */

export interface SegMeals {
  breakfast: boolean
  lunch: boolean
  dinner: boolean
}

/** A day as far as segment derivation is concerned (arrival / tour day / departure). */
export interface SegSourceDay {
  uid: string
  title: string
  /** Newline-separated bullets — first bullet of each day composes the block blurb. */
  description: string
  photo: string
  sites: string[]
  meals: SegMeals
  hotel: string
}

export interface SegHotel {
  nights: number
  destination: string
}

/** A derived stay block, ready to render. */
export interface Segment {
  key: string
  /** Duration label, e.g. "3 Nights" (or "2 Days" when there are no nights). */
  label: string
  /** e.g. "Days 1–4" or "Day 8". */
  dayRange: string
  nights: number
  dayFrom: number
  dayTo: number
  destination: string
  /** Prose summary of the stay, composed from the days' opening lines. */
  blurb: string
  highlights: string[]
  /** Hotel / cruise name for this block. */
  stay: string
  /** Summarised meals, e.g. "Full board" or "Breakfast daily · 2 dinners". */
  meals: string
  /** Raw photo value — a path under /images/tours/ or an absolute URL. */
  photo: string
  /** Flight / transfer lines that fall inside this block. */
  notes: string[]
  hidden?: boolean
}

/** User edits layered over the derived blocks. Stored on PackageState, aligned by index. */
export interface SegmentOverride {
  label?: string
  destination?: string
  blurb?: string
  highlights?: string[]
  stay?: string
  meals?: string
  photo?: string
  hidden?: boolean
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

/** "Days 1–4" / "Day 8" (1-based, inclusive). */
function rangeLabel(from: number, to: number): string {
  return from === to ? `Day ${from + 1}` : `Days ${from + 1}–${to + 1}`
}

/**
 * Collapse a block's meals into one short phrase.
 * Recognises full board / half board so the common cruise case reads naturally.
 */
function summariseMeals(block: SegSourceDay[]): string {
  const n = block.length
  if (n === 0) return ''
  const b = block.filter((d) => d.meals?.breakfast).length
  const l = block.filter((d) => d.meals?.lunch).length
  const dn = block.filter((d) => d.meals?.dinner).length
  if (b === 0 && l === 0 && dn === 0) return ''
  if (n > 1 && b === n && l === n && dn === n) return 'Full board'
  if (n > 1 && b === n && dn === n && l === 0) return 'Half board'
  // NB: "lunch" pluralises to "lunches", so the forms are spelled out rather than
  // derived by appending an "s".
  const part = (count: number, one: string, many: string, daily: string) => {
    if (count === 0) return ''
    if (count === n && n > 1) return daily
    return `${count} ${plural(count, one, many)}`
  }
  return [
    part(b, 'breakfast', 'breakfasts', 'Breakfast daily'),
    part(l, 'lunch', 'lunches', 'Lunch daily'),
    part(dn, 'dinner', 'dinners', 'Dinner daily'),
  ].filter(Boolean).join(' · ')
}

/** Case-insensitive dedupe that keeps first-seen order, then caps with a "+N more" tail. */
function mergeHighlights(block: SegSourceDay[], cap: number): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const d of block) {
    for (const raw of d.sites ?? []) {
      const s = (raw ?? '').trim()
      if (!s) continue
      const k = s.toLowerCase()
      if (seen.has(k)) continue
      seen.add(k)
      out.push(s)
    }
  }
  // "Private guide" is appended per-day, so first-seen order drops it in the middle
  // of the sights. It reads as a service, not a sight — move it to the end.
  const isService = (s: string) => /^private guide$/i.test(s)
  const ordered = [...out.filter((s) => !isService(s)), ...out.filter(isService)]
  if (cap > 0 && ordered.length > cap) {
    const extra = ordered.length - cap
    return [...ordered.slice(0, cap), `+${extra} more`]
  }
  return ordered
}

/*
 * Choosing what a stay's summary says.
 *
 * Two earlier rules both failed on real data. "First bullet of each day" produced
 * "Early breakfast at the hotel. Breakfast onboard. Breakfast onboard." — days open
 * with logistics. "First non-boilerplate bullet" then produced "After breakfast,
 * meet your private Egyptologist guide.", and missed the Pyramids entirely, because
 * the interesting line is rarely the first survivor either.
 *
 * So lines are SCORED and the best ones win: a line that opens with a sightseeing
 * verb and names somewhere the guest is actually going beats one about airports and
 * meals, wherever it sits in the day.
 */
const ACTION = /^(visit|explore|discover|marvel|stand|walk|sail|witness|admire|cruise|experience|see|enjoy|board|stop at|photo stop)/i

const DEAD = /\b(breakfast|lunch|dinner|check[- ]?in|check[- ]?out|transfer|airport|flight|luggage|formalit|overnight|hotel|meet\s*(&|and)\s*assist|representative)\b/i

const NO_START = [
  /^(early |late )?breakfast\b/i,
  /^(after|before) (breakfast|lunch|dinner)\b/i,
  /^(lunch|dinner|meals?)\b/i,
  /^check[- ]?(in|out)\b/i,
  /^(private\s+)?(air[- ]?conditioned\s+)?transfer\b/i,
  /^(you will be )?transferred\b/i,
  /^meet (and|&) (assist|greet)\b/i,
  /^(our|a) representative\b/i,
  /^(arrival at|upon (your )?arrival)\b/i,
  /^overnight\b/i,
  /^return\b/i,
  /^continue by\b/i,
  /^drive to\b/i,
  /^itinerary review\b/i,
  /^airport (greeting|greet)\b/i,
  /^optional\b/i,
]

/** Higher is better. <= 0 means "not worth putting on a one-page card". */
function scoreLine(line: string, siteWords: string[]): number {
  const l = line.trim()
  if (!l) return -99
  if (NO_START.some((re) => re.test(l))) return -99
  let score = 0
  if (ACTION.test(l)) score += 3
  if (siteWords.some((w) => l.toLowerCase().includes(w))) score += 2
  if (DEAD.test(l)) score -= 3
  if (l.length >= 40 && l.length <= 190) score += 1
  return score
}

/**
 * Compose a short, readable summary for a stay.
 *
 * Scores every line the agent wrote across the days in this block and keeps the best
 * couple, in itinerary order. Purely a re-arrangement of their words: nothing is
 * invented, so the sheet can never claim something the itinerary does not say. A
 * stay that is genuinely all logistics scores nothing and renders no paragraph at
 * all, which reads better than filler.
 */
export function summariseLines(
  lines: string[],
  siteNames: string[],
  maxSentences = 3,
): string[] {
  const siteWords = siteNames
    .map((x) => (x ?? '').trim().toLowerCase())
    .filter((x) => x.length > 3)

  type Cand = { text: string; score: number; order: number }
  const cands: Cand[] = []
  let order = 0
  for (const raw of lines) {
    const line = (raw ?? '').trim()
    order++
    if (!line) continue
    const score = scoreLine(line, siteWords)
    if (score <= 0) continue
    const text = line.replace(/\s+/g, ' ').replace(/[.;:,\s]+$/, '')
    if (!text) continue
    if (cands.some((c) => c.text.toLowerCase() === text.toLowerCase())) continue
    cands.push({ text, score, order })
  }

  const best = cands
    .slice()
    .sort((a, b) => (b.score - a.score) || (a.order - b.order))
    .slice(0, maxSentences)
    .sort((a, b) => a.order - b.order)

  return best.map((c) => c.text)
}

/**
 * Same selection, joined into a paragraph. Kept for the Segment model; the compact
 * sheet renders the lines as bullets instead.
 */
export function summarise(
  lines: string[],
  siteNames: string[],
  maxSentences = 3,
  maxChars = 420,
): string {
  const best = summariseLines(lines, siteNames, maxSentences)
  let text = best.join('. ')
  if (text) text += '.'
  if (text.length > maxChars) {
    const cut = text.slice(0, maxChars)
    const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf(' '))
    text = (stop > 60 ? cut.slice(0, stop) : cut).replace(/[.,;\s]+$/, '') + '…'
  }
  return text
}

/** Stay-block summary — kept for the Segment model; the sheet summarises by city. */
function composeBlurb(block: SegSourceDay[], maxSentences: number, maxChars: number): string {
  return summarise(
    block.flatMap((d) => (d.description ?? '').split('\n')),
    block.flatMap((d) => d.sites ?? []),
    maxSentences,
    maxChars,
  )
}

const firstNonEmpty = (block: SegSourceDay[], pick: (d: SegSourceDay) => string): string => {
  for (const d of block) {
    const v = (pick(d) ?? '').trim()
    if (v) return v
  }
  return ''
}

const stayKey = (d: SegSourceDay) => (d.hotel ?? '').trim().toLowerCase()

/**
 * Chronological runs of days sharing a hotel.
 *
 * A blank hotel means "still at the previous hotel" rather than "a new stay" —
 * agents typically write the hotel on the first day of a stay and leave the rest
 * blank, so a run is defined by where the hotel *changes*, not by where it appears.
 * With no hotel named anywhere we know nothing, so each day becomes its own block.
 */
function runsByStay(seq: SegSourceDay[]): number[][] {
  if (!seq.some(stayKey)) return seq.map((_, i) => [i])
  const runs: number[][] = []
  let cur: number[] = []
  let key = ''
  seq.forEach((d, i) => {
    const k = stayKey(d)
    if (!cur.length) { cur = [i]; key = k; return }
    // Blank continues the run; a run that started blank adopts the first hotel it meets.
    if (!k || !key || k === key) { cur.push(i); if (!key) key = k; return }
    runs.push(cur); cur = [i]; key = k
  })
  if (cur.length) runs.push(cur)
  return runs
}

/** The stay key a run belongs to (first non-blank hotel in it). */
function runKey(seq: SegSourceDay[], run: number[]): string {
  for (const i of run) { const k = stayKey(seq[i]); if (k) return k }
  return ''
}

/**
 * Which grouping to trust.
 *
 * Accommodation rows are aggregated *by destination*, not by chronological stay: a
 * trip that opens with 4 nights in Cairo and closes with 1 more night there is
 * entered as a single "5 nights Cairo" row. Walking those rows in order therefore
 * glues the closing night onto the opening stay and drags the wrong days into it.
 *
 * The per-day hotel field, by contrast, is genuinely chronological. So when the days
 * name at least as many distinct hotels as there are rows, they are the better source
 * of truth: group by them and use the rows only for destination labels. Otherwise the
 * day data is thinner than the rows and walking the rows is the best we can do.
 */
function shouldUseStayRuns(seq: SegSourceDay[], rows: SegHotel[]): boolean {
  if (!rows.length) return true
  const distinct = new Set(seq.map(stayKey).filter(Boolean)).size
  return distinct >= rows.length
}

/**
 * Walk the accommodation rows against the day sequence.
 * Row with `nights: 3` claims 3 days; any days left over at the end (typically the
 * departure day) are absorbed into the final block rather than dropped.
 */
function groupByHotelRows(seq: SegSourceDay[], hotels: SegHotel[]): number[][] {
  const groups: number[][] = []
  let i = 0
  for (const h of hotels) {
    if (i >= seq.length) break
    const take = Math.max(1, Math.min(h.nights || 1, seq.length - i))
    const idx: number[] = []
    for (let k = 0; k < take; k++) idx.push(i + k)
    groups.push(idx)
    i += take
  }
  if (i < seq.length) {
    if (groups.length) {
      for (; i < seq.length; i++) groups[groups.length - 1].push(i)
    } else {
      groups.push(seq.map((_, k) => k))
    }
  }
  return groups
}

export interface DeriveOptions {
  /** Max highlights per block before collapsing into "+N more". Default 12. */
  highlightCap?: number
  /** Max sentences pulled into a block's blurb. Default 2. */
  blurbSentences?: number
  /** Hard character cap on a blurb before it is trimmed. Default 210. */
  blurbChars?: number
  /** Flight / transfer text keyed by day uid, folded into the block that owns the day. */
  notesByUid?: Record<string, string[]>
}

/** Build the compact blocks from the builder's day sequence + accommodation rows. */
export function deriveSegments(
  seq: SegSourceDay[],
  hotels: SegHotel[],
  opts: DeriveOptions = {},
): Segment[] {
  if (!seq.length) return []
  const cap = opts.highlightCap ?? 12
  const notesByUid = opts.notesByUid ?? {}
  const blurbSentences = opts.blurbSentences ?? 2
  const blurbChars = opts.blurbChars ?? 210

  const rows = (hotels ?? []).filter((h) => (h?.nights ?? 0) > 0)
  const byStay = shouldUseStayRuns(seq, rows)
  const groups = byStay ? runsByStay(seq) : groupByHotelRows(seq, rows)

  /*
   * Nights per block.
   *
   * Walking rows: the row is authoritative.
   *
   * Grouping by stay run: count them off the days instead, because a destination's
   * row total can be split across several visits. Every day in a run contributes the
   * night that follows it, except the final day of the whole trip — that is the day
   * everyone flies home. So an opening Cairo run of days 1-4 is 4 nights, and a
   * closing Cairo run of days 11-12 is 1 night, which is exactly the 4 + 1 hiding
   * inside a single "5 nights Cairo" row.
   */
  const lastDay = seq.length - 1
  const nightsPerGroup: number[] = byStay
    ? groups.map((idx) => Math.max(0, idx.length - (idx.indexOf(lastDay) >= 0 ? 1 : 0)))
    : groups.map((idx, gi) => (gi < rows.length ? rows[gi].nights : Math.max(0, idx.length - 1)))

  // Keep the blocks summing to the quoted night count even if the day data disagrees,
  // so the blocks can never contradict the "11 Nights" stat on the same page.
  if (byStay && rows.length && nightsPerGroup.length) {
    const target = rows.reduce((n, r) => n + r.nights, 0)
    const got = nightsPerGroup.reduce((n, v) => n + v, 0)
    if (target !== got) {
      const last = nightsPerGroup.length - 1
      nightsPerGroup[last] = Math.max(0, nightsPerGroup[last] + (target - got))
    }
  }

  /*
   * Destination labels. Assign rows to runs in order, but remember each stay key so a
   * return visit reuses the label it had the first time round: [Cairo hotel, cruise,
   * resort, Cairo hotel] against rows [Cairo, Nile Cruise, Hurghada] gives the fourth
   * block "Cairo" again rather than falling off the end of the row list.
   */
  const destByKey = new Map<string, string>()
  if (byStay && rows.length) {
    let ri = 0
    for (const idx of groups) {
      const k = runKey(seq, idx)
      if (!k || destByKey.has(k)) continue
      if (ri < rows.length) { destByKey.set(k, rows[ri].destination); ri++ }
    }
  }

  return groups.map((idx, gi) => {
    const block = idx.map((i) => seq[i])
    const from = idx[0]
    const to = idx[idx.length - 1]
    const nights = nightsPerGroup[gi] ?? 0

    const stay = firstNonEmpty(block, (d) => d.hotel)
    const rowDest = byStay
      ? (destByKey.get(runKey(seq, idx)) ?? '')
      : (gi < rows.length ? rows[gi].destination : rows.length ? rows[rows.length - 1].destination : '')
    const destination = (rowDest ?? '').trim() || stay || block[0].title || 'Egypt'

    const label = nights > 0
      ? `${nights} ${plural(nights, 'Night', 'Nights')}`
      : `${block.length} ${plural(block.length, 'Day', 'Days')}`

    const notes: string[] = []
    for (const d of block) for (const t of notesByUid[d.uid] ?? []) if (t) notes.push(t)

    return {
      key: `seg-${gi}`,
      label,
      dayRange: rangeLabel(from, to),
      nights,
      dayFrom: from,
      dayTo: to,
      destination,
      blurb: composeBlurb(block, blurbSentences, blurbChars),
      highlights: mergeHighlights(block, cap),
      stay: stay || destination,
      meals: summariseMeals(block),
      photo: firstNonEmpty(block, (d) => d.photo),
      notes,
    }
  })
}

/** Layer the user's per-block edits over the derived blocks (aligned by index). */
export function applyOverrides(auto: Segment[], overrides?: SegmentOverride[]): Segment[] {
  if (!overrides?.length) return auto
  return auto.map((s, i) => {
    const o = overrides[i]
    if (!o) return s
    const out: Segment = { ...s }
    if (o.label !== undefined) out.label = o.label
    if (o.destination !== undefined) out.destination = o.destination
    if (o.blurb !== undefined) out.blurb = o.blurb
    if (o.highlights !== undefined) out.highlights = o.highlights
    if (o.stay !== undefined) out.stay = o.stay
    if (o.meals !== undefined) out.meals = o.meals
    if (o.photo !== undefined) out.photo = o.photo
    if (o.hidden !== undefined) out.hidden = o.hidden
    return out
  })
}
