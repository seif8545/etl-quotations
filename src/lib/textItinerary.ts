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
  /**
   * One entry per text column. Always a single entry now — see `colWidth` — but kept as an
   * array so the renderers do not have to change if that is ever revisited.
   */
  cols: Item[][]
}

export interface TextDocData {
  title: string
  text: string
  /** 0 to 4 photo paths, document-level, stacked down the left column of every page. */
  photos: string[]
  /** Body type scale the document was built at, so a re-save reproduces it. */
  scale?: number
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
/** Text measure with the photo column present, and without it. See TextDoc.tsx. */
export const COL_TEXT = 496
export const COL_TEXT_WIDE = 646
/** Gutter between the two text columns. */
export const COL_GAP = 18

/**
 * The width the text column actually gets: wider when there are no photos to make room for.
 *
 * ONE COLUMN, ALWAYS. Two columns was tried and rejected — it buys page count at the cost of a
 * newspaper look, and the decision is that readable type across a single measure is worth extra
 * sheets. The `columns` argument survives only so `packWithHeights` stays general; nothing
 * calls it with 2.
 */
export function colWidth(columns: number, hasPhotos: boolean): number {
  const total = hasPhotos ? COL_TEXT : COL_TEXT_WIDE
  return columns >= 2 ? Math.floor((total - COL_GAP) / 2) : total
}
/** Base body size at scale 1. The packer scales around this to hit the page target. */
export const BASE_FS = 10
export const LINE_H = 1.5
/** Measured in Chromium against the real stylesheet: justified body text averages ~0.55em
 *  of advance per character. Only ever an opening guess — see `packMeasured`. */
const CHAR_EM = 0.55
/** Usable column height, and the same minus the document title block on page 1. */
export const AVAIL = 975
export const AVAIL_FIRST = 903

const lines = (s: string, fs: number, w: number = COL_TEXT) =>
  Math.max(1, Math.ceil(s.length / Math.max(8, Math.floor(w / (fs * CHAR_EM)))))

/** Estimated printed height of one item at a given type scale and column width. */
function itemH(it: Item, k: number, w: number = COL_TEXT): number {
  const fs = BASE_FS * k
  const lh = fs * LINE_H
  switch (it.t) {
    case 'day': {
      const labelH = fs * 1.75 + 2
      const titleH = it.title ? lines(it.title, fs * 0.92, w) * (fs * 0.92 * 1.35) : 0
      return labelH + titleH + fs * 1.5 + 6      // + rule and margins
    }
    case 'p':
      return lines(it.text, fs, w) * lh + fs * 0.42
    case 'chips':
      return fs * 1.6 + 8
    case 'h':
      return fs * 1.5 + fs * 1.6 + 8
    case 'two': {
      const half = (w - 18) / 2
      const side = (xs: string[]) => xs.reduce((s, x) => s + lines(x, fs * 0.94, half) * (fs * 0.94 * 1.42) + 3, 0)
      return fs * 1.9 + Math.max(side(it.left), side(it.right)) + 12
    }
    case 'table': {
      const cat = 96, rate = 118, hotels = Math.max(80, w - cat - rate - 16)
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
 * Pack a stream into columns and pages, given each item's height in order.
 *
 * Columns fill left to right, pages top to bottom: with `columns = 2` the reader goes down the
 * left column and back up to the right, like a magazine. The title block on page 1 spans the
 * full width, so every column on that page is shorter.
 *
 * A day heading is never left alone at the foot of a column: if its first paragraph will not
 * follow it, both move on together. Everything else may break anywhere, which is the whole
 * point of flowing text.
 *
 * Heights are a parameter rather than computed here so the browser can supply MEASURED ones at
 * the real column width — see `packMeasured`. The estimator is only the opening guess.
 */
export function packWithHeights(stream: Item[], heights: number[], k: number, columns = 1): TextPage[] {
  const n = Math.max(1, Math.min(2, Math.floor(columns) || 1))
  const pages: TextPage[] = []
  let page: Item[][] = []
  let cur: Item[] = []
  let h = 0
  const at = (i: number) => (Number.isFinite(heights[i]) ? heights[i] : 0)
  const room = () => (pages.length === 0 ? AVAIL_FIRST : AVAIL)
  const endCol = () => {
    page.push(cur); cur = []; h = 0
    if (page.length >= n) { pages.push({ scale: k, cols: page }); page = [] }
  }

  for (let i = 0; i < stream.length; i++) {
    let need = at(i)
    if (stream[i].t === 'day' && stream[i + 1] && stream[i + 1].t === 'p') need += at(i + 1)
    if (cur.length && h + need > room()) endCol()
    cur.push(stream[i])
    h += at(i)
  }
  if (cur.length) endCol()
  // A half-filled last page still needs its remaining column to exist, so the renderer can
  // lay out the pair and the reader does not see a lone column stretched across the sheet.
  if (page.length) { while (page.length < n) page.push([]); pages.push({ scale: k, cols: page }) }
  return pages
}

const packAt = (stream: Item[], k: number, columns = 1): TextPage[] =>
  packWithHeights(stream, stream.map((it) => itemH(it, k, colWidth(columns, true))), k, columns)

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
  scale: number = DEFAULT_SCALE,
): TextPage[] {
  const k = Number(scale) > 0 ? Number(scale) : DEFAULT_SCALE
  return packWithHeights(stream, measure(k), k, 1)
}

/**
 * Body type sizes offered in the builder, against the 10px base.
 *
 * The page count is NOT a constraint any more, it is an outcome: the size is chosen, the
 * document runs as long as it runs. Shrinking type to hit a page target is how a fifteen-day
 * programme ended up at 7.4px, which read as unusable in a PDF. Four or five readable sheets
 * beat three unreadable ones.
 */
export const SIZE_CHOICES: { label: string; scale: number }[] = [
  { label: 'Compact — 11px', scale: 1.1 },
  { label: 'Normal — 12.5px', scale: 1.25 },
  { label: 'Comfortable — 14px', scale: 1.4 },
  { label: 'Large — 16px', scale: 1.6 },
]

export const DEFAULT_SCALE = 1.25

/**
 * Pack at the chosen type size, using heights measured in the browser.
 *
 * `measure(k)` renders the whole stream at that scale in the real fonts and returns each item's
 * real height. The estimate cannot be trusted on its own — the sandbox has no Inter, Inter is
 * narrower than the fallback, and a ten percent error in characters-per-line moves a page break
 * — so the estimator only fills in before the first measurement lands.
 */
export function buildPages(text: string, scale: number = DEFAULT_SCALE): TextPage[] {
  const stream = streamOf(parseDoc(text))
  if (!stream.length) return []
  return packAt(stream, Number(scale) > 0 ? Number(scale) : DEFAULT_SCALE, 1)
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
