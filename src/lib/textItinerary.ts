/**
 * Paste-a-text-block itineraries: the parser and the pagination model.
 *
 * A single block of prose comes in, day headings are found inside it, and what comes
 * out is a list of A4 pages ready to print. Nothing here touches the DOM, so it is
 * unit-testable in node — which is how it was verified (see the handoff section).
 *
 * WHY THE PAGES ARE STORED AND NOT RECOMPUTED: the public renderer for these documents
 * lives in the OTHER repo (seif8545/egypt-top-light). Rather than duplicate this parser
 * there — the mistake the price-column work paid for twice — the app saves the finished
 * `pages` array into the row and the website prints it verbatim. Change anything in this
 * file and existing documents keep their old pagination until they are re-saved.
 */

export interface TextDay {
  /** Day number as written, or null for the block of text before the first day heading. */
  n: number | null
  /** The heading exactly as it will be printed: "Day 1", "Day 01 — 26 July", "Overview". */
  label: string
  /** Whatever followed the day number on the heading line, separators stripped. */
  title: string
  bullets: string[]
  /** Normalised to Breakfast / Lunch / Dinner where recognisable, else the raw phrase. */
  meals: string[]
  /** Hotel, camp, boat — the "where you sleep" line. */
  stay: string
}

export interface TextPage {
  label: string
  title: string
  /** 1-based, and `parts` > 1 means this day had to be continued onto another page. */
  part: number
  parts: number
  bullets: string[]
  meals: string[]
  stay: string
  /** Type scale applied by the fit pass in TextDoc; 1 until it runs. */
  scale: number
}

export interface TextDocData {
  title: string
  text: string
  /** 0 to 4 photo paths, document-level, stacked down the left column of every page. */
  photos: string[]
  pages: TextPage[]
}

/**
 * A day heading, in every shape a travel agent actually types.
 *
 * Matches at the start of a line, tolerating a leading bullet or quote mark:
 * `Day 1`, `DAY 01`, `Day1`, `day 3:`, `Day 2 – Cairo`, `Day 04 (28 July) Luxor`,
 * `**Day 5**`, `Day 1 - Monday 26 July - Giza`. The number is the only required part;
 * everything after it is the title, and `Day 1-2` simply reads as Day 1 with "-2" in
 * the title, which prints correctly and is better than refusing to split.
 */
const DAY_RE = /^[\s>*_#\-•·"']*day\s*[\s:.#)\-–—]*(\d{1,3})\b(.*)$/i

/** `Meals: Breakfast & Dinner`, `Meal – B/D`, `Included meals: half board`. */
const MEAL_RE = /^[\s>*_#\-•·]*(?:included\s+)?meals?\s*[:\-–—]\s*(.+)$/i

/**
 * The stay line, with or without a colon.
 *
 * `Overnight in Cairo.` is how these itineraries are actually written, so it is matched
 * bare as well — the cost is that a sentence beginning "Overnight" leaves the prose and
 * becomes the stay chip, which is where the reader looks for it anyway.
 */
const STAY_RE = /^[\s>*_#\-•·]*(?:stay|hotel|hotels|accommodation|accommodations|overnight|lodging)\s*(?:[:\-–—]\s*|\s+(?=\w))(.+)$/i

/** Leading list marks and separators that should not survive into printed text. */
const stripMark = (s: string) => s.replace(/^[\s>*_#\-–—•·]+/, '').replace(/\s+$/, '')
const stripSep = (s: string) => s.replace(/^[\s:–—\-|.,)·]+/, '').replace(/\s+$/, '')

const MEAL_WORDS: [RegExp, string][] = [
  [/\bbreakfasts?\b|\bb\/?b\b|(?:^|[^a-z])b(?:[^a-z]|$)/i, 'Breakfast'],
  [/\blunch(?:es)?\b|(?:^|[^a-z])l(?:[^a-z]|$)/i, 'Lunch'],
  [/\bdinner|\bsupper|\bh\/?b\b|(?:^|[^a-z])d(?:[^a-z]|$)/i, 'Dinner'],
]

/**
 * "B/L/D", "breakfast and dinner", "half board" → chips.
 *
 * Full board and all-inclusive imply all three; anything unrecognisable is passed
 * through as written rather than dropped, because a wrong-but-visible meal line can be
 * corrected in the text and a silently missing one cannot.
 */
export function parseMeals(raw: string): string[] {
  const s = raw.trim()
  if (!s) return []
  if (/full\s*board|all[\s-]*inclusive|\bfb\b|\bai\b/i.test(s)) return ['Breakfast', 'Lunch', 'Dinner']
  const out = MEAL_WORDS.filter(([re]) => re.test(s)).map(([, label]) => label)
  if (/half\s*board|\bhb\b/i.test(s) && !out.length) return ['Breakfast', 'Dinner']
  return out.length ? out : [s.replace(/\.$/, '')]
}

/** Split the block into days. The text before the first `Day n` becomes an intro block. */
export function parseDays(text: string): TextDay[] {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n')
  const days: TextDay[] = []
  let cur: TextDay | null = null

  const open = (n: number | null, label: string, title: string): TextDay => {
    const d: TextDay = { n, label, title, bullets: [], meals: [], stay: '' }
    days.push(d)
    return d
  }

  for (const rawLine of lines) {
    const m = DAY_RE.exec(rawLine)
    if (m) {
      const n = Number(m[1])
      const rest = stripSep(m[2] || '')
      // Keep any date the agent typed in the heading: it belongs on the page, not in prose.
      cur = open(n, `Day ${m[1].replace(/^0+(?=\d)/, '')}`, rest)
      continue
    }
    const line = stripMark(rawLine)
    if (!line) continue
    if (!cur) cur = open(null, '', '')

    const meal = MEAL_RE.exec(line)
    if (meal) { cur.meals = parseMeals(meal[1]); continue }
    const stay = STAY_RE.exec(line)
    // `Overnight in Cairo.` yields "in Cairo" from the capture; the chip wants the place.
    if (stay) { cur.stay = stripSep(stay[1]).replace(/^in\s+/i, '').replace(/\.$/, ''); continue }
    cur.bullets.push(line)
  }

  // An intro block with no prose in it is noise, not a page.
  return days.filter((d) => d.bullets.length || d.meals.length || d.stay || d.title)
}

/* ---------- pagination ---------- */

/**
 * The geometry the estimate is built on. These mirror the CSS in TextDoc.tsx and must
 * move together with it — the fit pass in the browser is the safety net, not the plan.
 */
export const PAGE_H = 1123
export const BODY_W = 430          // the centre column, px
export const BODY_H = 806          // what is left after the brand pill, title and footer
export const BASE_FS = 15          // px; sized so an ordinary day fills about one A4 page
export const LINE_H = 1.62
export const PARA_GAP = 9          // px between bullets
export const CPL = Math.floor(BODY_W / (BASE_FS * 0.5))  // ~57 characters per line

const linesOf = (s: string) => Math.max(1, Math.ceil(s.length / CPL))
const heightOf = (s: string) => linesOf(s) * BASE_FS * LINE_H + PARA_GAP

/**
 * Break a paragraph that is taller than a whole page into sentence groups that fit.
 *
 * Someone pasting from Word arrives with a day as one 3,000-character paragraph, and a
 * paragraph is the smallest unit the page packer can move — so without this the packer
 * puts an unsplittable block on one page and the bottom half is simply gone. Splits on
 * sentence ends only; a single sentence longer than a page is left alone for the fit pass
 * to shrink, because breaking mid-sentence looks like a bug.
 */
function splitToFit(text: string, avail: number): string[] {
  if (heightOf(text) <= avail) return [text]
  const sentences = text.split(/(?<=[.!?…])\s+/)
  const out: string[] = []
  let buf = ''
  for (const s of sentences) {
    const next = buf ? buf + ' ' + s : s
    if (buf && heightOf(next) > avail) { out.push(buf); buf = s } else buf = next
  }
  if (buf) out.push(buf)
  return out
}

/**
 * One day to one page where it fits, and a continued page where it does not.
 *
 * The estimate is deliberately conservative: overshooting costs a page break that reads
 * fine, while undershooting costs text clipped off the bottom of a fixed-height page with
 * nothing in the console — the failure this whole codebase has already paid for twice
 * (see the handoff on day pages and on the inclusions page).
 */
export function paginate(days: TextDay[]): TextPage[] {
  const pages: TextPage[] = []
  for (const d of days) {
    // The meals/stay strip only exists on the last page of a day, so budget for it there.
    const footStrip = d.meals.length || d.stay ? 52 : 0
    const avail = BODY_H - footStrip
    const chunks: string[][] = []
    let cur: string[] = []
    let h = 0
    for (const raw of d.bullets) {
      for (const b of splitToFit(raw, avail)) {
        const bh = heightOf(b)
        if (cur.length && h + bh > avail) { chunks.push(cur); cur = []; h = 0 }
        cur.push(b)
        h += bh
      }
    }
    chunks.push(cur)
    chunks.forEach((bullets, i) => {
      const last = i === chunks.length - 1
      pages.push({
        label: d.label, title: d.title,
        part: i + 1, parts: chunks.length,
        bullets,
        meals: last ? d.meals : [],
        stay: last ? d.stay : '',
        scale: 1,
      })
    })
  }
  return pages
}

export const buildPages = (text: string): TextPage[] => paginate(parseDays(text))

/** First non-empty line of the block, so a document names itself if nobody names it. */
export function guessTitle(text: string): string {
  const first = String(text || '').split('\n').map((l) => stripMark(l)).find((l) => l && !DAY_RE.test(l))
  return (first || 'Itinerary').slice(0, 120)
}
