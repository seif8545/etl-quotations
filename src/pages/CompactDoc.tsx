import { forwardRef, useEffect } from 'react'

/** One site with its resolved photo. */
export interface SiteTile {
  name: string
  photoUrl: string
  /** width / height of the real file, measured at runtime. 0 = not measured yet. */
  aspect: number
}

/** A city, what happens there, and its photo. */
export interface CityGroup {
  city: string
  /** Highlights as bullets, drawn from the days spent here or typed by the agent. */
  bullets: string[]
  /** One photo — rendered full-bleed behind the band. */
  photos: SiteTile[]
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

/** Design box. 860 x 1075 is exactly 4:5, and exports to a 1080 x 1350 PNG. */
export const SHEET_W = 860
export const SHEET_H = 1075

/**
 * Height of each destination band per density step.
 *
 * The band is the whole point of this layout, so it gets the space first and
 * everything else is trimmed around it.
 */
export const BAND_H = [232, 210, 190, 172, 156]

/*
 * A destination poster, not a document.
 *
 * Earlier versions set photos beside text at their natural aspect, which kept them
 * uncropped but tiny — a portrait shot in a 112px row is 85px wide, and the card read
 * as a spreadsheet. This version runs each destination as a full-bleed band with the
 * photo behind it and the text knocked out in white over a scrim. The photo is then
 * roughly four times the area, and white-on-dark at 30px is legible at thumbnail size.
 *
 * The trade-off, stated plainly: a full-bleed band DOES crop, and this library is
 * portrait (0.56-0.84 wide over tall), so a band shows the middle third of a tall
 * photo. FOCUS biases that window upward because monuments sit above centre. Large
 * and cropped, or small and whole — this file chooses large.
 *
 * Rendering rules carried over from ItineraryDoc (handoff.md section 8):
 *   - CSS goes in document.head, never an inline <style> inside the captured node
 *   - photos are background-image on fixed-size boxes, never <img> + object-fit
 *   - the logo <img> is sized in BOTH dimensions and fed a data URL by the caller
 */
export const FOCUS = 'center 34%'

const CSS = `
.cptx { width: ${SHEET_W}px; height: ${SHEET_H}px; overflow: hidden; display: flex; flex-direction: column; background: #08172b; color: #0e2a47; font-family: 'Inter', system-ui, sans-serif; line-height: 1.5; }
.cptx * { box-sizing: border-box; }
.cptx .fr { font-family: 'Fraunces', Georgia, serif; }

/* ---------- Header ---------- */
.cx-head { flex-shrink: 0; background: linear-gradient(135deg,#0e2a47 0%,#14375e 55%,#081a30 100%); color: #fff; padding: 16px 30px 13px; }
.cx-head-top { display: flex; align-items: center; gap: 16px; margin-bottom: 10px; }
.cx-logo { background: #fff; border-radius: 999px; padding: 7px 16px; display: inline-block; flex-shrink: 0; }
.cx-logo img { width: 132px; height: 25px; display: block; }
.cx-eyebrow { margin-left: auto; font-size: 9px; letter-spacing: 3px; text-transform: uppercase; color: #f0c53a; text-align: right; line-height: 1.5; }
.cx-title { font-size: 31px; font-weight: 600; line-height: 1.04; margin: 0; color: #fff; }
.cx-meta { font-size: 11px; color: rgba(255,255,255,0.82); margin-top: 7px; }
.cx-meta i { font-style: normal; color: #f0c53a; margin: 0 7px; }
.cx-stats { display: flex; margin-top: 11px; border-top: 1px solid rgba(255,255,255,0.16); padding-top: 9px; }
.cx-stats > div { flex: 1; text-align: center; border-left: 1px solid rgba(255,255,255,0.13); }
.cx-stats > div:first-child { border-left: none; }
.cx-stats b { display: block; font-size: 22px; font-weight: 600; color: #e8b015; line-height: 1; }
.cx-stats span { display: block; margin-top: 4px; font-size: 8px; letter-spacing: 2px; text-transform: uppercase; color: rgba(255,255,255,0.6); }

/* ---------- Destination bands: the photo IS the row ---------- */
.cx-bands { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.cx-band { position: relative; overflow: hidden; flex-shrink: 0; border-bottom: 2px solid rgba(232,176,21,0.55); }
.cx-band:last-child { border-bottom: none; }
.cx-band-img { position: absolute; inset: 0; background-size: cover; background-position: ${FOCUS}; background-repeat: no-repeat; background-color: #0e2a47; }
/* Scrim flips side to side so the column of bands zig-zags instead of reading as a
   stack of identical bars. */
.cx-band-scrim { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(5,17,32,0.94) 0%, rgba(5,17,32,0.86) 38%, rgba(5,17,32,0.30) 78%, rgba(5,17,32,0.12) 100%); }
.cx-band.alt .cx-band-scrim { background: linear-gradient(270deg, rgba(5,17,32,0.94) 0%, rgba(5,17,32,0.86) 38%, rgba(5,17,32,0.30) 78%, rgba(5,17,32,0.12) 100%); }
.cx-band-body { position: relative; z-index: 2; height: 100%; width: 66%; padding: 0 30px; display: flex; flex-direction: column; justify-content: center; }
.cx-band.alt .cx-band-body { margin-left: auto; text-align: right; }
.cx-band-kicker { font-size: 8.5px; letter-spacing: 3px; text-transform: uppercase; color: #f0c53a; margin-bottom: 5px; }
.cx-band-name { font-size: 30px; font-weight: 600; line-height: 1.05; color: #fff; margin: 0 0 9px; text-shadow: 0 2px 14px rgba(0,0,0,0.55); }
.cx-band-rule { width: 46px; height: 2px; background: linear-gradient(135deg,#c8960a,#e8b015); border-radius: 2px; margin-bottom: 9px; }
.cx-band.alt .cx-band-rule { margin-left: auto; }
.cx-bul { list-style: none; margin: 0; padding: 0; }
.cx-bul li { position: relative; padding-left: 13px; margin-bottom: 4px; font-size: 12px; line-height: 1.4; color: rgba(255,255,255,0.94); text-shadow: 0 1px 6px rgba(0,0,0,0.5); }
.cx-band.alt .cx-bul li { padding-left: 0; padding-right: 13px; }
.cx-bul li:last-child { margin-bottom: 0; }
.cx-bul li::before { content: '▸'; position: absolute; left: 0; top: -1px; color: #e8b015; }
.cx-band.alt .cx-bul li::before { left: auto; right: 0; content: '◂'; }

/* ---------- Facts strip: stays + inclusions, deliberately quiet ---------- */
.cx-facts { flex-shrink: 0; background: #fffefa; padding: 9px 26px 8px; }
.cx-fact { font-size: 8.5px; line-height: 1.42; color: #6a7789; margin: 0 0 3px; }
.cx-fact:last-child { margin-bottom: 0; }
.cx-fact b { font-weight: 600; margin-right: 6px; font-size: 7.5px; letter-spacing: 1.3px; text-transform: uppercase; color: #b08a1e; }
.cx-fact.no b { color: #a83828; }

/* ---------- Pricing ---------- */
.cx-price { flex-shrink: 0; background: #fffefa; padding: 0 26px 10px; }
.cx-ptable { width: 100%; border-collapse: collapse; font-size: 10px; }
.cx-ptable th { text-align: left; background: #0e2a47; color: #fff; font-weight: 600; padding: 5px 9px; font-size: 7.5px; letter-spacing: 0.5px; text-transform: uppercase; }
.cx-ptable td { padding: 5px 9px; border-bottom: 1px solid #eee2c8; vertical-align: top; }
.cx-ptable tr:last-child td { border-bottom: none; }
.cx-pt-cat { color: #0e2a47; font-weight: 600; white-space: nowrap; }
.cx-pt-price { color: #806000; font-weight: 700; white-space: nowrap; font-size: 12px; }
.cx-pt-hotels { color: #8a93a0; font-size: 8px; line-height: 1.3; }
.cx-pbox { background: linear-gradient(135deg,#0e2a47,#163d6b); color: #fff; border-radius: 10px; padding: 10px 18px; display: flex; align-items: center; gap: 16px; }
.cx-pbox-eyebrow { color: #f0c53a; font-size: 8px; letter-spacing: 2.4px; text-transform: uppercase; }
.cx-pbox-big { font-size: 26px; font-weight: 600; margin: 2px 0 0; line-height: 1; }
.cx-pbox-r { font-size: 10px; color: rgba(255,255,255,0.85); line-height: 1.45; }
.cx-pnote { font-size: 7.5px; color: #a09880; margin-top: 3px; }

/* ---------- Footer ---------- */
.cx-foot { flex-shrink: 0; background: linear-gradient(180deg,#0e2a47,#081a30); color: #fff; padding: 9px 26px; display: flex; align-items: center; justify-content: space-between; }
.cx-foot-brand { font-size: 12px; font-weight: 600; color: #e8b015; letter-spacing: 2px; }
.cx-foot-brand span { display: block; font-size: 6.5px; letter-spacing: 4px; color: #c8960a; margin-top: 1px; }
.cx-foot-rows { display: flex; gap: 16px; font-size: 8.5px; }
.cx-foot-rows b { color: #e8b015; font-weight: 600; margin-right: 4px; }

/* ================= Density steps ================= */
.cptx.k1 .cx-band-name { font-size: 27px; }
.cptx.k1 .cx-bul li { font-size: 11.5px; }
.cptx.k1 .cx-head { padding: 14px 28px 11px; }
.cptx.k1 .cx-title { font-size: 29px; }

.cptx.k2 .cx-band-name { font-size: 25px; margin-bottom: 7px; }
.cptx.k2 .cx-bul li { font-size: 11px; margin-bottom: 3px; }
.cptx.k2 .cx-band-body { padding: 0 26px; }
.cptx.k2 .cx-head { padding: 12px 26px 10px; }
.cptx.k2 .cx-title { font-size: 26px; }
.cptx.k2 .cx-stats b { font-size: 20px; }
.cptx.k2 .cx-ptable { font-size: 9.5px; }

.cptx.k3 .cx-band-name { font-size: 22px; margin-bottom: 6px; }
.cptx.k3 .cx-band-rule { margin-bottom: 7px; }
.cptx.k3 .cx-bul li { font-size: 10.5px; margin-bottom: 3px; }
.cptx.k3 .cx-band-body { padding: 0 22px; width: 70%; }
.cptx.k3 .cx-head { padding: 11px 24px 9px; }
.cptx.k3 .cx-title { font-size: 24px; }
.cptx.k3 .cx-stats b { font-size: 18px; }
.cptx.k3 .cx-ptable { font-size: 9px; }
.cptx.k3 .cx-ptable td { padding: 4px 8px; }
.cptx.k3 .cx-pt-price { font-size: 11px; }

.cptx.k4 .cx-band-name { font-size: 20px; margin-bottom: 5px; }
.cptx.k4 .cx-band-rule { margin-bottom: 6px; }
.cptx.k4 .cx-bul li { font-size: 10px; margin-bottom: 2px; line-height: 1.34; }
.cptx.k4 .cx-band-body { padding: 0 20px; width: 72%; }
.cptx.k4 .cx-head { padding: 10px 22px 8px; }
.cptx.k4 .cx-title { font-size: 22px; }
.cptx.k4 .cx-stats b { font-size: 17px; }
.cptx.k4 .cx-facts { padding: 7px 22px 6px; }
.cptx.k4 .cx-price { padding: 0 22px 8px; }
.cptx.k4 .cx-ptable { font-size: 8.5px; }
.cptx.k4 .cx-ptable td { padding: 3px 7px; }
.cptx.k4 .cx-pt-price { font-size: 10.5px; }
.cptx.k4 .cx-foot { padding: 7px 22px; }
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
  { key: 'single', label: 'Single Supp.' },
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

  const bandH = BAND_H[Math.max(0, Math.min(BAND_H.length - 1, d.density))]

  /* Inclusions as prose: trailing full stops stripped so the run reads as one list. */
  const asProse = (items: string[]) =>
    items.map((t) => (t ?? '').trim().replace(/\.$/, '')).filter(Boolean).join(' · ')

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
        <div className="cx-meta">
          {d.meta.ref ? <>Ref {d.meta.ref}<i>·</i></> : null}
          {d.meta.pax} {d.meta.pax === 1 ? 'guest' : 'guests'}
          {d.meta.arrival ? <><i>·</i>{fmtDate(d.meta.arrival)}{d.meta.departure ? <><i>→</i>{fmtDate(d.meta.departure)}</> : null}</> : null}
        </div>
        <div className="cx-stats">
          <div><b className="fr">{d.overview.days}</b><span>{d.overview.days === 1 ? 'Day' : 'Days'}</span></div>
          <div><b className="fr">{d.overview.nights}</b><span>{d.overview.nights === 1 ? 'Night' : 'Nights'}</span></div>
          <div><b className="fr">{d.overview.cities}</b><span>{d.overview.cities === 1 ? 'Destination' : 'Destinations'}</span></div>
          <div><b className="fr">{d.overview.pax}</b><span>{d.overview.pax === 1 ? 'Guest' : 'Guests'}</span></div>
        </div>
      </div>

      {/* ---------- Destination bands ---------- */}
      <div className="cx-bands" data-cx-body="1">
        {d.groups.map((g, gi) => {
          const photo = g.photos[0]
          const alt = gi % 2 === 1
          return (
            <div className={`cx-band${alt ? ' alt' : ''}`} key={gi} style={{ height: bandH }}>
              {photo ? <div className="cx-band-img" style={{ backgroundImage: `url("${photo.photoUrl}")` }} /> : <div className="cx-band-img" />}
              <div className="cx-band-scrim" />
              <div className="cx-band-body">
                <div className="cx-band-kicker">Destination {gi + 1}</div>
                <h2 className="fr cx-band-name">{g.city}</h2>
                <div className="cx-band-rule" />
                {g.bullets.length > 0 && (
                  <ul className="cx-bul">
                    {g.bullets.map((b, k) => <li key={k}>{b}</li>)}
                  </ul>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ---------- Quiet facts ---------- */}
      <div className="cx-facts">
        {d.stays.length > 0 && (
          <p className="cx-fact">
            <b>Stays</b>
            {d.stays.map((st, i) => (
              <span key={i}>
                {i > 0 ? ' · ' : ''}
                {st.nights} {st.nights === 1 ? 'night' : 'nights'} {st.destination}
                {st.hotel ? ` (${st.hotel})` : ''}
              </span>
            ))}
          </p>
        )}
        {d.included.length > 0 && <p className="cx-fact"><b>Included</b>{asProse(d.included)}.</p>}
        {d.excluded.length > 0 && <p className="cx-fact no"><b>Not included</b>{asProse(d.excluded)}.</p>}
      </div>

      {/* ---------- Pricing: always present ---------- */}
      <div className="cx-price">
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
              {d.price.sgl > 0 ? <div>Single supplement ${d.price.sgl.toLocaleString()} per person</div> : null}
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
          <div><b>Email</b>{d.contact.email}</div>
          <div><b>Web</b>{d.contact.website}</div>
        </div>
      </div>
    </div>
  )
})

export default CompactDoc
