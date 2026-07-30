import { forwardRef, useEffect } from 'react'

import type { Segment } from '../lib/segments'

/** One site with its resolved thumbnail. */
export interface SiteTile {
  name: string
  photoUrl: string
}

/** A derived stay block, ready to render. */
export interface CompactSegment extends Segment {
  tiles: SiteTile[]
}

export interface CompactPricingRow {
  category: string
  dbl: number
  single: number
  triple: number
  quad: number
  hotels: string
}

export interface CompactData {
  title: string
  intro: string
  logoUrl: string
  meta: { ref: string; pax: number; arrival: string; departure: string }
  overview: { days: number; nights: number; cities: number; pax: number }
  /** Destination names in travel order, shown under the stats. */
  cities: string[]
  segments: CompactSegment[]
  included: string[]
  excluded: string[]
  price: { pp: number; sgl: number; show: boolean }
  pricing: { show: boolean; rows: CompactPricingRow[]; columns?: 'all' | 'dbl' | 'single' | 'triple' | 'quad' }
  contact: { phone: string; email: string; website: string; social: string }
  roomBasis?: string
  /** 0 = roomy … 4 = tightest. Driven by the fit loop in PackageBuilder. */
  density: number
}

/** Sheet width in CSS px. Exported at 2x, so the PNG is 1800px wide. */
export const SHEET_W = 900

/*
 * A single, continuous sheet — NOT paginated.
 *
 * The first cut of this used fixed 794x1123 A4 pages and spilled onto a second one,
 * which is wrong for the actual use case: these get pasted into WhatsApp and
 * Instagram, where two stacked A4 pages means a wall of dead space between them and
 * a second "page" nobody scrolls to. So the sheet is one column of natural height:
 * short itineraries produce a short image with no trailing whitespace, long ones
 * step the density down until they fit the target height. Nothing is ever clipped —
 * worst case the image is a little taller than the target.
 *
 * Rendering rules carried over from ItineraryDoc (handoff.md section 8):
 *   - CSS goes in document.head, never an inline <style> inside the captured node
 *   - photos are background-image on fixed-size boxes, never <img> + object-fit
 *   - the logo <img> is sized in BOTH dimensions and fed a data URL by the caller
 */
const CSS = `
.cptx { width: ${SHEET_W}px; background: #fffefa; color: #0e2a47; font-family: 'Inter', system-ui, sans-serif; line-height: 1.5; }
.cptx * { box-sizing: border-box; }
.cptx .fr { font-family: 'Fraunces', Georgia, serif; }

/* ---------- Header (no cover photo: solid brand block) ---------- */
.cx-head { background: linear-gradient(135deg,#0e2a47 0%,#14375e 55%,#081a30 100%); color: #fff; padding: 26px 36px 22px; }
.cx-head-top { display: flex; align-items: center; gap: 16px; margin-bottom: 18px; }
.cx-logo { background: #fff; border-radius: 999px; padding: 8px 18px; display: inline-block; flex-shrink: 0; }
.cx-logo img { width: 150px; height: 28px; display: block; }
.cx-eyebrow { margin-left: auto; font-size: 10px; letter-spacing: 3.2px; text-transform: uppercase; color: #f0c53a; text-align: right; }
.cx-title { font-size: 34px; font-weight: 600; line-height: 1.08; margin: 0; color: #fff; }
.cx-rule { width: 76px; height: 3px; background: linear-gradient(135deg,#c8960a,#e8b015); border-radius: 3px; margin: 13px 0 12px; }
.cx-meta { font-size: 13px; color: rgba(255,255,255,0.9); }
.cx-meta i { font-style: normal; color: #f0c53a; margin: 0 8px; }
.cx-stats { display: flex; margin-top: 18px; border-top: 1px solid rgba(255,255,255,0.16); padding-top: 15px; }
.cx-stats > div { flex: 1; text-align: center; border-left: 1px solid rgba(255,255,255,0.13); }
.cx-stats > div:first-child { border-left: none; }
.cx-stats b { display: block; font-size: 27px; font-weight: 600; color: #e8b015; line-height: 1; }
.cx-stats span { display: block; margin-top: 5px; font-size: 9px; letter-spacing: 2.2px; text-transform: uppercase; color: rgba(255,255,255,0.62); }
.cx-cities { margin-top: 14px; font-size: 11.5px; color: rgba(255,255,255,0.82); }
.cx-cities b { color: #f0c53a; font-weight: 600; font-size: 9px; letter-spacing: 2px; text-transform: uppercase; margin-right: 9px; }
.cx-cities u { text-decoration: none; color: #7d93ad; margin: 0 7px; }

/* ---------- Body ---------- */
.cx-body { padding: 22px 36px 24px; }
.cx-intro { font-size: 13px; line-height: 1.6; color: #45566b; margin: 0 0 18px; }

.cx-sec-head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 12px; }
.cx-sec-head h3 { font-size: 19px; font-weight: 600; color: #0e2a47; margin: 0; white-space: nowrap; }
.cx-sec-head div { flex: 1; height: 2px; background: linear-gradient(90deg,#e8b015,rgba(232,176,21,0.10)); border-radius: 2px; }
.cx-sec { margin-bottom: 20px; }

/* ---------- Stay blocks ---------- */
.cx-blk { padding: 0 0 15px; margin-bottom: 15px; border-bottom: 1px solid #ece0c4; }
.cx-blk:last-child { border-bottom: none; padding-bottom: 0; margin-bottom: 0; }
.cx-blk-head { display: flex; align-items: baseline; gap: 12px; }
.cx-blk-city { font-size: 22px; font-weight: 600; color: #0e2a47; margin: 0; line-height: 1.15; }
.cx-blk-when { margin-left: auto; font-size: 10px; font-weight: 600; letter-spacing: 2.2px; text-transform: uppercase; color: #b08a1e; white-space: nowrap; }
.cx-blk-blurb { font-size: 12.5px; line-height: 1.55; color: #45566b; margin: 7px 0 0; }
.cx-blk-note { font-size: 11.5px; line-height: 1.45; color: #6a7789; font-style: italic; margin-top: 5px; }

.cx-tiles { display: flex; flex-wrap: wrap; gap: 9px; margin-top: 11px; }
.cx-tile { width: 118px; }
.cx-tile-img { width: 118px; height: 80px; border-radius: 8px; background-color: #e9e2d2; background-size: cover; background-position: center; }
.cx-tile-cap { font-size: 9.5px; line-height: 1.25; color: #55677d; margin-top: 4px; text-align: center; }

.cx-stay { margin-top: 11px; padding-top: 9px; border-top: 1px dashed #e7dcc2; font-size: 11.5px; color: #33465c; }
.cx-stay b { color: #b08a1e; font-weight: 600; font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase; margin-right: 7px; }
.cx-stay u { text-decoration: none; color: #cbbfa4; margin: 0 10px; }

/* ---------- Included / excluded ---------- */
.cx-inc { display: flex; gap: 30px; }
.cx-inc-col { flex: 1; min-width: 0; }
.cx-inc-col h4 { font-size: 12.5px; color: #0e2a47; margin: 0 0 8px; font-family: 'Fraunces', Georgia, serif; }
.cx-inc-item { display: flex; align-items: flex-start; gap: 7px; font-size: 11px; color: #3a495c; margin-bottom: 5px; line-height: 1.4; }
.cx-mark { flex-shrink: 0; font-weight: 700; }
.cx-mark.yes { color: #1a6e2e; }
.cx-mark.no { color: #a83828; }

/* ---------- Pricing ---------- */
.cx-ptable { width: 100%; border-collapse: collapse; font-size: 11.5px; }
.cx-ptable th { text-align: left; background: #0e2a47; color: #fff; font-weight: 600; padding: 8px 12px; font-size: 9.5px; letter-spacing: 0.6px; text-transform: uppercase; }
.cx-ptable td { padding: 9px 12px; border-bottom: 1px solid #eee2c8; vertical-align: top; }
.cx-ptable tr:last-child td { border-bottom: none; }
.cx-pt-cat { color: #0e2a47; font-weight: 600; white-space: nowrap; }
.cx-pt-price { color: #806000; font-weight: 600; white-space: nowrap; }
.cx-pt-hotels { color: #6a7789; font-size: 10.5px; line-height: 1.4; }
.cx-pbox { background: linear-gradient(135deg,#0e2a47,#163d6b); color: #fff; border-radius: 14px; padding: 16px 24px; display: flex; align-items: center; gap: 22px; }
.cx-pbox-eyebrow { color: #f0c53a; font-size: 9.5px; letter-spacing: 2.6px; text-transform: uppercase; }
.cx-pbox-big { font-size: 32px; font-weight: 600; margin: 3px 0 0; line-height: 1; }
.cx-pbox-r { font-size: 11.5px; color: rgba(255,255,255,0.85); line-height: 1.55; }
.cx-pbox-r b { color: #f0c53a; font-weight: 600; }
.cx-pnote { font-size: 10.5px; color: #8a7a5c; margin-top: 7px; }

/* ---------- Footer ---------- */
.cx-foot { background: linear-gradient(180deg,#0e2a47,#081a30); color: #fff; padding: 15px 36px; display: flex; align-items: center; justify-content: space-between; }
.cx-foot-brand { font-size: 15px; font-weight: 600; color: #e8b015; letter-spacing: 2px; }
.cx-foot-brand span { display: block; font-size: 7.5px; letter-spacing: 5px; color: #c8960a; margin-top: 1px; }
.cx-foot-rows { display: flex; gap: 22px; font-size: 11px; }
.cx-foot-rows b { color: #e8b015; font-weight: 600; margin-right: 5px; }

/* ================= Density steps =================
   Applied when the sheet is taller than the target. Each step trims type, tile
   size and vertical rhythm; nothing is ever removed, so a 20-day itinerary just
   renders denser rather than losing content. */
.cptx.k1 .cx-body { padding: 18px 32px 20px; }
.cptx.k1 .cx-intro { font-size: 12px; margin-bottom: 14px; }
.cptx.k1 .cx-blk { padding-bottom: 12px; margin-bottom: 12px; }
.cptx.k1 .cx-blk-city { font-size: 20px; }
.cptx.k1 .cx-blk-blurb { font-size: 12px; line-height: 1.5; }
.cptx.k1 .cx-tile, .cptx.k1 .cx-tile-img { width: 106px; }
.cptx.k1 .cx-tile-img { height: 72px; }
.cptx.k1 .cx-tiles { gap: 8px; margin-top: 9px; }
.cptx.k1 .cx-inc-item { font-size: 10.5px; margin-bottom: 4px; }
.cptx.k1 .cx-sec { margin-bottom: 16px; }
.cptx.k1 .cx-head { padding: 22px 32px 19px; }

.cptx.k2 .cx-body { padding: 15px 30px 17px; }
.cptx.k2 .cx-intro { font-size: 11.5px; margin-bottom: 11px; line-height: 1.5; }
.cptx.k2 .cx-blk { padding-bottom: 10px; margin-bottom: 10px; }
.cptx.k2 .cx-blk-city { font-size: 18px; }
.cptx.k2 .cx-blk-blurb { font-size: 11.5px; line-height: 1.45; margin-top: 5px; }
.cptx.k2 .cx-tile, .cptx.k2 .cx-tile-img { width: 94px; }
.cptx.k2 .cx-tile-img { height: 64px; }
.cptx.k2 .cx-tiles { gap: 7px; margin-top: 8px; }
.cptx.k2 .cx-tile-cap { font-size: 9px; }
.cptx.k2 .cx-inc-item { font-size: 10px; margin-bottom: 3px; }
.cptx.k2 .cx-sec { margin-bottom: 13px; }
.cptx.k2 .cx-sec-head { margin-bottom: 9px; }
.cptx.k2 .cx-sec-head h3 { font-size: 17px; }
.cptx.k2 .cx-head { padding: 19px 30px 16px; }
.cptx.k2 .cx-title { font-size: 30px; }
.cptx.k2 .cx-stats b { font-size: 24px; }
.cptx.k2 .cx-stay { margin-top: 8px; padding-top: 7px; font-size: 11px; }
.cptx.k2 .cx-ptable td { padding: 7px 10px; }

.cptx.k3 .cx-body { padding: 13px 28px 15px; }
.cptx.k3 .cx-intro { font-size: 11px; margin-bottom: 9px; line-height: 1.45; }
.cptx.k3 .cx-blk { padding-bottom: 8px; margin-bottom: 8px; }
.cptx.k3 .cx-blk-city { font-size: 16.5px; }
.cptx.k3 .cx-blk-blurb { font-size: 11px; line-height: 1.4; margin-top: 4px; }
.cptx.k3 .cx-blk-note { font-size: 10.5px; }
.cptx.k3 .cx-tile, .cptx.k3 .cx-tile-img { width: 84px; }
.cptx.k3 .cx-tile-img { height: 56px; }
.cptx.k3 .cx-tiles { gap: 6px; margin-top: 7px; }
.cptx.k3 .cx-tile-cap { font-size: 8.5px; margin-top: 3px; }
.cptx.k3 .cx-inc-item { font-size: 9.5px; margin-bottom: 2px; line-height: 1.35; gap: 5px; }
.cptx.k3 .cx-inc-col h4 { font-size: 11.5px; margin-bottom: 6px; }
.cptx.k3 .cx-sec { margin-bottom: 11px; }
.cptx.k3 .cx-sec-head { margin-bottom: 8px; }
.cptx.k3 .cx-sec-head h3 { font-size: 16px; }
.cptx.k3 .cx-head { padding: 16px 28px 14px; }
.cptx.k3 .cx-title { font-size: 27px; }
.cptx.k3 .cx-stats { margin-top: 13px; padding-top: 11px; }
.cptx.k3 .cx-stats b { font-size: 21px; }
.cptx.k3 .cx-stay { margin-top: 7px; padding-top: 6px; font-size: 10.5px; }
.cptx.k3 .cx-ptable { font-size: 10.5px; }
.cptx.k3 .cx-ptable td { padding: 6px 9px; }
.cptx.k3 .cx-pt-hotels { font-size: 9.5px; }

.cptx.k4 .cx-body { padding: 11px 26px 13px; }
.cptx.k4 .cx-intro { font-size: 10px; margin-bottom: 8px; line-height: 1.4; }
.cptx.k4 .cx-blk { padding-bottom: 7px; margin-bottom: 7px; }
.cptx.k4 .cx-blk-city { font-size: 15px; }
.cptx.k4 .cx-blk-blurb { font-size: 10px; line-height: 1.38; margin-top: 3px; }
.cptx.k4 .cx-blk-note { font-size: 9.5px; }
.cptx.k4 .cx-tile, .cptx.k4 .cx-tile-img { width: 74px; }
.cptx.k4 .cx-tile-img { height: 50px; }
.cptx.k4 .cx-tiles { gap: 5px; margin-top: 6px; }
.cptx.k4 .cx-tile-cap { font-size: 8px; margin-top: 2px; }
.cptx.k4 .cx-inc-item { font-size: 9px; margin-bottom: 2px; line-height: 1.3; gap: 4px; }
.cptx.k4 .cx-inc-col h4 { font-size: 11px; margin-bottom: 5px; }
.cptx.k4 .cx-inc { gap: 22px; }
.cptx.k4 .cx-sec { margin-bottom: 9px; }
.cptx.k4 .cx-sec-head { margin-bottom: 6px; }
.cptx.k4 .cx-sec-head h3 { font-size: 15px; }
.cptx.k4 .cx-head { padding: 14px 26px 12px; }
.cptx.k4 .cx-title { font-size: 24px; }
.cptx.k4 .cx-stats { margin-top: 11px; padding-top: 9px; }
.cptx.k4 .cx-stats b { font-size: 19px; }
.cptx.k4 .cx-stay { margin-top: 6px; padding-top: 5px; font-size: 10px; }
.cptx.k4 .cx-ptable { font-size: 10px; }
.cptx.k4 .cx-ptable td { padding: 5px 8px; }
.cptx.k4 .cx-pt-hotels { font-size: 9px; }
.cptx.k4 .cx-foot { padding: 12px 26px; }
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

type PriceColKey = 'dbl' | 'single' | 'triple' | 'quad'

const PRICE_COLS: { key: PriceColKey; label: string }[] = [
  { key: 'dbl', label: 'Per Person (Double)' },
  { key: 'single', label: 'Single Supplement' },
  { key: 'triple', label: 'Per Person (Triple)' },
  { key: 'quad', label: 'Per Person (Quad)' },
]

const CompactDoc = forwardRef<HTMLDivElement, { data: CompactData }>(({ data }, ref) => {
  const d = data

  useEffect(() => {
    if (typeof document === 'undefined') return
    let el = document.getElementById('cptx-doc-css') as HTMLStyleElement | null
    if (!el) { el = document.createElement('style'); el.id = 'cptx-doc-css'; document.head.appendChild(el) }
    el.textContent = CSS
  }, [])

  const segments = d.segments.filter((s) => !s.hidden)

  const tierRows = d.pricing.rows.filter(
    (r) => (r.category ?? '').trim() && (r.dbl > 0 || r.single > 0 || r.triple > 0 || r.quad > 0),
  )
  const showTable = d.pricing.show && tierRows.length > 0
  const mode = d.pricing.columns || 'all'
  const hasAny = (key: PriceColKey) => tierRows.some((r) => (r[key] || 0) > 0)
  const cols = mode === 'all'
    ? PRICE_COLS.filter((c) => c.key === 'dbl' || c.key === 'single' || hasAny(c.key))
    : PRICE_COLS.filter((c) => c.key === mode)
  const anyHotels = tierRows.some((r) => (r.hotels ?? '').trim())
  const basis = d.roomBasis || 'double'

  return (
    <div className={`cptx k${Math.max(0, Math.min(4, d.density))}`} ref={ref}>

      {/* ---------- Header ---------- */}
      <div className="cx-head">
        <div className="cx-head-top">
          <div className="cx-logo"><img src={d.logoUrl} alt="Egypt Top Light" /></div>
          <div className="cx-eyebrow">Tailor-Made<br />Egypt Itinerary</div>
        </div>
        <h1 className="fr cx-title">{d.title}</h1>
        <div className="cx-rule" />
        <div className="cx-meta">
          {d.meta.ref ? <>Ref {d.meta.ref}<i>·</i></> : null}
          {d.meta.pax} {d.meta.pax === 1 ? 'guest' : 'guests'}
          {d.meta.arrival ? <><i>·</i>{fmtDate(d.meta.arrival)}{d.meta.departure ? <><i>→</i>{fmtDate(d.meta.departure)}</> : null}</> : null}
        </div>
        <div className="cx-stats">
          <div><b className="fr">{d.overview.days}</b><span>{d.overview.days === 1 ? 'Day' : 'Days'}</span></div>
          <div><b className="fr">{d.overview.nights}</b><span>{d.overview.nights === 1 ? 'Night' : 'Nights'}</span></div>
          <div><b className="fr">{d.overview.cities}</b><span>{d.overview.cities === 1 ? 'City' : 'Cities'}</span></div>
          <div><b className="fr">{d.overview.pax}</b><span>{d.overview.pax === 1 ? 'Guest' : 'Guests'}</span></div>
        </div>
        {d.cities.length > 0 && (
          <div className="cx-cities">
            <b>Covering</b>
            {d.cities.map((c, i) => <span key={i}>{i > 0 ? <u>·</u> : null}{c}</span>)}
          </div>
        )}
      </div>

      {/* ---------- Body ---------- */}
      <div className="cx-body">

        {d.intro ? <p className="cx-intro">{d.intro}</p> : null}

        {segments.length > 0 && (
          <div className="cx-sec">
            <div className="cx-sec-head"><h3 className="fr">Your Itinerary</h3><div /></div>
            {segments.map((s) => (
              <div className="cx-blk" key={s.key}>
                <div className="cx-blk-head">
                  <h4 className="fr cx-blk-city">{s.destination}</h4>
                  <div className="cx-blk-when">{s.label}{s.dayRange ? ` · ${s.dayRange}` : ''}</div>
                </div>
                {s.blurb ? <p className="cx-blk-blurb">{s.blurb}</p> : null}
                {s.notes.map((n, k) => <div className="cx-blk-note" key={k}>{n}</div>)}
                {s.tiles.length > 0 && (
                  <div className="cx-tiles">
                    {s.tiles.map((t, k) => (
                      <div className="cx-tile" key={k}>
                        <div className="cx-tile-img" style={t.photoUrl ? { backgroundImage: `url("${t.photoUrl}")` } : undefined} />
                        <div className="cx-tile-cap">{t.name}</div>
                      </div>
                    ))}
                  </div>
                )}
                {(s.stay || s.meals) && (
                  <div className="cx-stay">
                    {s.stay ? <><b>Stay</b>{s.stay}</> : null}
                    {s.stay && s.meals ? <u>·</u> : null}
                    {s.meals ? <><b>Meals</b>{s.meals}</> : null}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {(d.included.length > 0 || d.excluded.length > 0) && (
          <div className="cx-sec">
            <div className="cx-sec-head"><h3 className="fr">What's Included</h3><div /></div>
            <div className="cx-inc">
              <div className="cx-inc-col">
                <h4>Included</h4>
                {d.included.map((t, i) => <div className="cx-inc-item" key={i}><span className="cx-mark yes">✓</span>{t}</div>)}
              </div>
              <div className="cx-inc-col">
                <h4>Not included</h4>
                {d.excluded.map((t, i) => <div className="cx-inc-item" key={i}><span className="cx-mark no">✕</span>{t}</div>)}
              </div>
            </div>
          </div>
        )}

        {/* Pricing is always present: tier table, else the per-person box, else an
            explicit "on request" line — never a blank space where a price should be. */}
        <div className="cx-sec" style={{ marginBottom: 0 }}>
          <div className="cx-sec-head"><h3 className="fr">Pricing</h3><div /></div>
          {showTable ? (
            <>
              <table className="cx-ptable">
                <thead>
                  <tr>
                    <th>Category</th>
                    {cols.map((c) => <th key={c.key}>{c.label}</th>)}
                    {anyHotels ? <th>Offered Hotels</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {tierRows.map((r, i) => (
                    <tr key={i}>
                      <td className="cx-pt-cat">{r.category}</td>
                      {cols.map((c) => <td className="cx-pt-price" key={c.key}>{(r[c.key] || 0) > 0 ? `${(r[c.key] || 0).toLocaleString()} USD` : '—'}</td>)}
                      {anyHotels ? (
                        <td className="cx-pt-hotels">
                          {(r.hotels ?? '').split('\n').map((l) => l.trim()).filter(Boolean).map((l, k) => <div key={k}>{l}</div>)}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="cx-pnote">Rates are per person in USD, based on {basis} room occupancy.</div>
            </>
          ) : d.price.pp > 0 ? (
            <div className="cx-pbox">
              <div>
                <div className="cx-pbox-eyebrow">Package Price</div>
                <div className="fr cx-pbox-big">${d.price.pp.toLocaleString()}</div>
              </div>
              <div className="cx-pbox-r">
                <div>per person · {basis} room occupancy</div>
                {d.price.sgl > 0 ? <div><b>Single supplement</b> ${d.price.sgl.toLocaleString()} per person</div> : null}
                <div>{d.overview.days} {d.overview.days === 1 ? 'day' : 'days'} · {d.overview.nights} {d.overview.nights === 1 ? 'night' : 'nights'} · {d.meta.pax} {d.meta.pax === 1 ? 'guest' : 'guests'}</div>
              </div>
            </div>
          ) : (
            <div className="cx-pnote">Pricing on request — please contact us for a tailored quotation.</div>
          )}
        </div>
      </div>

      {/* ---------- Footer ---------- */}
      <div className="cx-foot">
        <div className="fr cx-foot-brand">EGYPT TOP LIGHT<span>T R A V E L</span></div>
        <div className="cx-foot-rows">
          <div><b>WhatsApp</b>{d.contact.phone}</div>
          <div><b>Email</b>{d.contact.email}</div>
          <div><b>Web</b>{d.contact.website}</div>
        </div>
      </div>
    </div>
  )
})

export default CompactDoc
