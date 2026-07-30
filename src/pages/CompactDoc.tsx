import { forwardRef, useEffect } from 'react'

/** One site with its resolved photo. */
export interface SiteTile {
  name: string
  photoUrl: string
  /** width / height of the real file, measured at runtime. 0 = not measured yet. */
  aspect: number
}

/**
 * City row height per density step.
 *
 * Photos fill a 25% column at this height, so the frame is landscape while the
 * library is portrait (14 of 15 shots measure 0.56-0.84 wide-over-tall). The crop is
 * therefore real — biased upward by FOCUS so the subject survives it. Row height is
 * the first thing the density ladder spends for exactly this reason.
 */
/**
 * City row height per density step. Photos fill a 25% column at this height.
 *
 * NOTE the trade-off this forces: at 25% of an 860px sheet a photo is ~205px wide,
 * so a 150px row makes it landscape — and this library is portrait, so it crops.
 * Row height is therefore the first thing the density ladder spends.
 */
export const ROW_H = [156, 140, 126, 112, 100]

/**
 * Portrait sources cropped to a landscape frame lose their subject if centred — the
 * interesting part of a monument shot sits above the middle. Bias the crop upward.
 */
export const FOCUS = 'center 32%'

/** A city, what happens there, and one or two photos of it. */
export interface CityGroup {
  city: string
  /** Prose drawn from the days spent in this city. */
  blurb: string
  /** One or two photos, placed either side of the paragraph. */
  photos: SiteTile[]
  /** Every site visited in this city, listed as names. */
  sites: string[]
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
export const SHEET_W = 860

/**
 * Design height, chosen so the sheet is exactly 4:5 — 860 x 1075 scales to a
 * 1080 x 1350 PNG, the standard Instagram portrait post.
 *
 * The layout is authored at 860 wide because that is what the two-photo city rows
 * and the pricing table need to breathe; the exporter then resamples the whole
 * capture down to 1080 wide. Supersampling from a 3x capture means the downscale
 * sharpens rather than softens.
 */
export const SHEET_H = 1075

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
/* min-height + a flexing body: short itineraries stretch to fill the 4:5 box so the
   PNG is exactly 1080x1350, and long ones grow past it rather than clipping. */
.cptx { width: ${SHEET_W}px; height: ${SHEET_H}px; overflow: hidden; display: flex; flex-direction: column; background: #fffefa; color: #0e2a47; font-family: 'Inter', system-ui, sans-serif; line-height: 1.5; }
.cptx * { box-sizing: border-box; }
.cptx .fr { font-family: 'Fraunces', Georgia, serif; }

/* ---------- Header (no cover photo: solid brand block) ---------- */
.cx-head { flex-shrink: 0; background: linear-gradient(135deg,#0e2a47 0%,#14375e 55%,#081a30 100%); color: #fff; padding: 18px 30px 14px; }
.cx-head-top { display: flex; align-items: center; gap: 16px; margin-bottom: 12px; }
.cx-logo { background: #fff; border-radius: 999px; padding: 8px 18px; display: inline-block; flex-shrink: 0; }
.cx-logo img { width: 150px; height: 28px; display: block; }
.cx-eyebrow { margin-left: auto; font-size: 10px; letter-spacing: 3.2px; text-transform: uppercase; color: #f0c53a; text-align: right; }
.cx-title { font-size: 27px; font-weight: 600; line-height: 1.08; margin: 0; color: #fff; }
.cx-rule { width: 64px; height: 3px; background: linear-gradient(135deg,#c8960a,#e8b015); border-radius: 3px; margin: 9px 0 8px; }
.cx-meta { font-size: 11.5px; color: rgba(255,255,255,0.9); }
.cx-meta i { font-style: normal; color: #f0c53a; margin: 0 8px; }
.cx-stats { display: flex; margin-top: 12px; border-top: 1px solid rgba(255,255,255,0.16); padding-top: 10px; }
.cx-stats > div { flex: 1; text-align: center; border-left: 1px solid rgba(255,255,255,0.13); }
.cx-stats > div:first-child { border-left: none; }
.cx-stats b { display: block; font-size: 21px; font-weight: 600; color: #e8b015; line-height: 1; }
.cx-stats span { display: block; margin-top: 5px; font-size: 9px; letter-spacing: 2.2px; text-transform: uppercase; color: rgba(255,255,255,0.62); }
.cx-cities { margin-top: 14px; font-size: 11.5px; color: rgba(255,255,255,0.82); }
.cx-cities b { color: #f0c53a; font-weight: 600; font-size: 9px; letter-spacing: 2px; text-transform: uppercase; margin-right: 9px; }
.cx-cities u { text-decoration: none; color: #7d93ad; margin: 0 7px; }

/* ---------- Body ---------- */
.cx-body { flex: 1; min-height: 0; padding: 14px 26px 14px; }

.cx-sec-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 9px; }
.cx-sec-head h3 { font-size: 16px; font-weight: 600; color: #0e2a47; margin: 0; white-space: nowrap; }
.cx-sec-head div { flex: 1; height: 2px; background: linear-gradient(90deg,#e8b015,rgba(232,176,21,0.10)); border-radius: 2px; }
.cx-sec { margin-bottom: 12px; }

/* ---------- City groups: photo 25% | text 50% | photo 25% ---------- */
.cx-city { border-bottom: 1px solid #ece0c4; }
.cx-city:last-child { border-bottom: none; }
.cx-row { display: flex; align-items: stretch; }
.cx-photo { flex: 0 0 25%; background-color: #16304d; background-repeat: no-repeat; background-size: cover; }
.cx-text { flex: 1; min-width: 0; padding: 8px 12px; display: flex; flex-direction: column; justify-content: center; }
.cx-city-name { font-size: 17px; font-weight: 600; color: #0e2a47; margin: 0 0 3px; line-height: 1.1; }
.cx-blurb { font-size: 10px; line-height: 1.4; color: #45566b; margin: 0; }
.cx-sites { margin-top: 4px; font-size: 9px; color: #7a8798; line-height: 1.35; }
.cx-sites b { color: #b08a1e; font-weight: 600; font-size: 7.5px; letter-spacing: 1.2px; text-transform: uppercase; margin-right: 5px; }

/* ---------- Accommodation: small, subordinate ---------- */
.cx-stays { font-size: 9px; color: #7a8798; line-height: 1.45; }
.cx-stays b { color: #b08a1e; font-weight: 600; font-size: 7.5px; letter-spacing: 1.2px; text-transform: uppercase; margin-right: 6px; }
.cx-stays u { text-decoration: none; color: #cbbfa4; margin: 0 8px; }

/* ---------- Good to know: prose, not bullets ----------
   Eleven ticked bullets in two columns ate a third of the card for information the
   client skims. The same words set as two short paragraphs cost about a fifth of the
   height and read faster. */
.cx-info { font-size: 9.5px; line-height: 1.45; color: #55677d; margin: 0 0 5px; }
.cx-info:last-child { margin-bottom: 0; }
.cx-info b { font-weight: 600; margin-right: 6px; font-size: 8px; letter-spacing: 1.2px; text-transform: uppercase; }
.cx-info.yes b { color: #1a6e2e; }
.cx-info.no b { color: #a83828; }

/* ---------- Pricing ---------- */
.cx-ptable { width: 100%; border-collapse: collapse; font-size: 9.5px; }
.cx-ptable th { text-align: left; background: #0e2a47; color: #fff; font-weight: 600; padding: 4px 8px; font-size: 7.5px; letter-spacing: 0.4px; text-transform: uppercase; }
.cx-ptable td { padding: 4px 8px; border-bottom: 1px solid #eee2c8; vertical-align: top; }
.cx-ptable tr:last-child td { border-bottom: none; }
.cx-pt-cat { color: #0e2a47; font-weight: 600; white-space: nowrap; }
.cx-pt-price { color: #806000; font-weight: 600; white-space: nowrap; }
.cx-pt-hotels { color: #6a7789; font-size: 8px; line-height: 1.28; }
.cx-pbox { background: linear-gradient(135deg,#0e2a47,#163d6b); color: #fff; border-radius: 14px; padding: 16px 24px; display: flex; align-items: center; gap: 22px; }
.cx-pbox-eyebrow { color: #f0c53a; font-size: 9.5px; letter-spacing: 2.6px; text-transform: uppercase; }
.cx-pbox-big { font-size: 32px; font-weight: 600; margin: 3px 0 0; line-height: 1; }
.cx-pbox-r { font-size: 11.5px; color: rgba(255,255,255,0.85); line-height: 1.55; }
.cx-pbox-r b { color: #f0c53a; font-weight: 600; }
.cx-pnote { font-size: 8px; color: #8a7a5c; margin-top: 4px; }

/* ---------- Footer ---------- */
.cx-foot { flex-shrink: 0; background: linear-gradient(180deg,#0e2a47,#081a30); color: #fff; padding: 10px 26px; display: flex; align-items: center; justify-content: space-between; }
.cx-foot-brand { font-size: 12px; font-weight: 600; color: #e8b015; letter-spacing: 2px; }
.cx-foot-brand span { display: block; font-size: 7.5px; letter-spacing: 5px; color: #c8960a; margin-top: 1px; }
.cx-foot-rows { display: flex; gap: 18px; font-size: 9px; }
.cx-foot-rows b { color: #e8b015; font-weight: 600; margin-right: 5px; }

/* ================= Density steps =================
   Row height comes from ROW_H in JS; these trim the type and rhythm alongside it. */
.cptx.k1 .cx-body { padding: 12px 24px; }
.cptx.k1 .cx-city-name { font-size: 16px; }
.cptx.k1 .cx-sec { margin-bottom: 10px; }

.cptx.k2 .cx-body { padding: 10px 22px; }
.cptx.k2 .cx-city-name { font-size: 15px; }
.cptx.k2 .cx-blurb { font-size: 9.5px; line-height: 1.36; }
.cptx.k2 .cx-sec { margin-bottom: 9px; }
.cptx.k2 .cx-sec-head { margin-bottom: 7px; }
.cptx.k2 .cx-sec-head h3 { font-size: 15px; }
.cptx.k2 .cx-info { font-size: 9px; }
.cptx.k2 .cx-head { padding: 15px 24px 12px; }
.cptx.k2 .cx-title { font-size: 25px; }

.cptx.k3 .cx-body { padding: 9px 20px; }
.cptx.k3 .cx-city-name { font-size: 14px; }
.cptx.k3 .cx-blurb { font-size: 9px; line-height: 1.32; }
.cptx.k3 .cx-sites { font-size: 8.5px; margin-top: 3px; }
.cptx.k3 .cx-text { padding: 6px 10px; }
.cptx.k3 .cx-sec { margin-bottom: 8px; }
.cptx.k3 .cx-sec-head { margin-bottom: 6px; }
.cptx.k3 .cx-sec-head h3 { font-size: 14px; }
.cptx.k3 .cx-info { font-size: 8.5px; line-height: 1.4; }
.cptx.k3 .cx-head { padding: 13px 22px 10px; }
.cptx.k3 .cx-title { font-size: 23px; }
.cptx.k3 .cx-stats b { font-size: 19px; }
.cptx.k3 .cx-ptable { font-size: 9px; }

.cptx.k4 .cx-body { padding: 8px 18px; }
.cptx.k4 .cx-city-name { font-size: 13px; }
.cptx.k4 .cx-blurb { font-size: 8.5px; line-height: 1.3; }
.cptx.k4 .cx-sites { font-size: 8px; margin-top: 2px; }
.cptx.k4 .cx-text { padding: 5px 9px; }
.cptx.k4 .cx-sec { margin-bottom: 7px; }
.cptx.k4 .cx-sec-head { margin-bottom: 5px; }
.cptx.k4 .cx-sec-head h3 { font-size: 13px; }
.cptx.k4 .cx-info { font-size: 8px; line-height: 1.36; }
.cptx.k4 .cx-head { padding: 11px 20px 9px; }
.cptx.k4 .cx-title { font-size: 21px; }
.cptx.k4 .cx-stats b { font-size: 17px; }
.cptx.k4 .cx-ptable { font-size: 8.5px; }
.cptx.k4 .cx-ptable td { padding: 3px 7px; }
.cptx.k4 .cx-foot { padding: 8px 20px; }
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

  const rowH = ROW_H[Math.max(0, Math.min(ROW_H.length - 1, d.density))]

  /* Inclusions as prose. Trailing full stops are stripped so the joined run reads as
     one list rather than a string of sentences. */
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
      {/* data-cx-body is the fit loop's measuring point: the sheet itself is a
          fixed 4:5 box, so its own height can never reveal an overflow. */}
      <div className="cx-body" data-cx-body="1">

        {d.groups.length > 0 && (
          <div className="cx-sec">
            <div className="cx-sec-head"><h3 className="fr">Where You Go</h3><div /></div>
            {d.groups.map((g, gi) => (
              <div className="cx-city" key={gi}>
                <div className="cx-row" style={{ height: rowH }}>
                  {g.photos[0] && (
                    <div className="cx-photo" style={{ backgroundImage: `url("${g.photos[0].photoUrl}")`, backgroundPosition: FOCUS }} />
                  )}
                  <div className="cx-text">
                    <h4 className="fr cx-city-name">{g.city}</h4>
                    {g.blurb ? <p className="cx-blurb">{g.blurb}</p> : null}
                    {g.sites.length > 0 && <div className="cx-sites"><b>Sites</b>{g.sites.join(' · ')}</div>}
                  </div>
                  {g.photos[1] && (
                    <div className="cx-photo" style={{ backgroundImage: `url("${g.photos[1].photoUrl}")`, backgroundPosition: FOCUS }} />
                  )}
                </div>
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
            <div className="cx-sec-head"><h3 className="fr">Good to Know</h3><div /></div>
            {d.included.length > 0 && <p className="cx-info yes"><b>Included</b>{asProse(d.included)}.</p>}
            {d.excluded.length > 0 && <p className="cx-info no"><b>Not included</b>{asProse(d.excluded)}.</p>}
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
