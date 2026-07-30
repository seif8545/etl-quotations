import { forwardRef, useEffect } from 'react'

/** One site with its resolved photo. */
export interface SiteTile {
  name: string
  photoUrl: string
  /** width / height of the real file, measured at runtime. 0 = not measured yet. */
  aspect: number
}

/** A destination, what happens there, and its photo. */
export interface CityGroup {
  city: string
  /** Highlights as bullets, drawn from the days spent here or typed by the agent. */
  bullets: string[]
  /** One photo — rendered as a circle. */
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
 * Diameter of the destination photo per density step.
 *
 * CIRCLES, and that is the whole trick. Every other shape fought this library: the
 * photos are portrait (0.56-0.84 wide over tall), so a wide band cropped away about
 * two thirds of each image and a natural-aspect thumbnail had to shrink to ~85px to
 * fit. A circle takes the centre square, which keeps roughly three quarters of a 3:4
 * portrait, stays large, and reads as a deliberate design choice rather than a bad
 * crop.
 *
 * Both dimensions are written inline: never leave a captured element sized in one
 * dimension only (handoff.md section 8C).
 */
export const DISC = [156, 142, 128, 116, 104]

/** Bias the circle upward — monuments and buildings sit above the centre line. */
export const FOCUS = 'center 32%'

/*
 * A light, airy itinerary card.
 *
 * Deliberately not the dark full-bleed poster that came before it: that version made
 * the photos big by cropping them to ribbons, and the whole card read as heavy. This
 * one is mostly warm white, leans on whitespace and a single gold accent, and gives
 * each destination a circular photo on a timeline.
 *
 * Rendering rules carried over from ItineraryDoc (handoff.md section 8):
 *   - CSS goes in document.head, never an inline <style> inside the captured node
 *   - photos are background-image on fixed-size boxes, never <img> + object-fit
 *   - the logo <img> is sized in BOTH dimensions and fed a data URL by the caller
 */
const CSS = `
.cptx { width: ${SHEET_W}px; height: ${SHEET_H}px; overflow: hidden; display: flex; flex-direction: column; background: #fffdf7; color: #24384f; font-family: 'Inter', system-ui, sans-serif; line-height: 1.5; }
.cptx * { box-sizing: border-box; }
.cptx .fr { font-family: 'Fraunces', Georgia, serif; }

/* ---------- Header ---------- */
.cx-head { flex-shrink: 0; background: linear-gradient(135deg,#0e2a47 0%,#14375e 58%,#0b2038 100%); color: #fff; padding: 18px 34px 15px; }
.cx-head-top { display: flex; align-items: center; gap: 16px; margin-bottom: 11px; }
.cx-logo { background: #fff; border-radius: 999px; padding: 7px 16px; display: inline-block; flex-shrink: 0; }
.cx-logo img { width: 132px; height: 25px; display: block; }
.cx-eyebrow { margin-left: auto; font-size: 9px; letter-spacing: 3px; text-transform: uppercase; color: #f0c53a; text-align: right; line-height: 1.5; }
.cx-title { font-size: 32px; font-weight: 600; line-height: 1.04; margin: 0; color: #fff; }
.cx-meta { font-size: 11px; color: rgba(255,255,255,0.8); margin-top: 8px; }
.cx-meta i { font-style: normal; color: #f0c53a; margin: 0 7px; }
.cx-stats { display: flex; margin-top: 12px; border-top: 1px solid rgba(255,255,255,0.15); padding-top: 10px; }
.cx-stats > div { flex: 1; text-align: center; }
.cx-stats b { display: block; font-size: 21px; font-weight: 600; color: #e8b015; line-height: 1; }
.cx-stats span { display: block; margin-top: 4px; font-size: 8px; letter-spacing: 2px; text-transform: uppercase; color: rgba(255,255,255,0.58); }

/* ---------- Body ---------- */
.cx-body { flex: 1; min-height: 0; padding: 16px 34px 12px; display: flex; flex-direction: column; }

.cx-sec-title { font-size: 17px; font-weight: 600; color: #0e2a47; margin: 0 0 10px; }

/* ---------- Timeline of destinations ---------- */
.cx-tl { flex: 1; }
.cx-stop { display: flex; align-items: center; gap: 16px; }
.cx-rail { width: 12px; flex-shrink: 0; align-self: stretch; position: relative; }
.cx-rail::before { content: ''; position: absolute; left: 5px; top: 0; bottom: 0; width: 2px; background: #eadfc4; }
.cx-stop:first-child .cx-rail::before { top: 50%; }
.cx-stop:last-child .cx-rail::before { bottom: 50%; }
.cx-dot { position: absolute; left: 0; top: 50%; margin-top: -6px; width: 12px; height: 12px; border-radius: 50%; background: #e8b015; box-shadow: 0 0 0 3px #fffdf7; }
.cx-stop-body { flex: 1; min-width: 0; padding: 11px 0; }
.cx-kicker { font-size: 8.5px; letter-spacing: 2.6px; text-transform: uppercase; color: #c08a12; margin-bottom: 3px; }
.cx-stop-name { font-size: 25px; font-weight: 600; line-height: 1.08; color: #0e2a47; margin: 0 0 7px; }
.cx-bul { list-style: none; margin: 0; padding: 0; }
.cx-bul li { position: relative; padding-left: 15px; margin-bottom: 4px; font-size: 11.5px; line-height: 1.45; color: #4a5a6e; }
.cx-bul li:last-child { margin-bottom: 0; }
.cx-bul li::before { content: ''; position: absolute; left: 2px; top: 7px; width: 5px; height: 5px; border-radius: 50%; background: #e8b015; }
.cx-disc { flex-shrink: 0; border-radius: 50%; background-size: cover; background-position: ${FOCUS}; background-repeat: no-repeat; background-color: #e9e2d2; box-shadow: 0 4px 16px rgba(14,42,71,0.16); }

/* ---------- Included: soft panel, generous air ---------- */
.cx-panel { background: #faf5e9; border: 1px solid #f0e6cf; border-radius: 14px; padding: 12px 18px 11px; margin-top: 10px; }
.cx-panel-head { font-size: 9px; letter-spacing: 2.4px; text-transform: uppercase; color: #b08a1e; margin-bottom: 8px; }
.cx-inc { display: flex; flex-wrap: wrap; gap: 3px 20px; }
.cx-inc div { width: calc(50% - 10px); position: relative; padding-left: 15px; font-size: 9.5px; line-height: 1.45; color: #4a5a6e; }
.cx-inc div::before { content: '✓'; position: absolute; left: 0; top: 0; color: #2f8a4a; font-weight: 700; font-size: 9px; }
.cx-exc { margin-top: 8px; padding-top: 8px; border-top: 1px solid #efe4cb; font-size: 9px; line-height: 1.45; color: #8a93a0; }
.cx-exc b { color: #a83828; font-weight: 600; font-size: 8px; letter-spacing: 1.4px; text-transform: uppercase; margin-right: 6px; }
.cx-stays { margin-top: 6px; font-size: 9px; line-height: 1.45; color: #8a93a0; }
.cx-stays b { color: #b08a1e; font-weight: 600; font-size: 8px; letter-spacing: 1.4px; text-transform: uppercase; margin-right: 6px; }

/* ---------- Pricing: cards, not a table ---------- */
.cx-prices { display: flex; gap: 10px; margin-top: 11px; }
.cx-card { flex: 1; min-width: 0; background: #fff; border: 1px solid #eadfc4; border-radius: 12px; padding: 10px 12px; }
.cx-card-cat { font-size: 8.5px; letter-spacing: 1.4px; text-transform: uppercase; color: #7d8a99; line-height: 1.3; min-height: 22px; }
.cx-card-price { font-size: 22px; font-weight: 600; color: #0e2a47; line-height: 1; margin: 4px 0 2px; }
.cx-card-price small { font-size: 9px; font-weight: 500; color: #9aa5b1; margin-left: 3px; }
.cx-card-sub { font-size: 8px; color: #9aa5b1; letter-spacing: 0.4px; }
.cx-card-hotels { margin-top: 6px; padding-top: 6px; border-top: 1px solid #f2ead8; font-size: 7.5px; line-height: 1.35; color: #9aa5b1; }
.cx-pnote { font-size: 8px; color: #a09880; margin-top: 7px; }
.cx-pbox { background: linear-gradient(135deg,#0e2a47,#163d6b); color: #fff; border-radius: 12px; padding: 12px 20px; display: flex; align-items: center; gap: 18px; margin-top: 11px; }
.cx-pbox-eyebrow { color: #f0c53a; font-size: 8px; letter-spacing: 2.4px; text-transform: uppercase; }
.cx-pbox-big { font-size: 27px; font-weight: 600; margin: 2px 0 0; line-height: 1; }
.cx-pbox-r { font-size: 10px; color: rgba(255,255,255,0.85); line-height: 1.45; }

/* ---------- Footer ---------- */
.cx-foot { flex-shrink: 0; background: linear-gradient(180deg,#0e2a47,#081a30); color: #fff; padding: 10px 34px; display: flex; align-items: center; justify-content: space-between; }
.cx-foot-brand { font-size: 12px; font-weight: 600; color: #e8b015; letter-spacing: 2px; }
.cx-foot-brand span { display: block; font-size: 6.5px; letter-spacing: 4px; color: #c8960a; margin-top: 1px; }
.cx-foot-rows { display: flex; gap: 16px; font-size: 8.5px; }
.cx-foot-rows b { color: #e8b015; font-weight: 600; margin-right: 4px; }

/* ================= Density steps ================= */
.cptx.k1 .cx-stop-name { font-size: 23px; }
.cptx.k1 .cx-bul li { font-size: 11px; }
.cptx.k1 .cx-head { padding: 16px 32px 13px; }
.cptx.k1 .cx-title { font-size: 30px; }
.cptx.k1 .cx-body { padding: 14px 32px 11px; }

.cptx.k2 .cx-stop-name { font-size: 21px; margin-bottom: 6px; }
.cptx.k2 .cx-bul li { font-size: 10.5px; margin-bottom: 3px; }
.cptx.k2 .cx-stop-body { padding: 9px 0; }
.cptx.k2 .cx-head { padding: 14px 30px 11px; }
.cptx.k2 .cx-title { font-size: 27px; }
.cptx.k2 .cx-stats b { font-size: 19px; }
.cptx.k2 .cx-body { padding: 12px 30px 10px; }
.cptx.k2 .cx-inc div { font-size: 9px; }
.cptx.k2 .cx-card-price { font-size: 20px; }

.cptx.k3 .cx-stop-name { font-size: 19px; margin-bottom: 5px; }
.cptx.k3 .cx-bul li { font-size: 10px; margin-bottom: 2px; line-height: 1.4; }
.cptx.k3 .cx-stop-body { padding: 7px 0; }
.cptx.k3 .cx-sec-title { font-size: 15px; margin-bottom: 7px; }
.cptx.k3 .cx-head { padding: 12px 28px 10px; }
.cptx.k3 .cx-title { font-size: 25px; }
.cptx.k3 .cx-stats b { font-size: 18px; }
.cptx.k3 .cx-body { padding: 10px 28px 9px; }
.cptx.k3 .cx-panel { padding: 10px 15px 9px; margin-top: 8px; }
.cptx.k3 .cx-inc div { font-size: 8.5px; }
.cptx.k3 .cx-card { padding: 8px 10px; }
.cptx.k3 .cx-card-price { font-size: 18px; }
.cptx.k3 .cx-prices { margin-top: 9px; }

.cptx.k4 .cx-stop-name { font-size: 17.5px; margin-bottom: 4px; }
.cptx.k4 .cx-bul li { font-size: 9.5px; margin-bottom: 2px; line-height: 1.36; padding-left: 13px; }
.cptx.k4 .cx-stop-body { padding: 6px 0; }
.cptx.k4 .cx-sec-title { font-size: 14px; margin-bottom: 6px; }
.cptx.k4 .cx-head { padding: 11px 26px 9px; }
.cptx.k4 .cx-title { font-size: 23px; }
.cptx.k4 .cx-stats b { font-size: 17px; }
.cptx.k4 .cx-body { padding: 9px 26px 8px; }
.cptx.k4 .cx-panel { padding: 9px 13px 8px; margin-top: 7px; }
.cptx.k4 .cx-inc div { font-size: 8px; }
.cptx.k4 .cx-exc { font-size: 8px; margin-top: 6px; padding-top: 6px; }
.cptx.k4 .cx-card { padding: 7px 9px; }
.cptx.k4 .cx-card-price { font-size: 16.5px; }
.cptx.k4 .cx-card-hotels { font-size: 7px; }
.cptx.k4 .cx-prices { margin-top: 8px; }
.cptx.k4 .cx-foot { padding: 8px 26px; }
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

const CompactDoc = forwardRef<HTMLDivElement, { data: CompactData }>(({ data }, ref) => {
  const d = data

  useEffect(() => {
    if (typeof document === 'undefined') return
    let el = document.getElementById('cptx-doc-css') as HTMLStyleElement | null
    if (!el) { el = document.createElement('style'); el.id = 'cptx-doc-css'; document.head.appendChild(el) }
    el.textContent = CSS
  }, [])

  const disc = DISC[Math.max(0, Math.min(DISC.length - 1, d.density))]

  const tierRows = d.pricing.rows.filter(
    (r) => (r.category ?? '').trim() && (r.dbl > 0 || r.single > 0 || r.triple > 0 || r.quad > 0),
  )
  const showCards = d.pricing.show && tierRows.length > 0
  const basis = d.roomBasis || 'double'

  /* One headline number per tier: whichever occupancy the package is actually sold
     on, so a card never leads with a dash. */
  const headline = (r: CompactPricingRow): { value: number; label: string } => {
    const order: [PriceColKey, string][] =
      d.pricing.columns && d.pricing.columns !== 'all'
        ? [[d.pricing.columns, d.pricing.columns === 'single' ? 'single' : d.pricing.columns === 'triple' ? 'triple' : d.pricing.columns === 'quad' ? 'quad' : 'double']]
        : [['dbl', 'double'], ['triple', 'triple'], ['quad', 'quad'], ['single', 'single']]
    for (const [k, label] of order) if ((r[k] || 0) > 0) return { value: r[k] || 0, label }
    return { value: 0, label: basis }
  }

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

      {/* ---------- Body ---------- */}
      <div className="cx-body" data-cx-body="1">

        <h3 className="fr cx-sec-title">Itinerary</h3>

        <div className="cx-tl">
          {d.groups.map((g, gi) => {
            const photo = g.photos[0]
            return (
              <div className="cx-stop" key={gi}>
                <div className="cx-rail"><div className="cx-dot" /></div>
                <div className="cx-stop-body">
                  <div className="cx-kicker">Destination {gi + 1}</div>
                  <h4 className="fr cx-stop-name">{g.city}</h4>
                  {g.bullets.length > 0 && (
                    <ul className="cx-bul">
                      {g.bullets.map((b, k) => <li key={k}>{b}</li>)}
                    </ul>
                  )}
                </div>
                <div
                  className="cx-disc"
                  style={{
                    width: disc,
                    height: disc,
                    backgroundImage: photo ? `url("${photo.photoUrl}")` : undefined,
                  }}
                />
              </div>
            )
          })}
        </div>

        {/* ---------- What's included ---------- */}
        {(d.included.length > 0 || d.excluded.length > 0 || d.stays.length > 0) && (
          <div className="cx-panel">
            <div className="cx-panel-head">What's Included</div>
            {d.included.length > 0 && (
              <div className="cx-inc">
                {d.included.map((t, i) => <div key={i}>{t.replace(/\.$/, '')}</div>)}
              </div>
            )}
            {d.stays.length > 0 && (
              <div className="cx-stays">
                <b>Stays</b>
                {d.stays.map((st, i) => (
                  <span key={i}>
                    {i > 0 ? ' · ' : ''}
                    {st.nights} {st.nights === 1 ? 'night' : 'nights'} {st.destination}
                    {st.hotel ? ` (${st.hotel})` : ''}
                  </span>
                ))}
              </div>
            )}
            {d.excluded.length > 0 && (
              <div className="cx-exc">
                <b>Not included</b>
                {d.excluded.map((t) => (t ?? '').trim().replace(/\.$/, '')).filter(Boolean).join(' · ')}.
              </div>
            )}
          </div>
        )}

        {/* ---------- Pricing: always present ---------- */}
        {showCards ? (
          <>
            <div className="cx-prices">
              {tierRows.map((r, i) => {
                const h = headline(r)
                return (
                  <div className="cx-card" key={i}>
                    <div className="cx-card-cat">{r.category}</div>
                    <div className="fr cx-card-price">${h.value.toLocaleString()}<small>USD</small></div>
                    <div className="cx-card-sub">per person · {h.label}</div>
                    {(r.hotels ?? '').trim() && (
                      <div className="cx-card-hotels">
                        {(r.hotels ?? '').split('\n').map((l) => l.trim()).filter(Boolean).map((l, k) => <div key={k}>{l}</div>)}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
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
