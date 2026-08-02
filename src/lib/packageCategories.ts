/**
 * Sorting saved packages into the four families we actually sell, and into trip-length
 * bands inside each one.
 *
 * The list had grown past the point where scanning it worked: a Shakira concert
 * package, a 2027 eclipse package and a fortnight-long Egypt & Jordan tour are
 * different products with different buyers, and they were interleaved by created_at.
 *
 * Detection is keyword-based over the whole stored package, because the signal shows up
 * in different places depending on how the package was built — sometimes in the title,
 * sometimes only in a day description or a hotel name. Keywords are a heuristic, so
 * every package can carry a manual `category` written into its own JSON, which always
 * wins. Nothing here needs a schema migration.
 */

export type PackageCategory = 'shakira' | 'eclipse' | 'multi' | 'other'

export const CATEGORY_ORDER: PackageCategory[] = ['shakira', 'eclipse', 'multi', 'other']

export const CATEGORY_LABEL: Record<PackageCategory, string> = {
  shakira: 'Shakira',
  eclipse: 'Solar eclipse',
  multi: 'Multi-country (Jordan)',
  other: 'Everything else',
}

/** Short hint shown under a group heading when it is the only thing on screen. */
export const CATEGORY_NOTE: Record<PackageCategory, string> = {
  shakira: 'Packages built around the Shakira dates.',
  eclipse: 'Packages built around the total solar eclipse.',
  multi: 'Packages that cross into Jordan.',
  other: 'Standard Egypt programmes.',
}

/**
 * Matched against the whole package JSON, lower-cased.
 *
 * Order is precedence: a package that mentions both Shakira and the eclipse files under
 * Shakira, because that is the reason the client is travelling on those dates. Anything
 * unmatched falls through to 'other'.
 */
const RULES: [PackageCategory, RegExp][] = [
  ['shakira', /shakira/],
  ['eclipse', /eclipse|totality/],
  ['multi', /jordan|petra|amman|aqaba|wadi\s*rum|jerash|dead\s*sea/],
]

/** True when the value the agent picked is one we know how to render. */
export const isCategory = (v: unknown): v is PackageCategory =>
  typeof v === 'string' && (CATEGORY_ORDER as string[]).includes(v)

/** Keyword verdict only — what the row would be with no manual tag on it. */
export function autoCategory(row: any): PackageCategory {
  let hay = ''
  try {
    /* Drop the manual tag before scanning — otherwise a package pinned to 'shakira'
       reports "auto: Shakira" purely because its own tag is in the text. */
    hay = JSON.stringify(row ?? '', (k, v) => (k === 'category' ? undefined : v)).toLowerCase()
  } catch {
    hay = String(row?.name ?? '').toLowerCase()
  }
  for (const [cat, re] of RULES) if (re.test(hay)) return cat
  return 'other'
}

/** The category a row is filed under: its manual tag if it has one, else the keywords. */
export function categoryOf(row: any): PackageCategory {
  const manual = row?.data?.category
  return isCategory(manual) ? manual : autoCategory(row)
}

/** Whether the row is where it is because someone put it there. */
export const isManual = (row: any): boolean => isCategory(row?.data?.category)

/* ------------------------------------------------------------------ length bands */

export interface LengthBand {
  key: string
  label: string
  min: number
  /** Inclusive. Infinity for the open-ended top band. */
  max: number
}

export const LENGTH_BANDS: LengthBand[] = [
  { key: '1-4', label: '1–4 days', min: 1, max: 4 },
  { key: '5-7', label: '5–7 days', min: 5, max: 7 },
  { key: '8-10', label: '8–10 days', min: 8, max: 10 },
  { key: '11-14', label: '11–14 days', min: 11, max: 14 },
  { key: '15+', label: '15+ days', min: 15, max: Infinity },
]

/** Packages with no usable duration — they still have to appear somewhere. */
export const UNKNOWN_BAND: LengthBand = { key: 'unknown', label: 'Length not set', min: 0, max: 0 }

/**
 * Day count for a package row.
 *
 * Prefers the stored overview, but a package saved before that was recomputed can carry
 * a stale or missing value — so fall back to the arrival/departure columns, which are
 * always current. Returns 0 when neither is usable.
 */
export function packageDays(row: any): number {
  const ov = row?.data?.overview
  const days = Number(ov?.days) || 0
  if (days > 0) return days

  const nights = Number(ov?.nights) || 0
  if (nights > 0) return nights + 1

  const a = Date.parse(row?.arrival_date ?? '')
  const b = Date.parse(row?.departure_date ?? '')
  if (!isNaN(a) && !isNaN(b) && b >= a) return Math.round((b - a) / 86400000) + 1

  return 0
}

export function bandFor(days: number): LengthBand {
  if (!days || days < 1) return UNKNOWN_BAND
  return LENGTH_BANDS.find((b) => days >= b.min && days <= b.max) ?? LENGTH_BANDS[LENGTH_BANDS.length - 1]
}

/* ------------------------------------------------------------------ grouping */

export interface BandGroup { band: LengthBand; rows: any[] }
export interface CategoryGroup { category: PackageCategory; rows: any[]; bands: BandGroup[] }

/**
 * Category → length band → rows, in a fixed order so the list does not reshuffle as
 * packages are added. Empty groups are dropped; row order inside a band is preserved
 * from the caller, which sorts by created_at.
 */
export function groupPackages(rows: any[]): CategoryGroup[] {
  const byCat = new Map<PackageCategory, any[]>()
  for (const r of rows) {
    const c = categoryOf(r)
    if (!byCat.has(c)) byCat.set(c, [])
    byCat.get(c)!.push(r)
  }

  const out: CategoryGroup[] = []
  for (const category of CATEGORY_ORDER) {
    const list = byCat.get(category)
    if (!list?.length) continue

    const bands: BandGroup[] = []
    for (const band of [...LENGTH_BANDS, UNKNOWN_BAND]) {
      const inBand = list.filter((r) => bandFor(packageDays(r)).key === band.key)
      if (inBand.length) bands.push({ band, rows: inBand })
    }
    out.push({ category, rows: list, bands })
  }
  return out
}
