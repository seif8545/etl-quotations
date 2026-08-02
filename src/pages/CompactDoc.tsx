import { forwardRef, Fragment, useEffect } from 'react'

/** One site with its resolved photo. */
export interface SiteTile {
  name: string
  photoUrl: string
  /** width / height of the real file, measured at runtime. 0 = not measured yet. */
  aspect: number
}

/** A destination, what happens there, and its photos. */
export interface CityGroup {
  city: string
  /** Highlights as bullets, drawn from the days spent here or typed by the agent. */
  bullets: string[]
  /** 1–4 photos — rendered as a rounded mosaic inside one fixed plate footprint. */
  photos: SiteTile[]
}

/** One accommodation line. Hotels and cruises are listed separately, as their own cards. */
export interface StayLine {
  nights: number
  destination: string
  hotel: string
}

export interface CompactPricingRow {
  category: string
  dbl: number
  single: number
  triple: number
  quad: number
  hotels: string
}

/** Show/hide switches that apply to the compact card only — never to the full PDF. */
export interface CompactSections {
  stays: boolean
  inclusions: boolean
  excluded: boolean
  trust: boolean
  pricing: boolean
  stats: boolean
  dates: boolean
}

export const DEFAULT_SECTIONS = (): CompactSections => ({
  stays: true, inclusions: true, excluded: true, trust: true, pricing: true, stats: true, dates: true,
})

/** The three trust badges along the bottom strip — editable, because claims change. */
export const DEFAULT_TRUST = (): string[] => [
  'Licensed tour operator',
  '4.8 / 5 on TripAdvisor',
  '24/7 support in Egypt',
]

export interface CompactData {
  title: string
  logoUrl: string
  meta: { ref: string; pax: number; arrival: string; departure: string }
  overview: { days: number; nights: number; cities: number; pax: number }
  groups: CityGroup[]
  stays: StayLine[]
  included: string[]
  excluded: string[]
  price: { pp: number; sgl: number; show: boolean }
  pricing: { show: boolean; rows: CompactPricingRow[]; columns?: 'all' | 'dbl' | 'single' | 'triple' | 'quad' }
  contact: { phone: string; email: string; website: string; social: string }
  roomBasis?: string
  /** 0 = roomy … 4 = tightest. Driven by the fit loop in PackageBuilder. */
  density: number
  /** Per-section visibility on the card. Missing = everything on. */
  sections?: CompactSections
  /** Trust strip lines. Missing = the three defaults. */
  trust?: string[]
  /**
   * Last-resort shrink, 0.8–1. The five density steps handle nearly everything; a
   * package with three long stops and ten inclusions can still run past the bottom of
   * a 4:5 card, and losing the price off the end of a sales sheet is worse than
   * setting it a few percent smaller. Applied as a transform, so it costs no layout.
   */
  fit?: number
}

/** Design box. 860 x 1075 is exactly 4:5, and exports to a 1080 x 1350 PNG. */
export const SHEET_W = 860
export const SHEET_H = 1075

/**
 * Destination photo plate, [width, height] per density step.
 *
 * The stops ZIG-ZAG: photo left / text right, then mirrored, with a dashed hand-drawn
 * connector looping from one stop down into the next. A landscape plate (not the old
 * circle) sits beside the bullet list, which reads as a journey you follow rather than
 * a stack of rows. Sources are mostly portrait (0.56-0.84), so the plate stays close to
 * square-ish and the crop is biased upward via FOCUS.
 *
 * Both dimensions are written inline: never leave a captured element sized in one
 * dimension only (handoff.md section 8C).
 */
export const PLATE: [number, number][] = [
  [243, 134],
  [230, 126],
  [214, 118],
  [198, 108],
  [182, 100],
]

/**
 * A destination may carry 1-4 photos. They share ONE plate footprint so the vertical
 * rhythm of the card never changes with the photo count — only the mosaic inside it.
 *
 *   1  one full plate
 *   2  two stacked halves
 *   3  one tall left + two stacked right
 *   4  a 2 x 2 grid
 *
 * Multi-photo plates are given a little extra height (they carry more detail per
 * tile and would otherwise read as letterbox slivers), capped so the fit loop can
 * still condense its way out of an overflow.
 */
export const MAX_TILES = 4
const MOSAIC_H_BOOST = [1, 1.34, 1.34, 1.34]

/** Gap between tiles, per density step. */
const MOSAIC_GAP = [5, 5, 4, 4, 3]

export function plateBox(density: number, count: number): [number, number] {
  const k = Math.max(0, Math.min(PLATE.length - 1, density))
  const [w, h] = PLATE[k]
  const n = Math.max(1, Math.min(MAX_TILES, count || 1))
  return [w, Math.round(h * MOSAIC_H_BOOST[n - 1])]
}

/** Kept for compatibility with earlier callers. */
export const DISC = [156, 142, 128, 116, 104]

/** Bias the crop upward — monuments and buildings sit above the centre line. */
export const FOCUS = 'center 38%'

/*
 * A light, airy itinerary card.
 *
 * Mostly warm white, one gold accent, and a dashed terracotta trail that carries the
 * eye from destination to destination. Hotels and cruises are listed as separate stay
 * cards; the inclusions grid sits under them; pricing shows every tier offered plus a
 * single supplement when there is one.
 *
 * Rendering rules carried over from ItineraryDoc (handoff.md section 8):
 *   - CSS goes in document.head, never an inline <style> inside the captured node
 *   - photos are background-image on fixed-size boxes, never <img> + object-fit
 *   - the logo <img> is sized in BOTH dimensions and fed a data URL by the caller
 */
const CSS = `
.cptx { width: ${SHEET_W}px; height: ${SHEET_H}px; overflow: hidden; display: flex; flex-direction: column; background: #fffdf7; color: #24384f; font-family: 'Inter', system-ui, sans-serif; line-height: 1.5; }

/*
 * Switch off iOS text autosizing, everywhere inside the sheet.
 *
 * Safari on iPhone inflates text inside any block much wider than the viewport — and
 * this sheet is a fixed 860px being laid out behind a 390px phone, so it qualifies.
 * The boxes keep their given sizes while only the type grows, which is why the card
 * came out with correctly-sized photos and text spilling off the bottom. It bites
 * hardest during capture, because html2canvas re-lays the clone out in its own iframe
 * and can boost it harder than the live node the fit loop measured — the card looked
 * like it fitted, then exported clipped.
 */
.cptx, .cptx * { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }

.cptx * { box-sizing: border-box; }
.cptx .fr { font-family: 'Fraunces', Georgia, serif; }

/* ---------- Header ---------- */
.cx-head { flex-shrink: 0; background: linear-gradient(135deg,#0e2a47 0%,#14375e 60%,#0b2038 100%); color: #fff; padding: 15px 35px 12px; display: flex; align-items: flex-end; gap: 24px; }
.cx-head-l { flex: 1; min-width: 0; }
.cx-title { font-size: 36px; font-weight: 600; line-height: 1.03; margin: 0; color: #fff; letter-spacing: -0.4px; }
.cx-meta { font-size: 15px; color: rgba(255,255,255,0.78); margin-top: 6px; font-weight: 500; }
.cx-meta i { font-style: normal; color: #f0c53a; margin: 0 7px; }
.cx-stats { flex-shrink: 0; display: flex; gap: 26px; padding-bottom: 3px; }
.cx-stats > div { text-align: center; }
.cx-stats b { display: block; font-size: 25px; font-weight: 600; color: #e8b015; line-height: 1; }
.cx-stats span { display: block; margin-top: 4px; font-size: 11px; letter-spacing: 2.2px; text-transform: uppercase; color: rgba(255,255,255,0.6); }

/* ---------- Body: every block shares the leftover air ---------- */
.cx-body { flex: 1; min-height: 0; padding: 13px 35px 10px; display: flex; flex-direction: column; justify-content: space-between; }

/* ---------- Zig-zag stops ---------- */
.cx-stop { flex-shrink: 0; display: flex; align-items: center; gap: 21px; }
.cx-stop.alt { flex-direction: row-reverse; }
.cx-plate { flex-shrink: 0; border-radius: 12px; background-size: cover; background-position: ${FOCUS}; background-repeat: no-repeat; background-color: #e9e2d2; box-shadow: 0 5px 15px rgba(14,42,71,0.16); }

/* Mosaic: 2-4 photos share the plate footprint. Grid, so every tile is sized in
   both dimensions — html2canvas will not guess a height for us. */
.cx-mosaic { flex-shrink: 0; display: grid; }
.cx-mosaic .cx-tile { border-radius: 10px; background-size: cover; background-position: ${FOCUS}; background-repeat: no-repeat; background-color: #e9e2d2; box-shadow: 0 4px 12px rgba(14,42,71,0.14); }
.cx-mosaic.m2 { grid-template-columns: 1fr; grid-template-rows: 1fr 1fr; }
.cx-mosaic.m3 { grid-template-columns: 1.32fr 1fr; grid-template-rows: 1fr 1fr; }
.cx-mosaic.m3 .cx-tile:first-child { grid-row: 1 / span 2; }
.cx-mosaic.m4 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
.cx-stop-body { flex: 1; min-width: 0; }
.cx-stop-head { display: flex; align-items: baseline; gap: 10px; }
.cx-stop-no { font-size: 17px; font-weight: 700; color: #e8b015; line-height: 1; }
.cx-stop-name { font-size: 24px; font-weight: 600; line-height: 1.1; color: #0e2a47; margin: 0; }
.cx-bul { list-style: none; margin: 7px 0 0; padding: 0; }
.cx-bul li { position: relative; padding-left: 14px; margin-bottom: 2px; font-size: 15px; line-height: 1.32; color: #556475; }
.cx-bul li:last-child { margin-bottom: 0; }
.cx-bul li::before { content: '·'; position: absolute; left: 3px; top: -1px; color: #d4a520; font-weight: 700; }

/* ---------- Dashed trail between stops ---------- */
.cx-trail { flex-shrink: 0; display: flex; justify-content: center; }
.cx-trail svg { display: block; }
.cx-trail.flip svg { transform: scaleX(-1); }

/* ---------- Stays: hotels and cruises, each its own card ---------- */
.cx-rule { flex-shrink: 0; border-top: 2px dotted #e2d5b4; }
.cx-stays { flex-shrink: 0; display: flex; gap: 10px; }
.cx-stay { flex: 1; min-width: 0; background: #faf5e9; border: 1px solid #f0e6cf; border-radius: 11px; padding: 7px 11px; }
.cx-stay b { display: block; font-size: 18px; font-weight: 600; color: #0e2a47; line-height: 1.1; }
.cx-stay span { display: block; font-size: 14px; line-height: 1.25; color: #6b7889; margin-top: 2px; }

/* ---------- Inclusions ---------- */
.cx-inc { flex-shrink: 0; display: flex; flex-wrap: wrap; gap: 4px 20px; }
.cx-inc div { width: calc(33.333% - 14px); position: relative; padding-left: 15px; font-size: 14px; line-height: 1.3; color: #4a5a6e; }
.cx-inc div::before { content: '✓'; position: absolute; left: 0; top: 0; color: #2f8a4a; font-weight: 700; font-size: 13px; }
.cx-exc { flex-shrink: 0; font-size: 12.5px; line-height: 1.4; color: #9aa5b1; }
.cx-exc b { color: #a83828; font-weight: 600; font-size: 11px; letter-spacing: 1.3px; text-transform: uppercase; margin-right: 6px; }

/* ---------- Trust strip ---------- */
.cx-trust { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.cx-trust div { font-size: 14px; color: #6b7889; font-weight: 500; white-space: nowrap; }
.cx-trust i { font-style: normal; color: #d4a520; margin-right: 6px; }

/* ---------- Pricing: every tier offered, on one line ---------- */
.cx-price { flex-shrink: 0; background: #fbf6ea; border: 1px dashed #e0cf9f; border-radius: 12px; padding: 7px 16px; display: flex; align-items: center; gap: 14px; }
.cx-price-lead { flex-shrink: 0; display: flex; align-items: baseline; gap: 8px; }
.cx-price-lead em { font-style: normal; font-size: 12px; letter-spacing: 2.2px; text-transform: uppercase; color: #b08a1e; font-weight: 600; }
.cx-price-lead b { font-size: 32px; font-weight: 600; line-height: 1; color: #0e2a47; }
.cx-price-lead span { font-size: 13.5px; color: #7d8898; }
.cx-tiers { flex: 1; display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 7px; }
.cx-tier { border: 1px solid #e3d3a8; border-radius: 9px; padding: 3px 11px; display: flex; align-items: baseline; gap: 7px; background: #fffdf7; }
.cx-tier.on { border-color: #e8b015; background: #fdf3d8; }
.cx-tier.sgl { border-style: dashed; border-color: #d9c79a; }
.cx-tier em { font-style: normal; font-size: 12px; letter-spacing: 1.2px; text-transform: uppercase; color: #8a93a0; font-weight: 600; }
.cx-tier.on em { color: #b08a1e; }
.cx-tier b { font-size: 18px; font-weight: 600; color: #0e2a47; }
.cx-pnote { flex-shrink: 0; font-size: 12px; color: #a09880; }

/* ---------- Footer ---------- */
.cx-foot { flex-shrink: 0; background: linear-gradient(180deg,#0e2a47,#081a30); color: #fff; padding: 9px 35px; display: flex; align-items: center; justify-content: space-between; }
.cx-foot-brand { font-size: 19px; font-weight: 700; color: #e8b015; letter-spacing: 2.2px; line-height: 1; }
.cx-foot-brand span { display: block; font-size: 10px; letter-spacing: 6px; color: #c8960a; margin-top: 3px; }
.cx-foot-rows { display: flex; gap: 20px; font-size: 15px; }
.cx-foot-rows b { color: #e8b015; font-weight: 600; margin-right: 5px; }

/* ================= Density steps ================= */
.cptx.k1 .cx-title { font-size: 33px; }
.cptx.k1 .cx-stop-name { font-size: 22px; }
.cptx.k1 .cx-bul li { font-size: 14px; }
.cptx.k1 .cx-head { padding: 13px 33px 11px; }
.cptx.k1 .cx-body { padding: 11px 33px 9px; }

.cptx.k2 .cx-title { font-size: 30px; }
.cptx.k2 .cx-stop-name { font-size: 20.5px; }
.cptx.k2 .cx-bul li { font-size: 13px; margin-bottom: 1px; }
.cptx.k2 .cx-stats b { font-size: 22px; }
.cptx.k2 .cx-head { padding: 12px 31px 10px; }
.cptx.k2 .cx-body { padding: 10px 31px 8px; }
.cptx.k2 .cx-inc div { font-size: 13px; }
.cptx.k2 .cx-stay b { font-size: 17px; }
.cptx.k2 .cx-price-lead b { font-size: 29px; }

.cptx.k3 .cx-title { font-size: 27px; }
.cptx.k3 .cx-stop-name { font-size: 19px; }
.cptx.k3 .cx-bul li { font-size: 12.5px; line-height: 1.28; }
.cptx.k3 .cx-stats b { font-size: 20px; }
.cptx.k3 .cx-head { padding: 11px 29px 9px; }
.cptx.k3 .cx-body { padding: 9px 29px 8px; }
.cptx.k3 .cx-inc div { font-size: 12px; }
.cptx.k3 .cx-stay { padding: 6px 10px; }
.cptx.k3 .cx-stay b { font-size: 16px; }
.cptx.k3 .cx-stay span { font-size: 13px; }
.cptx.k3 .cx-price { padding: 6px 14px; }
.cptx.k3 .cx-price-lead b { font-size: 26px; }
.cptx.k3 .cx-trust div { font-size: 13px; }

.cptx.k4 .cx-title { font-size: 25px; }
.cptx.k4 .cx-stop-name { font-size: 17.5px; }
.cptx.k4 .cx-stop { gap: 17px; }
.cptx.k4 .cx-bul li { font-size: 11.5px; line-height: 1.26; padding-left: 12px; }
.cptx.k4 .cx-stats b { font-size: 18px; }
.cptx.k4 .cx-head { padding: 10px 27px 8px; }
.cptx.k4 .cx-body { padding: 8px 27px 7px; }
.cptx.k4 .cx-inc div { font-size: 11px; }
.cptx.k4 .cx-stay { padding: 5px 9px; }
.cptx.k4 .cx-stay b { font-size: 15px; }
.cptx.k4 .cx-stay span { font-size: 12px; }
.cptx.k4 .cx-price { padding: 5px 13px; }
.cptx.k4 .cx-price-lead b { font-size: 24px; }
.cptx.k4 .cx-tier b { font-size: 16px; }
.cptx.k4 .cx-trust div { font-size: 12px; }
.cptx.k4 .cx-foot { padding: 7px 27px; }
`

/** yyyy-mm-dd -> "26 Jul 2027". Parsed as UTC so the date never shifts a day. */
function fmtDate(s: string): string {
  if (!s) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (!m) return s
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  if (isNaN(dt.getTime())) return s
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

/** Hand-drawn dashed trail with a loop in the middle, pointing into the next stop. */
function Trail({ flip, width }: { flip: boolean; width: number }) {
  const h = 34
  return (
    <div className={`cx-trail${flip ? ' flip' : ''}`}>
      <svg width={width} height={h} viewBox="0 0 790 34" fill="none" aria-hidden="true">
        <path
          d="M112 10 C 215 28, 302 31, 347 21 C 371 15, 365 4, 349 6 C 333 9, 335 24, 360 28 C 430 41, 558 26, 634 13"
          stroke="#c8760a"
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeDasharray="1 8"
          opacity={0.7}
        />
        <path
          d="M621 6 L636 12 L625 22"
          stroke="#c8760a"
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          opacity={0.7}
        />
      </svg>
    </div>
  )
}

/**
 * The photo block for one destination: a single plate, or a mosaic of up to four.
 * Both dimensions are always inline (handoff.md section 8C).
 */
function Plate({ photos, width, height, gap }: { photos: SiteTile[]; width: number; height: number; gap: number }) {
  const tiles = photos.filter((p) => p && p.photoUrl).slice(0, MAX_TILES)

  if (tiles.length <= 1) {
    return (
      <div
        className="cx-plate"
        style={{ width, height, backgroundImage: tiles[0] ? `url("${tiles[0].photoUrl}")` : undefined }}
      />
    )
  }

  return (
    <div className={`cx-mosaic m${tiles.length}`} style={{ width, height, gap }}>
      {tiles.map((t, i) => (
        <div key={i} className="cx-tile" style={{ backgroundImage: `url("${t.photoUrl}")` }} />
      ))}
    </div>
  )
}

type PriceColKey = 'dbl' | 'single' | 'triple' | 'quad'

const CompactDoc = forwardRef<HTMLDivElement, { data: CompactData }>(({ data }, ref) => {
  const d = data

  useEffect(() => {
    if (typeof document === 'undefined') return
    let el = document.getElementById('cptx-doc-css') as HTMLStyleElement | null
    if (!el) { el = document.createElement('style'); el.id = 'cptx-doc-css'; document.head.appendChild(el) }
    el.textContent = CSS
  }, [])

  const k = Math.max(0, Math.min(4, d.density))
  const gap = MOSAIC_GAP[k]
  const trailW = SHEET_W - (k >= 4 ? 54 : k >= 2 ? 62 : 70) - 130
  const sec = { ...DEFAULT_SECTIONS(), ...(d.sections ?? {}) }
  const trust = (d.trust ?? DEFAULT_TRUST()).map((t) => (t ?? '').trim()).filter(Boolean)

  const tierRows = d.pricing.rows.filter(
    (r) => (r.category ?? '').trim() && (r.dbl > 0 || r.single > 0 || r.triple > 0 || r.quad > 0),
  )
  const showTiers = d.pricing.show && tierRows.length > 0
  const basis = d.roomBasis || 'double'

  /* One headline number per tier: whichever occupancy the package is actually sold
     on, so a card never leads with a dash. */
  const headline = (r: CompactPricingRow): { value: number; label: string } => {
    const order: [PriceColKey, string][] =
      d.pricing.columns && d.pricing.columns !== 'all'
        ? [[d.pricing.columns, d.pricing.columns === 'single' ? 'single' : d.pricing.columns === 'triple' ? 'triple' : d.pricing.columns === 'quad' ? 'quad' : 'double']]
        : [['dbl', 'double'], ['triple', 'triple'], ['quad', 'quad'], ['single', 'single']]
    for (const [key, label] of order) if ((r[key] || 0) > 0) return { value: r[key] || 0, label }
    return { value: 0, label: basis }
  }

  /* Lead price: the cheapest tier on offer, or the flat package price. */
  const leadTier = showTiers
    ? tierRows.map(headline).filter((x) => x.value > 0).sort((a, b) => a.value - b.value)[0]
    : undefined
  const lead = leadTier?.value || d.price.pp
  const leadLabel = leadTier?.label || basis

  return (
    <div className={`cptx k${k}`} ref={ref}>

      {/* ---------- Header ---------- */}
      <div className="cx-head">
        <div className="cx-head-l">
          <h1 className="fr cx-title">{d.title}</h1>
          <div className="cx-meta">
            {d.groups.map((g) => g.city).join(' · ')}
            {sec.dates && d.meta.arrival ? <><i>·</i>{fmtDate(d.meta.arrival)}{d.meta.departure ? <><i>→</i>{fmtDate(d.meta.departure)}</> : null}</> : null}
          </div>
        </div>
        {sec.stats && (
          <div className="cx-stats">
            <div><b className="fr">{d.overview.days}</b><span>{d.overview.days === 1 ? 'Day' : 'Days'}</span></div>
            <div><b className="fr">{d.overview.nights}</b><span>{d.overview.nights === 1 ? 'Night' : 'Nights'}</span></div>
            <div><b className="fr">{d.overview.cities}</b><span>{d.overview.cities === 1 ? 'City' : 'Cities'}</span></div>
          </div>
        )}
      </div>

      {/* ---------- Body ---------- */}
      {/* Widened by 1/fit before being scaled back down, so a shrunk body still spans
          the full sheet and its 35px gutters stay aligned with the header and footer
          instead of stepping inwards. */}
      <div
        className="cx-body"
        data-cx-body="1"
        style={d.fit && d.fit < 1
          ? { transform: `scale(${d.fit})`, transformOrigin: 'top left', width: `${100 / d.fit}%` }
          : undefined}
      >

        {d.groups.map((g, gi) => {
          const tiles = (g.photos ?? []).filter((p) => p && p.photoUrl).slice(0, MAX_TILES)
          const [plateW, plateH] = plateBox(d.density, tiles.length)
          const alt = gi % 2 === 1
          return (
            <Fragment key={`stop-${gi}`}>
              {gi > 0 && <Trail flip={gi % 2 === 1} width={trailW} />}
              <div className={`cx-stop${alt ? ' alt' : ''}`}>
                <Plate photos={tiles} width={plateW} height={plateH} gap={gap} />
                <div className="cx-stop-body">
                  <div className="cx-stop-head">
                    <span className="fr cx-stop-no">{String(gi + 1).padStart(2, '0')}</span>
                    <h4 className="fr cx-stop-name">{g.city}</h4>
                  </div>
                  {g.bullets.length > 0 && (
                    <ul className="cx-bul">
                      {g.bullets.map((b, i) => <li key={i}>{b}</li>)}
                    </ul>
                  )}
                </div>
              </div>
            </Fragment>
          )
        })}

        {/* ---------- Stays: hotels and cruises, listed separately ---------- */}
        {sec.stays && d.stays.length > 0 && (
          <>
            <div className="cx-rule" />
            <div className="cx-stays">
              {d.stays.map((st, i) => (
                <div className="cx-stay" key={i}>
                  <b className="fr">{st.nights} {st.nights === 1 ? 'night' : 'nights'} · {st.destination}</b>
                  {st.hotel ? <span>{st.hotel}</span> : null}
                </div>
              ))}
            </div>
          </>
        )}

        {/* ---------- Inclusions ---------- */}
        {sec.inclusions && d.included.length > 0 && (
          <div className="cx-inc">
            {d.included.map((t, i) => <div key={i}>{t.replace(/\.$/, '')}</div>)}
          </div>
        )}

        {sec.excluded && d.excluded.length > 0 && (
          <div className="cx-exc">
            <b>Not included</b>
            {d.excluded.map((t) => (t ?? '').trim().replace(/\.$/, '')).filter(Boolean).join(' · ')}.
          </div>
        )}

        {/* ---------- Trust ---------- */}
        {sec.trust && trust.length > 0 && (
          <div className="cx-trust">
            {trust.map((t, i) => <div key={i}><i>◆</i>{t}</div>)}
          </div>
        )}

        {/* ---------- Pricing: every tier offered, plus single supplement ---------- */}
        {!sec.pricing ? null : lead > 0 ? (
          <div className="cx-price">
            <div className="cx-price-lead">
              <em>From</em>
              <b className="fr">${lead.toLocaleString()}</b>
              <span>pp · {leadLabel}</span>
            </div>
            <div className="cx-tiers">
              {showTiers && tierRows.map((r, i) => {
                const hd = headline(r)
                if (hd.value <= 0) return null
                return (
                  <div className={`cx-tier${i === tierRows.length - 1 ? ' on' : ''}`} key={i}>
                    <em>{r.category}</em>
                    <b className="fr">${hd.value.toLocaleString()}</b>
                  </div>
                )
              })}
              {d.price.sgl > 0 && (
                <div className="cx-tier sgl">
                  <em>Single supp.</em>
                  <b className="fr">+${d.price.sgl.toLocaleString()}</b>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="cx-pnote">Pricing on request — please contact us for a tailored quotation.</div>
        )}
      </div>

      {/* ---------- Footer ---------- */}
      <div className="cx-foot">
        <div className="fr cx-foot-brand">EGYPT TOP LIGHT<span>T R A V E L</span></div>
        <div className="cx-foot-rows">
          <div><b>WhatsApp</b>{d.contact.phone}</div>
          <div><b>Web</b>{d.contact.website}</div>
        </div>
      </div>
    </div>
  )
})

export default CompactDoc
