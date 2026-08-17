/**
 * Paste-a-text-block itineraries: the parser and the page packer.
 *
 * Text goes in, a small number of dense A4 pages come out. Nothing here touches the DOM,
 * so it is unit-testable in node — which is how it is verified.
 *
 * TWO THINGS THAT ARE NOT NEGOTIABLE, both learned the hard way:
 *
 * 1. THE TEXT FLOWS. Days run one after another down the page and a new day does not start
 *    a new page. A fifteen-day programme is two or three sheets, not fifteen. The first
 *    version of this file put one day per page and produced fifteen sheets each holding
 *    four lines — do not go back to it.
 * 2. THE PAGES ARE STORED, NOT RECOMPUTED. The public renderer lives in the other repo
 *    (seif8545/egypt-top-light) and prints `pages` verbatim, so no parser is duplicated
 *    across the two — the mistake §12 paid for twice. Change anything here and the affected
 *    documents keep their old layout until they are re-saved.
 */

/* ---------- the printable item stream ---------- */

export type Item =
  /** A day heading: "Day 3" plus whatever followed it on the line. */
  | { t: 'day'; label: string; title: string }
  /** One paragraph or bullet of prose. */
  | { t: 'p'; text: string }
  /** The meals / stay strip that closes a day. */
  | { t: 'chips'; meals: string[]; stay: string }
  /** A section heading: What's Included, Not Included, Package Rates. */
  | { t: 'h'; text: string }
  /** Included and excluded side by side; either side may be empty. */
  | { t: 'two'; leftTitle: string; left: string[]; rightTitle: string; right: string[] }
  /** The offered-packages table that closes the document. */
  | { t: 'table'; rows: OfferRow[] }

export interface OfferRow {
  /** "4 Star", "5 Star Deluxe" — whatever followed the word OFFERED. */
  category: string
  /** The price line as written: "$ 5720 USD per person in Double Occupancy". */
  rate: string
  /** One line per property, links stripped down to the hotel name. */
  hotels: string[]
}

export interface TextPage {
  /** Type scale chosen by the packer so the whole document lands inside `maxPages`. */
  scale: number
  items: Item[]
}

export interface TextDocData {
  title: string
  text: string
  /** 0 to 4 photo paths, document-level, stacked down the left column of every page. */
  photos: string[]
  /** Page target the packer was given, kept so a re-save reproduces the same document. */
  maxPages?: number
  /**
   * Left-column photo width as a percentage, measured in the browser and stored so the public
   * renderer can reproduce it — nothing on the edge can size an image, and CSS alone cannot
   * cap a stack's height without cropping or distorting it. Absent means full width.
   */
  photoWidthPct?: number
  pages: TextPage[]
}

/* ---------- line classifiers ---------- */

/**
 * A day heading, in every shape an agent actually types. The number is the only required
 * part; everything after it is the title.
 *   Day 1 · DAY 01 · Day1 · day 3: · Day 2 – Cairo · DAY 04 | GIZA • GEM · **Day 5**
 */
const DAY_RE = /^[\s>*_#\-•·"']*day\s*[\s:.#)|\-–—]*(\d{1,3})\b(.*)$/i

/** `Meals : No meals`, `Meals: Breakfast – Lunch – Dinner`, `Meal – B/D`. */
const MEAL_RE = /^[\s>*_#\-•·]*(?:included\s+)?meals?\s*[:\-–—]\s*(.+)$/i

/**
 * The stay line, with or without a colon. `Overnight in Cairo.` is how these itineraries
 * are actually written, so it is matched bare too.
 */
const STAY_RE = /^[\s>*_#\-•·]*(?:stay|hotel|hotels|accommodation|accommodations|overnight|lodging)\s*(?:[:\-–—]\s*|\s+(?=\w))(.+)$/i

/** Every way the two lists get labelled. Bare "Included" / "Excluded" included. */
const INC_RE = /^[\s>*_#\-•·]*(?:what'?s\s+)?inclusions?|^[\s>*_#\-•·]*included(?:\s+(?:services?|items?))?\s*:?\s*$/i
const EXC_RE = /^[\s>*_#\-•·]*(?:what'?s\s+)?exclusions?|^[\s>*_#\-•·]*(?:not\s+included|excluded)(?:\s+(?:services?|items?))?\s*:?\s*$/i

/** `OFFERED 4 Star package :` → category "4 Star". */
const OFFER_RE = /^[\s>*_#\-•·]*offer(?:ed|ing)?\s*[:\-–—]?\s*(.*?)\s*(?:package|programme|program|option)?\s*:?\s*$/i

/** A price line inside an offer block: `Rate per person in Double Occupancy $ 5720 USD`. */
const RATE_RE = /(?:rate|price|per\s+person|pp\b)/i

/**
 * Keep the money, drop the boilerplate.
 *
 * "Rate per person in Double Occupancy $ 5720 USD" becomes "5,720 USD", because the table
 * column already says *per person, double* and repeating it in every cell pushes the hotel
 * column off the page. If no figure can be found the line is kept verbatim — a rate the
 * reader can see and query beats a blank cell.
 */
function tidyRate(line: string): string {
  const m = /(?:\$|usd|eur|egp|Â£|€)?\s*([\d][\d, ]{2,})(?:\.(\d{1,2}))?\s*(usd|eur|egp|\$|€)?/i.exec(line)
  if (!m) return line
  const n = Number(m[1].replace(/[,\s]/g, ''))
  if (!Number.isFinite(n) || n <= 0) return line
  const cur = (m[3] || (/\$/.test(line) ? 'USD' : '') || 'USD').toUpperCase().replace('$', 'USD')
  return `${n.toLocaleString('en-US')}${m[2] ? '.' + m[2] : ''} ${cur}`
}

const stripMark = (s: string) => s.replace(/^[\s>*_#\-–—•·]+/, '').replace(/\s+$/, '')
const stripSep = (s: string) => s.replace(/^[\s:–—\-|•·.,)]+/, '').replace(/[\s|]+$/, '')

/** Their `II` is a separator, not a word; a bare `|` is one too. */
const tidyTitle = (s: string) => stripSep(s)
  .replace(/\s+I{2,}\s+/g, ' — ')
  .replace(/\s*\|\s*/g, ' • ')
  .replace(/\s{2,}/g, ' ')

/**
 * Hotel lines carry pasted booking URLs that are longer than the line itself. Keep the
 * name and the "or similar", drop the URL — a printed page cannot be clicked anyway.
 */
const stripUrls = (s: string) => s
  .replace(/https?:\/\/\S+/gi, '')
  .replace(/\s{2,}/g, ' ')
  .replace(/\s*[-–—,]\s*$/, '')
  .trim()

const MEAL_WORDS: [RegExp, string][] = [
  [/\bbreakfasts?\b|\bb\/?b\b|(?:^|[^a-z])b(?:[^a-z]|$)/i, 'Breakfast'],
  [/\blunch(?:es)?\b|(?:^|[^a-z])l(?:[^a-z]|$)/i, 'Lunch'],
  [/\bdinner|\bsupper|(?:^|[^a-z])d(?:[^a-z]|$)/i, 'Dinner'],
]

/**
 * "B/L/D", "Breakfast – Lunch – Dinner", "half board" → chips. "No meals" is passed
 * through as written: an unrecognised phrase must stay visible, because a wrong meal line
 * can be corrected in the text and a silently dropped one cannot.
 */
export function parseMeals(raw: string): string[] {
  const s = raw.trim().replace(/\s+$/, '')
  if (!s) return []
  if (/^\s*(no|none|nil)\b/i.test(s)) return ['No meals']
  if (/full\s*board|all[\s-]*inclusive|\bfb\b|\bai\b/i.test(s)) return ['Breakfast', 'Lunch', 'Dinner']
  if (/half\s*board|\bhb\b/i.test(s)) return ['Breakfast', 'Dinner']
  const out = MEAL_WORDS.filter(([re]) => re.test(s)).map(([, label]) => label)
  return out.length ? out : [s.replace(/\.$/, '')]
}

/* ---------- the document ---------- */

export interface ParsedDay { label: string; title: string; bullets: string[]; meals: string[]; stay: string }

export interface ParsedDoc {
  title: string
  /** Prose before the first day heading. */
  lead: string[]
  days: ParsedDay[]
  included: string[]
  excluded: string[]
  offers: OfferRow[]
}

/**
 * Split the block into days and the sections that follow them.
 *
 * A single left-to-right pass with a mode flag, because the tail of these documents is
 * positional: everything after INCLUDED SERVICES belongs to that list until the next
 * heading appears. Trying to classify each line independently misfiles half of them.
 */
export function parseDoc(text: string): ParsedDoc {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n')
  const doc: ParsedDoc = { title: '', lead: [], days: [], included: [], excluded: [], offers: [] }
  type Mode = 'lead' | 'day' | 'inc' | 'exc' | 'offer'
  let mode: Mode = 'lead'
  let day: ParsedDay | null = null
  let offer: OfferRow | null = null

  for (const rawLine of lines) {
    const dm = DAY_RE.exec(rawLine)
    if (dm) {
      day = { label: `Day ${dm[1].replace(/^0+(?=\d)/, '')}`, title: tidyTitle(dm[2] || ''), bullets: [], meals: [], stay: '' }
      doc.days.push(day)
      mode = 'day'
      continue
    }

    const line = stripMark(rawLine)
    if (!line) continue

    // Section headings are only recognised once the days are done, so a stray "Included"
    // inside a day's prose cannot swallow the rest of the itinerary.
    if (doc.days.length) {
      if (EXC_RE.test(line)) { mode = 'exc'; continue }
      if (INC_RE.test(line)) { mode = 'inc'; continue }
      const om = OFFER_RE.exec(line)
      if (om && /\b(star|deluxe|standard|superior|luxury|budget|category)\b/i.test(line)) {
        offer = { category: tidyTitle(om[1] || 'Package').replace(/\s*package\s*$/i, ''), rate: '', hotels: [] }
        doc.offers.push(offer)
        mode = 'offer'
        continue
      }
    }

    if (mode === 'inc') { doc.included.push(line.replace(/\.$/, '')); continue }
    if (mode === 'exc') { doc.excluded.push(line.replace(/\.$/, '')); continue }
    if (mode === 'offer' && offer) {
      const clean = stripUrls(line)
      if (!clean) continue
      if (!offer.rate && RATE_RE.test(clean)) offer.rate = tidyRate(clean)
      else offer.hotels.push(clean)
      continue
    }

    const target = mode === 'day' && day ? day : null
    const meal = MEAL_RE.exec(line)
    if (meal) { if (target) target.meals = parseMeals(meal[1]); continue }
    const stay = STAY_RE.exec(line)
    if (stay && target) {
      // "Overnight in Cairo" / "Overnight at a desert camp" — the chip wants the place.
      target.stay = stripSep(stay[1]).replace(/^(?:in|at|on|beside|near)\s+/i, '').replace(/\.$/, '')
      continue
    }
    if (target) target.bullets.push(line)
    else if (!doc.title) doc.title = line
    else doc.lead.push(line)
  }

  if (!doc.title) doc.title = doc.days.length ? 'Itinerary' : 'Untitled'
  return doc
}

/* ---------- geometry ---------- */

export const PAGE_W = 794
export const PAGE_H = 1123
export const COL_TEXT = 496          // the centre column, px — see TextDoc.tsx
/** Base body size at scale 1. The packer scales around this to hit the page target. */
export const BASE_FS = 10
export const LINE_H = 1.5
/** Measured in Chromium against the real stylesheet: justified body text averages ~0.55em
 *  of advance per character. Only ever an opening guess — see `packMeasured`. */
const CHAR_EM = 0.55
/** Usable column height, and the same minus the document title block on page 1. */
export const AVAIL = 975
export const AVAIL_FIRST = 903

const lines = (s: string, fs: number, w = COL_TEXT) =>
  Math.max(1, Math.ceil(s.length / Math.max(8, Math.floor(w / (fs * CHAR_EM)))))

/** Estimated printed height of one item at a given type scale. */
function itemH(it: Item, k: number): number {
  const fs = BASE_FS * k
  const lh = fs * LINE_H
  switch (it.t) {
    case 'day': {
      const labelH = fs * 1.75 + 2
      const titleH = it.title ? lines(it.title, fs * 0.92) * (fs * 0.92 * 1.35) : 0
      return labelH + titleH + fs * 1.5 + 6      // + rule and margins
    }
    case 'p':
      return lines(it.text, fs) * lh + fs * 0.42
    case 'chips':
      return fs * 1.6 + 8
    case 'h':
      return fs * 1.5 + fs * 1.6 + 8
    case 'two': {
      const w = (COL_TEXT - 18) / 2
      const side = (xs: string[]) => xs.reduce((s, x) => s + lines(x, fs * 0.94, w) * (fs * 0.94 * 1.42) + 3, 0)
      return fs * 1.9 + Math.max(side(it.left), side(it.right)) + 12
    }
    case 'table': {
      const cat = 96, rate = 118, hotels = COL_TEXT - cat - rate - 16
      const rowH = (r: OfferRow) => Math.max(
        lines(r.category, fs, cat) * lh,
        lines(r.rate, fs, rate) * lh,
        r.hotels.reduce((s, h) => s + lines(h, fs * 0.94, hotels) * (fs * 0.94 * 1.4), 0),
      ) + 12
      return fs * 2.2 + it.rows.reduce((s, r) => s + rowH(r), 0) + 10
    }
  }
}

/** The document as one flat stream, in print order. */
export function streamOf(doc: ParsedDoc): Item[] {
  const out: Item[] = []
  for (const l of doc.lead) out.push({ t: 'p', text: l })
  for (const d of doc.days) {
    out.push({ t: 'day', label: d.label, title: d.title })
    for (const b of d.bullets) out.push({ t: 'p', text: b })
    if (d.meals.length || d.stay) out.push({ t: 'chips', meals: d.meals, stay: d.stay })
  }
  if (doc.included.length || doc.excluded.length) {
    out.push({ t: 'h', text: 'What is included' })
    out.push({
      t: 'two',
      leftTitle: 'Included', left: doc.included,
      rightTitle: 'Not included', right: doc.excluded,
    })
  }
  if (doc.offers.length) {
    out.push({ t: 'h', text: 'Offered packages' })
    out.push({ t: 'table', rows: doc.offers })
  }
  return out
}

/**
 * Pack a stream onto pages, given each item's height in order.
 *
 * A day heading is never left alone at the foot of a page: if its first paragraph will not
 * follow it, both move on together. Everything else may break anywhere, which is the whole
 * point of flowing text.
 *
 * Heights are a parameter rather than computed here so the browser can supply MEASURED ones
 * — see `packMeasured`. The estimator below is only the opening guess.
 */
export function packWithHeights(stream: Item[], heights: number[], k: number): TextPage[] {
  const pages: TextPage[] = []
  let cur: Item[] = []
  let h = 0
  const room = () => (pages.length === 0 ? AVAIL_FIRST : AVAIL)
  const flush = () => { pages.push({ scale: k, items: cur }); cur = []; h = 0 }
  const at = (i: number) => (Number.isFinite(heights[i]) ? heights[i] : 0)

  for (let i = 0; i < stream.length; i++) {
    let need = at(i)
    // Keep a heading with the first line under it.
    if (stream[i].t === 'day' && stream[i + 1] && stream[i + 1].t === 'p') need += at(i + 1)
    if (cur.length && h + need > room()) flush()
    cur.push(stream[i])
    h += at(i)
  }
  if (cur.length) flush()
  return pages
}

const packAt = (stream: Item[], k: number): TextPage[] =>
  packWithHeights(stream, stream.map((it) => itemH(it, k)), k)

/**
 * The browser-measured version: `measure(k)` renders the whole stream at that scale and
 * returns each item's real height, so the page count is decided by the actual wrapped text
 * in the actual fonts rather than by an estimate.
 *
 * This matters because the estimate cannot be right: the sandbox has no Inter, Inter is
 * narrower than the fallback, and a 10% error in characters-per-line is the difference
 * between three pages and four. The estimator stays as the value used before the first
 * measurement lands, and as the answer for any caller with no DOM.
 */
export function packMeasured(
  stream: Item[],
  measure: (k: number) => number[],
  maxPages: number = DEFAULT_MAX_PAGES,
): TextPage[] {
  const cap = Math.max(1, Math.min(24, Math.floor(maxPages) || DEFAULT_MAX_PAGES))
  let last: TextPage[] = []
  for (const k of SCALES) {
    last = packWithHeights(stream, measure(k), k)
    if (last.length <= cap) return last
  }
  return last
}

/**
 * Type scales tried largest first. 15px down to 7px against a 10px base — 7px is the floor
 * at which a printed A4 is still comfortably readable, and 15px the ceiling past which a
 * short programme starts looking like a poster.
 */
export const SCALES = [1.5, 1.4, 1.3, 1.2, 1.12, 1.05, 1, 0.95, 0.9, 0.86, 0.82, 0.78, 0.74, 0.7]

export const DEFAULT_MAX_PAGES = 3

/**
 * The largest type that still fits the document into `maxPages`.
 *
 * Chosen by packing at each scale rather than by predicting one, because the answer is not
 * monotonic in any single measurement — the day headings and the two-column list block
 * scale differently from the prose. When even the smallest scale overruns, the smallest is
 * used and the document simply runs longer: too many pages is a judgement call, text cut
 * off the bottom of a fixed-height page is a bug.
 */
export function buildPages(text: string, maxPages: number = DEFAULT_MAX_PAGES): TextPage[] {
  const stream = streamOf(parseDoc(text))
  if (!stream.length) return []
  const cap = Math.max(1, Math.min(24, Math.floor(maxPages) || DEFAULT_MAX_PAGES))
  let last: TextPage[] = []
  for (const k of SCALES) {
    last = packAt(stream, k)
    if (last.length <= cap) return last
  }
  return last
}

/**
 * The document's own name, taken from the text.
 *
 * Only lines BEFORE the first day heading can supply it — reading "the first non-day line"
 * anywhere in the file made a programme that opens straight with `DAY 01` title itself with
 * its own first bullet ("Arrival at Cairo International Airport, meet and assist…"). When
 * there is nothing before the days, the document is simply unnamed until someone names it.
 */
export function guessTitle(text: string): string {
  return parseDoc(text).title.slice(0, 120)
}
