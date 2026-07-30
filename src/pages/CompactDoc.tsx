import { forwardRef, useEffect } from 'react'

/** One site with its resolved photo. */
export interface SiteTile {
  name: string
  photoUrl: string
}

/** A city and everything the guest sees there. */
export interface CityGroup {
  city: string
  tiles: SiteTile[]
  /** Sites with no photo of their own — listed as names rather than given a wrong one. */
  more: string[]
}

/** One accommodation line. Deliberately subordinate to the sightseeing. */
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
}

/**
 * Sheet width in CSS px (exported at 2x → a 1600px PNG).
 *
 * Deliberately narrow. This card is read on a phone inside a chat thread, where the
 * image is scaled to ~380px: at 900px wide with 11px type the body text landed at
 * roughly 4.6 device px and was simply unreadable. Fewer words at a larger relative
 * size beats more words shrunk down — so the sheet is narrower, the type is bigger,
 * and the content is cut rather than compressed.
 */
export const SHEET_W = 800

/*
 * A single, continuous sheet — NOT paginated, and NOT organised by day.
 *
 * Grouping is by PLACE: each city lists what the guest sees there, with a photo per
 * site. Days, day ranges and per-day prose are all gone — on a phone they were noise,
 * and day-based grouping also put sights in the wrong city whenever a guest slept
 * somewhere other than where they toured. Accommodation is deliberately demoted to
 * one small line at the end: it is a detail, not the pitch.
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
.cx-title { font-size: 33px; font-weight: 600; line-height: 1.08; margin: 0; color: #fff; }
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
.cx-body { padding: 20px 30px 22px; }

.cx-sec-head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 13px; }
.cx-sec-head h3 { font-size: 20px; font-weight: 600; color: #0e2a47; margin: 0; white-space: nowrap; }
.cx-sec-head div { flex: 1; height: 2px; background: linear-gradient(90deg,#e8b015,rgba(232,176,21,0.10)); border-radius: 2px; }
.cx-sec { margin-bottom: 20px; }

/* ---------- City groups ---------- */
.cx-city { padding: 0 0 15px; margin-bottom: 15px; border-bottom: 1px solid #ece0c4; }
.cx-city:last-child { border-bottom: none; padding-bottom: 0; margin-bottom: 0; }
.cx-city-name { font-size: 25px; font-weight: 600; color: #0e2a47; margin: 0 0 10px; line-height: 1.12; }

/* Site photos with the name burned on, so there are no caption rows eating height
   and the label survives being scaled down to phone size. flex-wrap with a flexible
   basis means each row fills the width whatever the site count is. */
.cx-shots { display: flex; flex-wrap: wrap; gap: 8px; }
.cx-shot { flex: 1 1 158px; min-width: 148px; height: 112px; position: relative; overflow: hidden; border-radius: 10px; background-color: #e9e2d2; background-size: cover; background-position: center; }
.cx-shot-grad { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(8,26,48,0) 40%, rgba(8,26,48,0.9) 100%); }
.cx-shot-name { position: absolute; left: 10px; right: 10px; bottom: 8px; color: #fff; font-size: 13px; font-weight: 600; line-height: 1.18; text-shadow: 0 1px 6px rgba(0,0,0,0.55); }
.cx-more { margin-top: 8px; font-size: 12px; color: #55677d; line-height: 1.4; }
.cx-more b { color: #b08a1e; font-weight: 600; font-size: 9.5px; letter-spacing: 1.5px; text-transform: uppercase; margin-right: 7px; }

/* ---------- Accommodation: small, subordinate ---------- */
.cx-stays { margin-top: 4px; font-size: 11.5px; color: #6a7789; line-height: 1.5; }
.cx-stays b { color: #b08a1e; font-weight: 600; font-size: 9.5px; letter-spacing: 1.6px; text-transform: uppercase; margin-right: 8px; }
.cx-stays u { text-decoration: none; color: #cbbfa4; margin: 0 8px; }

/* ---------- Included / excluded ---------- */
.cx-inc { display: flex; gap: 30px; }
.cx-inc-col { flex: 1; min-width: 0; }
.cx-inc-col h4 { font-size: 13px; color: #0e2a47; margin: 0 0 8px; font-family: 'Fraunces', Georgia, serif; }
.cx-inc-item { display: flex; align-items: flex-start; gap: 7px; font-size: 12px; color: #3a495c; margin-bottom: 5px; line-height: 1.4; }
.cx-mark { flex-shrink: 0; font-weight: 700; }
.cx-mark.yes { color: #1a6e2e; }
.cx-mark.no { color: #a83828; }

/* ---------- Pricing ---------- */
.cx-ptable { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.cx-ptable th { text-align: left; background: #0e2a47; color: #fff; font-weight: 600; padding: 8px 12px; font-size: 9.5px; letter-spacing: 0.6px; text-transform: uppercase; }
.cx-ptable td { padding: 9px 12px; border-bottom: 1px solid #eee2c8; vertical-align: top; }
.cx-ptable tr:last-child td { border-bottom: none; }
.cx-pt-cat { color: #0e2a47; font-weight: 600; white-space: nowrap; }
.cx-pt-price { color: #806000; font-weight: 600; white-space: nowrap; }
.cx-pt-hotels { color: #6a7789; font-size: 11px; line-height: 1.4; }
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
   Applied when the sheet runs past the target height. Each step trims type, shot
   height and vertical rhythm together; nothing is ever removed, so a long itinerary
   renders denser rather than losing content. */
.cptx.k1 .cx-body { padding: 17px 28px 19px; }
.cptx.k1 .cx-head { padding: 22px 28px 18px; }
.cptx.k1 .cx-city { padding-bottom: 13px; margin-bottom: 13px; }
.cptx.k1 .cx-city-name { font-size: 23px; margin-bottom: 9px; }
.cptx.k1 .cx-shot { height: 102px; flex-basis: 148px; min-width: 138px; }
.cptx.k1 .cx-shot-name { font-size: 12.5px; }
.cptx.k1 .cx-inc-item { font-size: 11.5px; margin-bottom: 4px; }
.cptx.k1 .cx-sec { margin-bottom: 16px; }

.cptx.k2 .cx-body { padding: 15px 26px 16px; }
.cptx.k2 .cx-head { padding: 19px 26px 15px; }
.cptx.k2 .cx-title { font-size: 29px; }
.cptx.k2 .cx-stats b { font-size: 24px; }
.cptx.k2 .cx-city { padding-bottom: 11px; margin-bottom: 11px; }
.cptx.k2 .cx-city-name { font-size: 21px; margin-bottom: 8px; }
.cptx.k2 .cx-shots { gap: 7px; }
.cptx.k2 .cx-shot { height: 92px; flex-basis: 136px; min-width: 126px; }
.cptx.k2 .cx-shot-name { font-size: 12px; bottom: 7px; }
.cptx.k2 .cx-more { font-size: 11.5px; margin-top: 7px; }
.cptx.k2 .cx-stays { font-size: 11px; }
.cptx.k2 .cx-inc-item { font-size: 11px; margin-bottom: 3px; }
.cptx.k2 .cx-sec { margin-bottom: 13px; }
.cptx.k2 .cx-sec-head { margin-bottom: 10px; }
.cptx.k2 .cx-sec-head h3 { font-size: 18px; }
.cptx.k2 .cx-ptable { font-size: 11.5px; }
.cptx.k2 .cx-ptable td { padding: 7px 10px; }

.cptx.k3 .cx-body { padding: 13px 24px 14px; }
.cptx.k3 .cx-head { padding: 16px 24px 13px; }
.cptx.k3 .cx-title { font-size: 26px; }
.cptx.k3 .cx-stats { margin-top: 13px; padding-top: 11px; }
.cptx.k3 .cx-stats b { font-size: 21px; }
.cptx.k3 .cx-city { padding-bottom: 9px; margin-bottom: 9px; }
.cptx.k3 .cx-city-name { font-size: 19px; margin-bottom: 7px; }
.cptx.k3 .cx-shots { gap: 6px; }
.cptx.k3 .cx-shot { height: 80px; flex-basis: 122px; min-width: 112px; }
.cptx.k3 .cx-shot-name { font-size: 11px; bottom: 6px; left: 8px; right: 8px; }
.cptx.k3 .cx-more { font-size: 10.5px; margin-top: 6px; }
.cptx.k3 .cx-stays { font-size: 10.5px; }
.cptx.k3 .cx-inc-item { font-size: 10.5px; margin-bottom: 2px; line-height: 1.35; gap: 6px; }
.cptx.k3 .cx-inc-col h4 { font-size: 12px; margin-bottom: 6px; }
.cptx.k3 .cx-sec { margin-bottom: 11px; }
.cptx.k3 .cx-sec-head { margin-bottom: 8px; }
.cptx.k3 .cx-sec-head h3 { font-size: 17px; }
.cptx.k3 .cx-ptable { font-size: 11px; }
.cptx.k3 .cx-ptable td { padding: 6px 9px; }
.cptx.k3 .cx-pt-hotels { font-size: 10px; }

.cptx.k4 .cx-body { padding: 11px 22px 12px; }
.cptx.k4 .cx-head { padding: 14px 22px 11px; }
.cptx.k4 .cx-title { font-size: 23px; }
.cptx.k4 .cx-stats { margin-top: 11px; padding-top: 9px; }
.cptx.k4 .cx-stats b { font-size: 19px; }
.cptx.k4 .cx-city { padding-bottom: 8px; margin-bottom: 8px; }
.cptx.k4 .cx-city-name { font-size: 17px; margin-bottom: 6px; }
.cptx.k4 .cx-shots { gap: 5px; }
.cptx.k4 .cx-shot { height: 68px; flex-basis: 108px; min-width: 100px; }
.cptx.k4 .cx-shot-name { font-size: 10px; bottom: 5px; left: 7px; right: 7px; }
.cptx.k4 .cx-more { font-size: 10px; margin-top: 5px; }
.cptx.k4 .cx-stays { font-size: 10px; }
.cptx.k4 .cx-inc-item { font-size: 10px; margin-bottom: 2px; line-height: 1.3; gap: 5px; }
.cptx.k4 .cx-inc-col h4 { font-size: 11.5px; margin-bottom: 5px; }
.cptx.k4 .cx-inc { gap: 22px; }
.cptx.k4 .cx-sec { margin-bottom: 9px; }
.cptx.k4 .cx-sec-head { margin-bottom: 6px; }
.cptx.k4 .cx-sec-head h3 { font-size: 16px; }
.cptx.k4 .cx-ptable { font-size: 10.5px; }
.cptx.k4 .cx-ptable td { padding: 5px 8px; }
.cptx.k4 .cx-pt-hotels { font-size: 9.5px; }
.cptx.k4 .cx-foot { padding: 12px 22px; }
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
      </div>

      {/* ---------- Body ---------- */}
      <div className="cx-body">

        {d.groups.length > 0 && (
          <div className="cx-sec">
            <div className="cx-sec-head"><h3 className="fr">Where You Go</h3><div /></div>
            {d.groups.map((g, gi) => (
              <div className="cx-city" key={gi}>
                <h4 className="fr cx-city-name">{g.city}</h4>
                {g.tiles.length > 0 && (
                  <div className="cx-shots">
                    {g.tiles.map((t, k) => (
                      <div className="cx-shot" key={k} style={{ backgroundImage: `url("${t.photoUrl}")` }}>
                        <div className="cx-shot-grad" />
                        <div className="cx-shot-name">{t.name}</div>
                      </div>
                    ))}
                  </div>
                )}
                {g.more.length > 0 && <div className="cx-more"><b>Also</b>{g.more.join(' · ')}</div>}
              </div>
            ))}
          </div>
        )}

        {d.stays.length > 0 && (
          <div className="cx-sec">
            <div className="cx-stays">
              <b>Accommodation</b>
              {d.stays.map((st, i) => (
                <span key={i}>
                  {i > 0 ? <u>·</u> : null}
                  {st.nights} {st.nights === 1 ? 'night' : 'nights'} {st.destination}
                  {st.hotel ? ` (${st.hotel})` : ''}
                </span>
              ))}
            </div>
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
