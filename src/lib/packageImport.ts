/**
 * Paste a supplier's programme, get a package.
 *
 * Text → Pages already turns a pasted block into A4 sheets; this does the same job for the
 * package builder, which needs a great deal more than pages: a day card each with its own
 * photograph and chips, an arrival and a departure day held separately from the touring
 * days, a price table, two lists, an accommodation plan and a cover.
 *
 * THE PARSER IS NOT DUPLICATED. `parseDoc` in textItinerary.ts already knows how these
 * documents are written — every way a supplier types a day heading, a Meals line, an
 * Overnight line, an Included heading. This file consumes its output and maps it onto the
 * builder's state. If a new heading shape needs recognising, it is fixed there and both
 * features get it. The one thing NOT taken from there is the rate block: `offerHeading`
 * wants a heading line above the money, and these rate sheets put the tier, the occupancy,
 * the figure and the hotel all on one line ("Rate for Solo Traveller 1500$ USD 4 Star ---
 * STAY INN PYRAMIDS or Equal"), which that function reads as a heading and throws the
 * figure away. `readRateBlock` below scans for money and for tier headings instead.
 *
 * WHAT IT WILL AND WILL NOT INVENT. The prose is the supplier's, cleaned and re-cased, never
 * rewritten — a mapper cannot rewrite prose honestly and a wrong sentence about a client's
 * holiday is worse than a plain one. What it does add is structure the text implies but does
 * not state: which sites each day visits, which photograph belongs to it, which city the
 * nights are in, a cover paragraph assembled from the places actually named, and the
 * exclusions the house always states. Every single addition is returned in `notes`, and the
 * panel shows them before anything is applied — nothing here writes to the database.
 */

import { parseDoc } from './textItinerary'
import { siteInfo, sitePhoto, cityPhoto } from './sitePhotos'
import type { PhotoManifest } from './sitePhotos'
import { landmarksIn } from './landmarks'

/* ─── the shapes the builder holds ───────────────────────────────────────────
   Declared here rather than imported from PackageBuilder.tsx so a pure module
   never has to import a React page. They are structurally identical, which is
   all TypeScript needs to let the panel assign one to the other. */

export interface ImportMeals { breakfast: boolean; lunch: boolean; dinner: boolean }

export interface ImportDay {
  uid: string
  title: string
  description: string
  photo: string
  sites: string[]
  guide: boolean
  meals: ImportMeals
  hotel: string
}

export interface ImportFixedDay {
  on: boolean
  title: string
  description: string
  photo: string
  meals: ImportMeals
  hotel: string
}

export interface ImportPriceRow {
  category: string
  dbl: number
  single: number
  triple: number
  quad: number
  solo?: number
  hotels: string
}

export type ImportPriceColumns = 'all' | 'dbl' | 'single' | 'triple' | 'quad' | 'solo'

/** An occupancy the price table has a column for. 'all' is a display mode, not an occupancy. */
export type Occupancy = Exclude<ImportPriceColumns, 'all'>

/** Why the importer did something the text did not say outright. */
export interface ImportNote {
  /** added = words or lines that were not in the source · guess = a choice made from
   *  incomplete information · warn = something the agent has to look at · info = FYI. */
  kind: 'added' | 'guess' | 'warn' | 'info'
  text: string
}

export interface ImportResult {
  title: string
  intro: string
  hero: string
  arrival: ImportFixedDay
  departure: ImportFixedDay
  days: ImportDay[]
  included: string
  excluded: string
  priceTableOn: boolean
  priceRows: ImportPriceRow[]
  priceColumns: ImportPriceColumns
  pp: number
  sgl: number
  showPrice: boolean
  hotels: { nights: number; destination: string }[]
  roomBasis: string
  pax: number
  /** Suggested internal label — the Save button refuses without one. */
  internalLabel: string
  /** Days and nights as the importer counts them, for the panel's summary line. */
  counts: { days: number; nights: number; cities: number }
  notes: ImportNote[]
}

export interface ImportOptions {
  /** The photo library, as the builder already loads it. */
  manifest: PhotoManifest
  /** Append a house detail sentence to days whose supplied prose is thin. */
  detail: boolean
  /** Add the exclusions the house always states, when the programme implies them. */
  protective: boolean
}

/* ─── small text helpers ─────────────────────────────────────────────────── */

const SMALL = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into', 'nor', 'of', 'on',
  'onto', 'or', 'over', 'per', 'the', 'to', 'up', 'via', 'with', 'el', 'al', 'la', 'le', 'du',
])

/** Words that must not be sentence-cased away. */
const KEEP_CAPS = new Set(['NMEC', 'GEM', 'UNESCO', 'VIP', 'AC', 'A/C', 'BB', 'HB', 'FB', 'USD', 'EUR', 'EGP', 'II', 'III', 'IV', 'IX', 'XI'])

const SHOUTING = (s: string): boolean => {
  const letters = s.replace(/[^A-Za-z]/g, '')
  if (letters.length < 4) return false
  const upper = s.replace(/[^A-Z]/g, '').length
  return upper / letters.length > 0.7
}

/** Capitalise one whitespace-separated word, hyphen parts included. */
function capWord(w: string, first: boolean): string {
  if (KEEP_CAPS.has(w.toUpperCase()) && /^[A-Za-z/]+$/.test(w)) return w.toUpperCase()
  const low = w.toLowerCase()
  if (!first && SMALL.has(low.replace(/[^a-z]/g, ''))) return low
  return low.replace(/(^|[-–—'’(])([a-z])/g, (_m, p, c) => p + c.toUpperCase())
}

/**
 * Re-case a heading that arrived in capitals, and leave alone one that did not.
 *
 * Supplier programmes shout their day headings ("DAY 03 | ALEXANDRIA – MEDITERRANEAN
 * HERITAGE AND SEASIDE LUNCH") and the package cover is not a shouting document. A heading
 * that is already mixed case was cased deliberately by whoever wrote it, so it is left
 * exactly as typed — re-casing it would only lose their capitals.
 */
export function smartCase(s: string): string {
  const t = String(s || '').replace(/\s+/g, ' ').trim()
  if (!t || !SHOUTING(t)) return t
  return t.split(' ').map((w, i) => capWord(w, i === 0)).join(' ')
}

/** Sentence split that survives "St. Catherine" and "e.g." — no lookbehind, for old Safari. */
function sentences(text: string): string[] {
  const s = String(text || '').trim()
  if (!s) return []
  const ABBR = /(?:^|\s)(?:mr|mrs|ms|dr|prof|st|sr|jr|no|vs|etc|approx|dept|est|e\.g|i\.e|a\.m|p\.m|u\.s)\.$/i
  const out: string[] = []
  let buf = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    buf += c
    if (c !== '.' && c !== '!' && c !== '?') continue
    // Run of terminators, then the whitespace after them.
    while (i + 1 < s.length && '.!?'.includes(s[i + 1])) { buf += s[++i] }
    if (i + 1 >= s.length) break
    if (!/\s/.test(s[i + 1])) continue
    if (ABBR.test(buf)) continue
    // A single capital letter followed by a dot is an initial, not an end.
    if (/(?:^|\s)[A-Z]\.$/.test(buf)) continue
    const rest = s.slice(i + 1).replace(/^\s+/, '')
    // Only break when what follows opens like a new sentence.
    if (!/^[A-Z“"'(]/.test(rest)) continue
    out.push(buf.trim())
    buf = ''
  }
  if (buf.trim()) out.push(buf.trim())
  return out.filter(Boolean)
}

/** Tidy one line of supplied prose without changing its words. */
function tidyLine(s: string): string {
  return String(s || '')
    .replace(/\s*\|\s*/g, ' — ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s+$/, '')
    .trim()
}

const num = (s: string): number => {
  const n = Number(String(s).replace(/[^\d.]/g, ''))
  return Number.isFinite(n) ? n : 0
}

/* ─── getting the block into lines ──────────────────────────────────────── */

/**
 * Put the line breaks back.
 *
 * `parseDoc` is a line parser: a day heading has to START a line, a Meals line has to START
 * a line. But a programme copied out of an email, a chat message or a PDF very often arrives
 * as one unbroken paragraph — "DAY 01 | ARRIVAL IN CAIRO • Upon arrival at Cairo
 * International Airport… • Overnight in Cairo. Meals : Optional Dinner…" — and against that
 * the parser finds one day and one enormous bullet, or nothing at all.
 *
 * So the structural markers that these documents always use get a newline in front of them
 * first: the bullet characters, "DAY n", a Meals label, and the rate-sheet headings. Text
 * that already had proper lines is unharmed — it just gains blank lines, which the parser
 * skips.
 */
export function normalizeBlock(raw: string): string {
  let s = String(raw || '').replace(/\r\n?/g, '\n').replace(/ /g, ' ')
  // Bullet characters are only ever list markers in these documents.
  s = s.replace(/[•▪●·]\s*/g, '\n• ')
  // "DAY 01", "Day 3 —". \b before "day" keeps "Monday" and "holiday" out of it.
  s = s.replace(/([^\n])[ \t]*(?=\bday\s*\d{1,2}\b)/gi, '$1\n')
  // The meals label that closes a day.
  s = s.replace(/([^\n])[ \t]*(?=\bmeals?\s*[:\-–—])/gi, '$1\n')
  // The rate sheet's own headings.
  s = s.replace(/([^\n])[ \t]*(?=\brate\s+(?:for|includes?|excludes?|per)\b)/gi, '$1\n')
  s = s.replace(/([^\n])[ \t]*(?=\b(?:what'?s\s+)?(?:not\s+included|inclusions?|exclusions?)\b\s*:)/gi, '$1\n')
  return s.replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Is this line quoting the package price?
 *
 * Deliberately narrow. It needs a figure of at least 100 in a currency AND a cue that the
 * figure is THE rate — the word rate/price/package, an occupancy, or a star tier. An
 * exclusion that happens to name a price ("Abu Simbel excursion 120 USD per person") has
 * none of those cues and stays in the exclusions where it belongs; an optional meal is
 * excluded outright by name. Getting this wrong in the generous direction would either
 * publish a wrong headline price or delete a line from the client's list, so it errs
 * towards leaving lines alone and reporting that no rate was found.
 */
/* ─── the rate block ────────────────────────────────────────────────────── */

const TIER = /(?:^|[^a-z0-9])(\d)\s*(?:\*|★|stars?)|\b(three|four|five)[\s-]*stars?\b/i
const TIER_WORD: Record<string, string> = { three: '3', four: '4', five: '5' }

const OCC: [Occupancy, RegExp][] = [
  ['solo', /\bsolo\b|\bsingle\s+travell?er\b|\bone\s+person\b|\bindividual\s+travell?er\b/i],
  ['single', /\bsingle\s+(?:room|occupancy|supplement|use)\b|\bsgl\b/i],
  ['dbl', /\bdouble\b|\btwin\b|\bdbl\b|\bsharing\b/i],
  ['triple', /\btriple\b|\btpl\b/i],
  ['quad', /\bquad(?:ruple)?\b/i],
]

interface RateHit {
  amount: number
  occ: Occupancy
  tier: string
  hotels: string
}

const RATE_CUE = /\brate\b|\bprice\b|\bpackage\b|\bsolo\b|\bsingle\b|\bdouble\b|\btwin\b|\btriple\b|\bquad|\d\s*(?:\*|★|stars?)\b|\b(?:three|four|five)[\s-]*stars?\b/i
const RATE_VETO = /\boptional\b|\bextra\s*cost\b|^\W*meals?\b/i
const MONEY = /(?:\$|usd|eur|egp|€)\s*([\d][\d,\. ]{2,})|([\d][\d,\. ]{2,})\s*(?:\$|usd|eur|egp|€)/i
const SUPPLEMENT = /\bsingle\s+supplement\b|\bsupplement\s+(?:for|per)\s+single\b/i

function isRateLine(line: string): boolean {
  const s = line.trim()
  if (!s || s.length > 200) return false
  if (RATE_VETO.test(s)) return false
  if (!RATE_CUE.test(s)) return false
  const m = MONEY.exec(s)
  if (!m) return false
  return num(m[1] || m[2]) >= 100
}

const OFFER_WORD = /\b(?:offer(?:ed|ing)?|packages?|programmes?|programs?|options?|tiers?|categor(?:y|ies)|rates?)\b/i

/**
 * Is this line a tier heading standing above its own rate — "OFFERED 4 Star package :"?
 *
 * The two rate-sheet styles in use put the tier in different places. One puts everything on
 * one line ("Rate for Solo Traveller 1500$ USD 4 Star --- STAY INN PYRAMIDS"). The other
 * heads a block with the tier and puts the figure and the hotels on the lines beneath it.
 * Without recognising the heading, every block in the second style reads as the same
 * nameless tier and each one overwrites the last — two tiers at 4,200 and 6,100 came out as
 * a single row at 6,100. A wrong published price is the worst thing this file can produce,
 * so the heading is recognised on the same terms textItinerary uses: short, a structural
 * word, and either a tier or a trailing colon. Never a bulleted line — day prose is bulleted
 * and "check in to your 5 star hotel" is not a price heading.
 */
function tierHeading(line: string): string | null {
  const s = line.trim()
  if (!s || s.length > 72) return null
  if (/^[•▪●·*]/.test(line.trim())) return null
  if (MONEY.test(s)) return null
  if (!OFFER_WORD.test(s)) return null
  const tm = TIER.exec(s)
  if (!tm && !/[:\-–—]\s*$/.test(s)) return null
  if (tm) return tierName(s, tm)
  // An unnamed block ("OFFERED PACKAGE:") still needs a key of its own.
  const cat = smartCase(s.replace(OFFER_WORD, ' ').replace(/[:\-–—]/g, ' ').replace(/\s{2,}/g, ' ').trim())
  return cat || 'Package'
}

/** "4 Star", "5 Star Deluxe" — the tier plus any grade word beside it. */
function tierName(line: string, tm: RegExpExecArray): string {
  const digit = tm[1] || TIER_WORD[(tm[2] || '').toLowerCase()] || ''
  const grade = /\b(deluxe|superior|standard|luxury|budget|economy|first\s+class|premium)\b/i.exec(line)
  const g = grade ? grade[1].toLowerCase().replace(/^./, (c) => c.toUpperCase()) : ''
  return [`${digit} Star`.trim(), g].filter(Boolean).join(' ')
}

export interface RateBlock {
  /** The programme with every rate, tier heading and hotel line removed. */
  body: string
  rates: RateHit[]
  /** A single supplement quoted on its own line, which the builder holds separately. */
  singleSupplement: number
}

/**
 * Read the rate block, and take it out of the programme.
 *
 * Two things depend on the lines being removed. The obvious one: the rate sits between the
 * last day and the "Rate Includes" heading, so the day parser is still in day mode when it
 * reaches it and files the price as the departure day's last bullet — the figure would print
 * inside the departure prose on the client's page. The second: the hotel names under a tier
 * heading ("Steigenberger Pyramids Cairo or similar") would do the same thing.
 *
 * A block runs from a tier heading until a day heading or an inclusions heading ends it, so
 * an unrecognised line inside one is treated as a hotel — which is where those lines are.
 */
export function readRateBlock(text: string): RateBlock {
  const keep: string[] = []
  const rates: RateHit[] = []
  const hotelsByTier = new Map<string, string[]>()
  let tier = ''
  let inBlock = false
  let seenDay = false
  let supplement = 0

  const DAY = /^[\s>*_#\-•·"']*day\s*[\s:.#)|\-–—]*\d{1,3}\b/i
  const SECTION = /^[\s>*_#\-•·]*(?:what'?s\s+)?(?:the\s+)?(?:package|price|tour|trip|programme|program|rate|cost)?\s*(?:inclusions?|includes?|included|exclusions?|excludes?|excluded|not\s+included)\b/i

  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) { keep.push(raw); continue }

    if (DAY.test(line)) { seenDay = true; inBlock = false; tier = ''; keep.push(raw); continue }
    if (SECTION.test(line)) { inBlock = false; tier = ''; keep.push(raw); continue }

    // A tier heading is only believed once the itinerary proper is behind us.
    if (seenDay) {
      const th = tierHeading(line)
      if (th) { tier = th; inBlock = true; if (!hotelsByTier.has(th)) hotelsByTier.set(th, []); continue }
    }

    const bare = line.replace(/^[•▪●·\-*]\s*/, '')

    if (SUPPLEMENT.test(bare)) {
      const m = MONEY.exec(bare)
      if (m && num(m[1] || m[2]) >= 100) { supplement = num(m[1] || m[2]); continue }
    }

    if (isRateLine(bare)) {
      const hit = readRateLine(bare)
      if (hit) { rates.push({ ...hit, tier: hit.tier || tier }); inBlock = inBlock || Boolean(tier); continue }
    }

    // Inside a tier block, anything left is the property list for that tier.
    if (inBlock && tier) { hotelsByTier.get(tier)?.push(bare.replace(/[\s,]*\bor\s+(?:equal|similar)\b\.?\s*$/i, '').trim()); continue }

    keep.push(raw)
  }

  // Give each rate the hotels its own tier block listed, when its line did not name one.
  for (const r of rates) {
    if (r.hotels) continue
    const list = (hotelsByTier.get(r.tier) || []).filter(Boolean)
    if (list.length) r.hotels = smartCase(list.join(' · '))
  }

  return { body: keep.join('\n'), rates, singleSupplement: supplement }
}

/** One rate line → one figure, one occupancy, and whatever tier and hotel it names itself. */
function readRateLine(line: string): RateHit | null {
  const s = tidyLine(line)
  const money = MONEY.exec(s)
  if (!money) return null
  const amount = num(money[1] || money[2])
  if (amount < 100) return null

  const tm = TIER.exec(s)
  const tier = tm ? tierName(s, tm) : ''

  let occ: Occupancy = 'dbl'
  for (const [key, re] of OCC) if (re.test(s)) { occ = key; break }

  // The hotel sits after a run of dashes, or after the tier, on the same line.
  let hotels = ''
  const dash = /(?:-{2,}|—{1,}|:{1,})\s*([^-–—:]{4,})$/.exec(s)
  if (dash) hotels = dash[1]
  else if (tm) hotels = s.slice(tm.index + tm[0].length)
  hotels = hotels
    .replace(/^[\s:–—\-,]+/, '')
    // "or equal" / "or similar" is a commercial term, not part of the name. It is stripped
    // here and re-attached in exactly one place, so no line can end up saying it twice.
    .replace(/[\s,]*\bor\s+(?:equal|similar)\b\.?\s*$/i, '')
    .trim()
  if (/^\W*$/.test(hotels) || hotels.length < 4) hotels = ''
  return { amount, occ, tier, hotels: smartCase(hotels) }
}

/**
 * The Meals line of every day, exactly as typed.
 *
 * `parseDoc` returns only the parsed meal labels, and whether a meal is included or sold as
 * an extra lives entirely in the words it drops ("Optional Dinner with EXTRA cost 55 USD").
 * Indexed to match `doc.days`, so a day with no Meals line gets ''.
 */
export function rawMealLines(text: string): string[] {
  const DAY = /^[\s>*_#\-•·"']*day\s*[\s:.#)|\-–—]*(\d{1,3})\b/i
  const MEAL = /^[\s>*_#\-•·]*(?:included\s+)?meals?\s*[:\-–—]\s*(.+)$/i
  const out: string[] = []
  let cur = -1
  for (const line of text.split('\n')) {
    if (DAY.test(line)) { cur = out.length; out.push(''); continue }
    if (cur < 0) continue
    if (MEAL.test(line) && !out[cur]) out[cur] = line.trim()
  }
  return out
}

/* ─── the title line ────────────────────────────────────────────────────── */

/** Nouns a package title ends on. Anything after one is a marketing tag list, not the name. */
const TITLE_NOUN = /\b(experience|tour|package|holiday|journey|discovery|adventure|getaway|escape|itinerary|cruise|explorer|highlights)\b/gi

/**
 * The package name, and the day/night count if the line states one.
 *
 * These documents open with a line that is three things at once:
 * "5 Days / 4 Nights – Cairo & Alexandria Experience Pyramids • Ancient Egypt • Islamic".
 * The count is worth keeping, the name is the middle, and the bullet-separated keywords on
 * the end are for a brochure. Cutting after the last title noun drops them.
 *
 * TWO GUARDS ON THAT CUT, because it is easy to cut away half the name. The tail is dropped
 * only when it contains no digit ("Eclipse Tour 2027" keeps its year) AND no function word.
 * A marketing tail is a bare list of nouns — "Pyramids", "Ancient Egypt". A name that
 * carries on reads like a phrase: "Nile Cruise & the Pyramids of Giza" came out as
 * "Nile Cruise" before the function-word guard existed, because "Cruise" is on the noun
 * list and everything after it was thrown away.
 */
export function readTitleLine(raw: string): { title: string; days: number; nights: number } {
  let s = tidyLine(raw)
  let days = 0
  let nights = 0
  const dn = /(\d{1,2})\s*days?\s*(?:\/|-|–|and|&)?\s*(\d{1,2})?\s*nights?/i.exec(s)
  if (dn) {
    days = num(dn[1])
    if (dn[2]) nights = num(dn[2])
    s = (s.slice(0, dn.index) + s.slice(dn.index + dn[0].length)).trim()
  } else {
    const nOnly = /(\d{1,2})\s*nights?/i.exec(s)
    if (nOnly) { nights = num(nOnly[1]); s = (s.slice(0, nOnly.index) + s.slice(nOnly.index + nOnly[0].length)).trim() }
  }
  s = s.replace(/^[\s:–—\-•·|/]+/, '').replace(/[\s:–—\-•·|/]+$/, '')
  // Keyword tails are separated by bullets far more reliably than by anything else.
  const bullet = s.search(/\s[•·]\s/)
  if (bullet > 8) s = s.slice(0, bullet).trim()
  let cut = -1
  let m: RegExpExecArray | null
  TITLE_NOUN.lastIndex = 0
  while ((m = TITLE_NOUN.exec(s))) cut = m.index + m[0].length
  if (cut > 8 && cut < s.length) {
    const tail = s.slice(cut)
    const FUNCTION_WORD = /(?:^|\s)(?:and|or|of|the|a|an|in|on|at|to|from|with|for|&)(?:\s|$)/i
    if (!/\d/.test(tail) && !FUNCTION_WORD.test(tail)) s = s.slice(0, cut).trim()
  }
  return { title: smartCase(s) || 'Egypt Travel Package', days, nights }
}

/* ─── meals ─────────────────────────────────────────────────────────────── */

/**
 * A meal the client pays for is not an included meal.
 *
 * "Meals : Optional Dinner with EXTRA cost 55 USD" parses as a dinner, and ticking dinner
 * on that day would put a paid extra into the client's board basis and into the inclusions.
 * The day therefore keeps NO dinner, and the extra is surfaced separately so it lands in
 * the exclusions with its price — which is where row 203 put it by hand.
 */
function readMeals(list: string[], rawLine: string): { meals: ImportMeals; optional: string[] } {
  const optional: string[] = []
  const paid = /\boptional\b|\bextra\s*cost\b|\bat\s+extra\b|\bsupplement\b|\bown\s+account\b|\bnot\s+included\b|\bif\s+required\b/i.test(rawLine)
  const has = (w: string) => list.some((x) => new RegExp(w, 'i').test(x))
  const meals: ImportMeals = { breakfast: has('breakfast'), lunch: has('lunch'), dinner: has('dinner') }
  if (paid) {
    const price = /(\d[\d,\.]*)\s*(usd|eur|egp|\$|€)|(?:\$|usd|eur|€)\s*(\d[\d,\.]*)/i.exec(rawLine)
    const amount = price ? num(price[1] || price[3]) : 0
    for (const key of ['breakfast', 'lunch', 'dinner'] as const) {
      if (!meals[key]) continue
      meals[key] = false
      const label = key[0].toUpperCase() + key.slice(1)
      optional.push(amount ? `Optional ${label.toLowerCase()} — ${amount.toLocaleString('en-US')} USD per person` : `Optional ${label.toLowerCase()} — quoted on request`)
    }
  }
  return { meals, optional }
}

/* ─── the two lists ─────────────────────────────────────────────────────── */

/**
 * The boilerplate every ETL rate sheet carries, in the wording the house uses.
 *
 * These lines say the same thing on every sheet and arrive typed a different way each time
 * ("04 Nights Accommodation in Cairo Based on Bed and Breakfast"). Rewriting only these —
 * matched by pattern, replaced by a fixed string — normalises the lists without touching
 * anything specific to this trip, which is left exactly as the supplier wrote it.
 */
const LIST_CANON: [RegExp, string | ((m: RegExpExecArray) => string)][] = [
  [/^meet\s*(?:and|&)\s*assist(?:ance)?\b.*?(?:at\s+(.+?)\s*)?$/i, (m) => `Meet and assist at ${smartCase(m[1] || '') || 'the airport'}`],
  [/^all\s+transfers?\b.*private/i, 'All transfers on a private basis as mentioned in the programme'],
  [/^(\d{1,2})\s*nights?\s+accommodation\s+in\s+(.+?)\s+(?:based\s+on|on)\s+bed\s*(?:and|&)\s*breakfast\b.*$/i,
    (m) => `${num(m[1])} night${num(m[1]) === 1 ? '' : 's'} accommodation in ${smartCase(m[2])} on a bed & breakfast basis`],
  [/^all\s+tours?\b.*private/i, 'All tours on a private basis as mentioned in the programme'],
  [/^english[\s-]*speaking\s+guide\b.*$/i, 'English-speaking Egyptologist guide'],
  [/^all\s+meals\s+as\s+mentioned\b.*$/i, 'All meals as mentioned in the programme'],
  [/^entry\s+visa\b.*$/i, 'Entry visa'],
  [/^international\s+(?:flight|air)\b.*$/i, 'International flight ticket'],
  [/^(?:tipping|tips)\b.*$/i, 'Tipping and gratuities'],
  [/^any\s+bank\s+transfer\b.*$/i, 'Any bank transfer charges'],
  [/^personal\s+(?:expenses|spending)\b.*$/i, 'Personal expenses (beverages, laundry, phone calls)'],
]

/** "03 nights on board" reads as a typo once it is set in the client's document. */
const dropLeadingZero = (s: string) => s.replace(/\b0(\d)\s*(nights?|days?)\b/gi, '$1 $2')

function canonList(lines: string[]): string[] {
  const out: string[] = []
  for (const raw of lines) {
    let line = dropLeadingZero(tidyLine(raw).replace(/\.$/, ''))
    if (!line) continue
    for (const [re, to] of LIST_CANON) {
      const m = re.exec(line)
      if (!m) continue
      line = typeof to === 'function' ? to(m) : to
      break
    }
    if (SHOUTING(line)) line = smartCase(line)
    if (!out.some((x) => x.toLowerCase() === line.toLowerCase())) out.push(line)
  }
  return out
}

/**
 * The exclusions the house states whether or not the supplier's sheet did.
 *
 * Each is conditional on something the programme actually contains, because an exclusion for
 * a thing the trip does not do reads as carelessness. All of them are reported as additions:
 * the concert line in particular encodes a house decision — the transfers are ours, the
 * ticket is the client's — and whoever built the package has to agree with it out loud.
 *
 * `when` decides whether the line is relevant to this trip. `dupe` decides whether the sheet
 * ALREADY says it in its own words, and matches on the SUBJECT rather than on the wording: a
 * sheet that already excluded "Interior pyramid and tomb entrance fees" and "Optional
 * excursion to Abu Simbel" used to get both of them back a second time, phrased slightly
 * differently, because the old check compared the first eighteen characters of the house line.
 */
const PROTECTIVE: { when: RegExp; dupe: RegExp; line: string; why: string }[] = [
  {
    when: /\bconcert\b|\blive\s+show\b|\bperformance\b|\bopera\b/i,
    line: 'Event / concert tickets (private transfers to and from the venue are included)',
    dupe: /\\b(?:concert|event|show|opera)\\b[^\\n]*\\bticket|\\bticket[^\\n]*\\b(?:concert|event|show|opera)\\b/i,
    why: 'the programme includes an evening event',
  },
  {
    when: /\bpyramid\b|\btomb\b|\bvalley\s+of\s+the\s+kings\b|\bburial\s+chamber\b/i,
    line: 'Interior pyramid / tomb entrance fees',
    dupe: /\\binterior\\b[^\\n]*\\b(?:pyramid|tomb)|\\b(?:pyramid|tomb)\\b[^\\n]*\\binterior\\b|\\bburial\\s+chamber\\b/i,
    why: 'interiors are ticketed separately from the site',
  },
  {
    when: /\broyal\s+mumm(?:y|ies)\b|\bNMEC\b|\bcivili[sz]ation\s+museum\b/i,
    line: 'Royal Mummies Hall supplement at the Civilization Museum, if ticketed separately',
    dupe: /\\broyal\\s+mumm(?:y|ies)\\b/i,
    why: 'the Royal Mummies Hall carries its own ticket',
  },
  {
    when: /\babu\s+simbel\b/i,
    line: 'Abu Simbel excursion — quoted on request',
    dupe: /\\babu\\s+simbel\\b/i,
    why: 'Abu Simbel is quoted separately',
  },
  {
    when: /\b(?:scuba|diving|dives|liveaboard)\b/i,
    line: 'Dive equipment rental, nitrox and marine park / port fees',
    dupe: /\\bdive\\s+(?:equipment|gear)\\b|\\bnitrox\\b/i,
    why: 'the programme includes diving',
  },
  {
    when: /\bballoon\b/i,
    line: 'Hot-air balloon flight — quoted on request',
    dupe: /\\bballoon\\b/i,
    why: 'the balloon is an optional extra',
  },
]

/* ─── the day cards ─────────────────────────────────────────────────────── */

const ARRIVAL_RE = /\barrival\b|\barrive\b|\bwelcome\s+to\b|\bmeet\s*(?:and|&)\s*assist\b|\bcheck[\s-]?in\b/i
const DEPARTURE_RE = /\bdepart(?:ure|ing)?\b|\bfinal\s+departure\b|\bfly\s+home\b|\bcheck[\s-]?out\b.*\bairport\b|\bend\s+of\s+(?:the\s+)?(?:tour|services)\b/i
const LEISURE_RE = /\bfree\s+(?:day|time|afternoon|morning)\b|\bat\s+leisure\b|\bown\s+leisure\b|\bday\s+at\s+the\s+(?:beach|pool|hotel)\b|\brelax\s+at\s+(?:the|your)\s+hotel\b/i

const newUid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `imp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

/**
 * The chips for a day, the photo that follows from them, and what could be said about it.
 *
 * The photograph is chosen from ALL the landmarks in mention order, including the broad
 * ones — "Alexandria" resolves to a photograph of the harbour, which opens an Alexandria
 * day better than the first specific site on it happens to. The chips are the narrower
 * set: a broad label earns its place only on a day that has fewer than two specific sites
 * of its own, so "Alexandria · Catacombs · Pompey's Pillar · Bibliotheca" loses its first
 * chip and a plain beach day keeps "Time at leisure".
 */
function chipsAndPhoto(text: string, manifest: PhotoManifest): {
  chips: string[]; photo: string; city: string; details: string[]; specifics: number
} {
  const found = landmarksIn(text)
  const details: string[] = []
  let photo = ''
  let city = ''
  for (const lm of found) {
    if (lm.detail) details.push(lm.detail)
    const info = siteInfo(lm.chip, manifest)
    if (!photo && info.photo) photo = info.photo
    if (!city && info.city) city = info.city
  }
  if (!photo && city) photo = cityPhoto(city)

  const specifics = found.filter((lm) => !lm.broad).length
  const chips = found.filter((lm) => !lm.broad || specifics < 2).map((lm) => lm.chip).slice(0, 6)
  return { chips, photo, city, details, specifics }
}

/** Break the supplied bullets into one line per sentence when a bullet runs long. */
function bodyLines(bullets: string[]): string[] {
  const out: string[] = []
  for (const b of bullets) {
    const line = tidyLine(b)
    if (!line) continue
    const parts = line.length > 170 ? sentences(line) : [line]
    for (const p of parts) if (p) out.push(p)
  }
  return out
}

/* ─── the whole thing ───────────────────────────────────────────────────── */

export function importFromText(text: string, opts: ImportOptions): ImportResult {
  const notes: ImportNote[] = []
  const add = (kind: ImportNote['kind'], t: string) => notes.push({ kind, text: t })

  // Order matters: put the lines back, take the rate lines out, then parse the rest.
  const src = normalizeBlock(text)
  const { body, rates, singleSupplement } = readRateBlock(src)
  const doc = parseDoc(body)
  const mealLines = rawMealLines(body)
  const head = readTitleLine(doc.title)
  const manifest = opts.manifest || {}

  if (!doc.days.length) {
    add('warn', 'No day headings were found. Days have to start with "Day 1", "DAY 01", "Day 3 —" or similar; without them there is nothing to build.')
  }

  /* ---- which days are the arrival and the departure ---------------------- */

  const first = doc.days[0]
  const last = doc.days.length > 1 ? doc.days[doc.days.length - 1] : undefined
  const blob = (d: typeof first) => `${d?.title || ''}\n${(d?.bullets || []).join('\n')}`

  const firstIsArrival = Boolean(first && ARRIVAL_RE.test(blob(first)) && !LEISURE_RE.test(first.title))
  const lastIsDeparture = Boolean(last && DEPARTURE_RE.test(blob(last)))

  /* ---- hotel, tier and occupancy from the rate block --------------------- */

  const tiers = Array.from(new Set(rates.map((r) => r.tier).filter(Boolean)))
  // The rate sheet writes "STAY INN PYRAMIDS or Equal" as one string. The "or equal" is a
  // commercial term, not part of the name — it is stripped here and re-attached in one
  // place, so no line can end up saying it twice.
  const hotelName = rates.map((r) => r.hotels).find(Boolean) || ''
  const tierLabel = tiers.length === 1 ? tiers[0].replace(/(\d)\s*Star/i, '$1★') : ''
  const bb = /bed\s*(?:and|&)\s*breakfast\b|\bB\/?B\b/i.test(src)

  // Only ONE quoted tier can put a property on the day card. With two tiers on the sheet,
  // naming either one there would print a 5-star hotel on a package sold at the 4-star
  // rate — the price table is the only place both can be shown truthfully.
  const stayLine = hotelName && tiers.length <= 1
    ? `${hotelName}${tierLabel ? `, ${tierLabel}` : ''} (or equal)${bb ? ' — bed & breakfast' : ''}`
    : ''
  if (hotelName && rates.length && !tierLabel && tiers.length > 1) {
    add('warn', `More than one hotel tier is quoted (${tiers.join(', ')}). The day cards were left without a hotel line — set it per day, or per tier in the price table.`)
  }

  /* ---- the day cards ---------------------------------------------------- */

  const usedDetail = new Set<string>()
  const days: ImportDay[] = []
  let arrival: ImportFixedDay = {
    on: false, title: '', description: '', photo: 'arrivedepart/arrival-plane.jpg',
    meals: { breakfast: false, lunch: false, dinner: false }, hotel: '',
  }
  let departure: ImportFixedDay = {
    on: false, title: '', description: '', photo: 'arrivedepart/departure-plane.jpg',
    meals: { breakfast: false, lunch: false, dinner: false }, hotel: '',
  }

  const optionalExtras: string[] = []
  const stays: string[] = []
  const cities = new Set<string>()

  doc.days.forEach((d, i) => {
    const isFirst = i === 0
    const isLast = i === doc.days.length - 1
    const asArrival = isFirst && firstIsArrival
    const asDeparture = isLast && lastIsDeparture && !asArrival

    const scan = `${d.title}\n${d.bullets.join('\n')}`
    const title = smartCase(d.title) || (asArrival ? 'Arrival' : asDeparture ? 'Departure' : d.label)
    const lines = bodyLines(d.bullets)

    // parseDoc lifts "Overnight in Cairo." out of the prose into `stay`; the day card is
    // where a reader looks for it, so it goes back on the end as its own line.
    if (d.stay && !lines.some((l) => /\bovernight\b/i.test(l))) {
      lines.push(d.stay === 'On board' ? 'Overnight on board.' : `Overnight in ${d.stay}.`)
    }

    const { chips, photo, city, details, specifics } = chipsAndPhoto(scan, manifest)
    if (city) cities.add(city)

    // A house detail sentence, but only into a day that has almost nothing to say, and
    // never the same sentence twice in one document.
    if (opts.detail && !asDeparture) {
      const thin = lines.join(' ').length < 260 || lines.length < 3
      const pick = details.find((x) => !usedDetail.has(x))
      if (thin && pick) {
        usedDetail.add(pick)
        const at = lines.length && /\bovernight\b/i.test(lines[lines.length - 1]) ? lines.length - 1 : lines.length
        lines.splice(at, 0, pick)
        add('added', `${d.label}: one house detail sentence was added because the supplied prose was thin.`)
      }
    }

    const { meals, optional } = readMeals(d.meals, mealLines[i] || d.meals.join(' '))
    // A departure day rarely carries a Meals line, but its prose almost always opens
    // "Breakfast at the hotel and check-out" — and a package that prints no breakfast on
    // a night the client paid bed-and-breakfast for reads as a mistake.
    if (!d.meals.length && !meals.breakfast && /\bbreakfast\s+at\s+(?:the|your)\s+hotel\b/i.test(scan)) {
      meals.breakfast = true
      add('guess', `${d.label}: no Meals line, so breakfast was ticked from the prose ("breakfast at the hotel").`)
    }
    for (const o of optional) {
      if (!optionalExtras.includes(o)) optionalExtras.push(o)
      add('guess', `${d.label}: "${o}" is charged extra, so it is NOT ticked as an included meal — it went into the exclusions instead.`)
    }

    const description = lines.join('\n')

    if (asArrival) {
      arrival = { on: true, title, description, photo: photo || 'arrivedepart/arrival-plane.jpg', meals, hotel: stayLine }
      add('info', `${d.label} was mapped to the arrival day.`)
    } else if (asDeparture) {
      departure = { on: true, title, description, photo: photo || 'arrivedepart/departure-plane.jpg', meals, hotel: '' }
      add('info', `${d.label} was mapped to the departure day.`)
    } else {
      // A day that names no site at all — "disembark and fly to Cairo, free time" — can
      // still take the photograph of the city it sleeps in, which beats a blank card.
      let dayPhoto = photo
      if (!dayPhoto && d.stay && d.stay !== 'On board') dayPhoto = sitePhoto(d.stay, manifest)
      if (!dayPhoto && d.stay === 'On board') dayPhoto = sitePhoto('Nile cruise', manifest)

      days.push({
        uid: newUid(), title, description,
        photo: dayPhoto,
        sites: chips,
        // A guided day that happens to leave free time in the bazaar is still a guided
        // day. Only a day with nothing specific in it is treated as leisure.
        guide: specifics > 0,
        meals,
        hotel: stayLine,
      })
      if (!dayPhoto) add('warn', `${d.label}: no photograph matched — pick one on the day card.`)
      else if (!photo) add('guess', `${d.label}: no site was recognised, so the photograph came from where the night is spent.`)
      if (!chips.length) add('warn', `${d.label}: no site chips could be read from the text — add them by hand if the day should show any.`)
    }

    // The night that follows this day. The last day of a programme has no night.
    if (!isLast && d.stay) stays.push(d.stay)
  })

  /* ---- accommodation nights -------------------------------------------- */

  const hotels: { nights: number; destination: string }[] = []
  for (const s of stays) {
    const label = s === 'On board' ? 'On board' : s
    const prev = hotels[hotels.length - 1]
    if (prev && prev.destination === label) prev.nights += 1
    else hotels.push({ nights: 1, destination: label })
  }
  // Name the property once the city is known — a single hotel across one city is the
  // common case and the cover reads better for it.
  let stayCity = ''
  if (hotelName && hotels.length === 1 && hotels[0].destination !== 'On board') {
    stayCity = hotels[0].destination
    hotels[0].destination = `${stayCity} — ${hotelName}${tierLabel ? `, ${tierLabel}` : ''} (or equal)`
  }
  const nights = hotels.reduce((a, h) => a + h.nights, 0)
  if (!nights) add('warn', 'No nights could be counted — no day says where the night is spent. Set the accommodation nights by hand.')
  if (head.nights && nights && head.nights !== nights) {
    add('warn', `The title line says ${head.nights} nights but the days account for ${nights}. The days were used.`)
  }

  /* ---- the price table ------------------------------------------------- */

  const rowsByTier = new Map<string, ImportPriceRow>()
  const occSeen = new Set<Occupancy>()
  for (const r of rates) {
    const key = r.tier || 'Package'
    let row = rowsByTier.get(key)
    if (!row) {
      // "Cairo: Stay Inn Pyramids or equal" — the table has one hotels column and naming
      // the city in it is the only thing that makes a multi-tier table readable.
      const cell = r.hotels ? `${stayCity ? stayCity + ': ' : ''}${r.hotels} or equal` : ''
      row = { category: key, dbl: 0, single: 0, triple: 0, quad: 0, solo: 0, hotels: cell }
      rowsByTier.set(key, row)
    }
    if (!row.hotels && r.hotels) row.hotels = `${stayCity ? stayCity + ': ' : ''}${r.hotels} or equal`
    row[r.occ] = r.amount
    occSeen.add(r.occ)
  }
  const priceRows = Array.from(rowsByTier.values())
  const priceColumns: ImportPriceColumns = occSeen.size === 1 ? Array.from(occSeen)[0] : 'all'
  const primary = rates.length ? rates[0].amount : 0

  if (singleSupplement) add('info', `A single supplement of ${singleSupplement.toLocaleString('en-US')} USD was read and set as the reference supplement.`)
  if (!rates.length) add('warn', 'No rate could be read. The price table is off — switch it on and type the figures.')
  else add('info', `${rates.length} rate line${rates.length === 1 ? '' : 's'} read: ${rates.map((r) => `${r.amount.toLocaleString('en-US')} USD ${r.occ}`).join(' · ')}.`)

  /* ---- guests ---------------------------------------------------------- */

  let pax = 0
  if (/\bsolo\b|\bsingle\s+travell?er\b/i.test(src)) pax = 1
  if (!pax) {
    const m = /\b(\d{1,2})\s*(?:persons?|pax|adults?|travell?ers?|guests?|people)\b/i.exec(src)
    if (m) pax = num(m[1])
  }
  if (!pax) { pax = occSeen.has('solo') ? 1 : 2; add('guess', `Guests was set to ${pax} — the text does not say. Change it above if wrong.`) }

  /* ---- the two lists --------------------------------------------------- */

  const included = canonList(doc.included)
  const excluded = canonList(doc.excluded)

  if (included.length && !included.some((l) => /admission|entrance|entry\s+fee|ticket/i.test(l))) {
    included.push('Admission to every site named in the programme')
    add('added', 'Inclusion added: "Admission to every site named in the programme" — the sheet did not state it.')
  }
  for (const o of optionalExtras) {
    if (!excluded.some((l) => l.toLowerCase() === o.toLowerCase())) excluded.push(o)
  }
  if (opts.protective) {
    for (const p of PROTECTIVE) {
      if (!p.when.test(src)) continue
      if (excluded.some((l) => p.dupe.test(l))) continue
      excluded.push(p.line)
      add('added', `Exclusion added: "${p.line}" — ${p.why}. Confirm this is how you want it quoted.`)
    }
  }
  if (!included.length) add('warn', 'No inclusions were found. They have to sit under a heading like "Rate Includes" or "What\'s Included".')
  if (!excluded.length) add('warn', 'No exclusions were found.')

  /* ---- the cover ------------------------------------------------------- */

  /**
   * One highlight from each touring day first, then a second from each.
   *
   * Taking the first five blurbs in document order gives a cover that describes day one in
   * detail and never mentions day four — on a five-day trip that read as "Al-Azhar Park,
   * the Giza Plateau, the Museum of Egyptian Civilization, the Great Pyramid and the
   * Sphinx", with Alexandria and Khan el Khalili missing entirely. Going round the days
   * covers the trip instead of its beginning. The arrival and departure days are skipped:
   * an airport transfer is not a highlight.
   */
  const perDay: string[][] = []
  const seenBlurb = new Set<string>()
  doc.days.forEach((d, i) => {
    const isArr = i === 0 && firstIsArrival
    const isDep = i === doc.days.length - 1 && lastIsDeparture
    if (isArr || isDep) return
    const list: string[] = []
    for (const lm of landmarksIn(`${d.title}\n${d.bullets.join('\n')}`)) {
      if (!lm.blurb || seenBlurb.has(lm.blurb)) continue
      seenBlurb.add(lm.blurb)
      list.push(lm.blurb)
    }
    perDay.push(list)
  })
  const blurbs: string[] = []
  for (let round = 0; round < 3; round++) {
    for (const list of perDay) if (list[round]) blurbs.push(list[round])
  }
  const dayCount = days.length + (arrival.on ? 1 : 0) + (departure.on ? 1 : 0)
  const WORD = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen']
  const dayWord = WORD[dayCount] || String(dayCount)
  const pick = blurbs.slice(0, 5)
  const list = pick.length > 1 ? `${pick.slice(0, -1).join(', ')} and ${pick[pick.length - 1]}` : pick[0] || ''
  const intro = list
    ? `${dayWord} days in Egypt: ${list}. Everything private throughout — your own vehicle and your own Egyptologist guide.`
    : `${dayWord} days in Egypt, arranged privately throughout — your own vehicle and your own Egyptologist guide.`
  add('added', 'The cover paragraph was written from the places named in the programme. Read it before you publish — it is the first thing the client sees.')

  /* ---- the cover photograph -------------------------------------------- */

  const hero = days.find((d) => d.photo)?.photo || (cities.size ? cityPhoto(Array.from(cities)[0]) : '') || 'cairo-giza/sphinx-pyramids.jpeg'
  add('guess', 'The cover photograph is the first day photograph that resolved. Change it on the cover if another shot suits the trip better.')

  /* ---- the internal label ---------------------------------------------- */

  const cityShort = Array.from(cities).map((c) => c.replace(/\s*&\s*Giza/i, '').replace(/\s+/g, '').toLowerCase()).join('+')
  const occWord = occSeen.has('solo') ? 'solo' : occSeen.has('dbl') ? 'dbl' : ''
  const internalLabel = [cityShort || 'egypt', dayCount ? `${dayCount}d` : '', occWord, primary ? String(primary) : '']
    .filter(Boolean).join(' ')

  return {
    title: head.title,
    intro,
    hero,
    arrival,
    departure,
    days,
    included: included.join('\n'),
    excluded: excluded.join('\n'),
    priceTableOn: priceRows.length > 0,
    priceRows,
    priceColumns,
    pp: primary,
    sgl: singleSupplement,
    showPrice: false,
    hotels,
    roomBasis: occSeen.has('solo') || occSeen.has('single') ? 'single' : occSeen.has('triple') ? 'triple' : occSeen.has('quad') ? 'quadruple' : 'double',
    pax,
    internalLabel,
    // Counted the way the builder counts it — site cities AND accommodation destinations —
    // so the panel's summary matches the Overview strip the agent sees a moment later.
    counts: {
      days: dayCount,
      nights,
      cities: new Set([...cities, ...hotels.map((h) => h.destination.split(' — ')[0])].filter((c) => c && c !== 'On board')).size || 1,
    },
    notes,
  }
}
