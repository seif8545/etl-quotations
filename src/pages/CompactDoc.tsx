import { forwardRef, useEffect } from 'react'

import type { Segment } from '../lib/segments'

/** A derived block plus its photo resolved to a renderable URL. */
export interface CompactSegment extends Segment {
  photoUrl: string
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
  heroUrl: string
  logoUrl: string
  meta: { ref: string; pax: number; arrival: string; departure: string }
  overview: { days: number; nights: number; cities: number; pax: number }
  segments: CompactSegment[]
  included: string[]
  excluded: string[]
  price: { pp: number; sgl: number; show: boolean }
  pricing: { show: boolean; rows: CompactPricingRow[]; columns?: 'all' | 'dbl' | 'single' | 'triple' | 'quad' }
  contact: { phone: string; email: string; website: string; social: string }
  roomBasis?: string
  /** 0 = roomy … 3 = tightest. Driven by the fit loop in PackageBuilder. */
  density: number
  /** Spill inclusions + pricing onto a second page. */
  twoPage: boolean
}

/*
 * Same rendering contract as ItineraryDoc:
 *   - every direct child of the root is exactly one 794x1123 page
 *   - CSS lives in document.head, never in an inline <style> inside the captured
 *     node (an inline <style> gives html2canvas a phantom box at the top — see
 *     handoff.md section 8B)
 *   - photos are fixed-height boxes, never auto-height flex items with height:100%
 *     images (section 8C)
 * so the existing per-page html2canvas export loop works on it unchanged.
 */
const CSS = `
.cpt { width: 794px; background: #fffefa; color: #0e2a47; font-family: 'Inter', system-ui, sans-serif; font-size: 14px; line-height: 1.5; }
.cpt * { box-sizing: border-box; }
.cpt .fr { font-family: 'Fraunces', Georgia, serif; }
.cpt-page { width: 794px; height: 1123px; overflow: hidden; display: flex; flex-direction: column; background: #fffefa; }

/* Hero band */
.cpt-hero-wrap { position: relative; height: 300px; flex-shrink: 0; overflow: hidden; }
.cpt-hero { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.cpt-hero-ov { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(14,42,71,0.22) 0%, rgba(14,42,71,0.42) 48%, rgba(8,26,48,0.93) 100%); }
.cpt-hero-top { position: relative; z-index: 2; padding: 20px 34px 0; }
.cpt-logo { background: #ffffff; border-radius: 999px; padding: 8px 18px; display: inline-block; box-shadow: 0 5px 18px rgba(0,0,0,0.25); }
.cpt-logo img { height: 30px; display: block; }
.cpt-hero-bottom { position: absolute; left: 46px; right: 46px; bottom: 24px; z-index: 2; color: #fff; }
.cpt-eyebrow { color: #f0c53a; font-weight: 600; font-size: 11px; letter-spacing: 3.4px; text-transform: uppercase; margin-bottom: 7px; }
.cpt-title { font-size: 38px; font-weight: 600; line-height: 1.06; margin: 0; color: #fff; text-shadow: 0 2px 18px rgba(0,0,0,0.4); }
.cpt-title-rule { width: 74px; height: 3px; background: linear-gradient(135deg,#c8960a,#e8b015); border-radius: 3px; margin: 12px 0 11px; }
.cpt-meta { font-size: 13px; letter-spacing: 0.2px; color: rgba(255,255,255,0.92); }
.cpt-meta i { font-style: normal; color: #f0c53a; margin: 0 8px; }

/* At a glance strip */
.cpt-glance { flex-shrink: 0; height: 64px; display: flex; align-items: center; background: #faf5e9; border-bottom: 1px solid #efe4cb; }
.cpt-glance > div { flex: 1; text-align: center; border-left: 1px solid #e7dcc2; }
.cpt-glance > div:first-child { border-left: none; }
.cpt-glance b { display: block; font-size: 25px; font-weight: 600; color: #c8960a; line-height: 1; }
.cpt-glance span { display: block; margin-top: 4px; font-size: 9.5px; letter-spacing: 2px; text-transform: uppercase; color: #8a7a5c; }

/* Flowing content area — the fit loop measures .cpt-inner against .cpt-flow.
   min-height:0 is load-bearing: column flex items default to min-height:auto, so
   without it .cpt-flow would grow to its content instead of clipping — pushing the
   contact strip off the page AND making clientHeight == content height, which would
   stop the fit loop from ever seeing an overflow. */
.cpt-flow { flex: 1; min-height: 0; overflow: hidden; }
.cpt-inner { padding: 20px 46px 22px; }

.cpt-intro { font-size: 13.5px; line-height: 1.62; color: #45566b; margin: 0 0 16px; }

.cpt-sec-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 10px; }
.cpt-sec-head h3 { font-size: 19px; font-weight: 600; color: #0e2a47; margin: 0; }
.cpt-sec-head .cpt-sec-rule { flex: 1; height: 2px; background: linear-gradient(90deg,#e8b015,rgba(232,176,21,0.12)); border-radius: 2px; }
.cpt-sec { margin-bottom: 18px; }
.cpt-sec:last-child { margin-bottom: 0; }

/* Segment rows */
.cpt-seg { display: flex; gap: 14px; padding-bottom: 11px; margin-bottom: 11px; border-bottom: 1px solid #ece0c4; }
.cpt-seg:last-child { border-bottom: none; padding-bottom: 0; margin-bottom: 0; }
.cpt-seg-thumb { width: 132px; height: 96px; flex-shrink: 0; border-radius: 10px; overflow: hidden; background-color: #e9e2d2; background-size: cover; background-position: center; }
.cpt-seg-main { flex: 1; min-width: 0; }
.cpt-seg-eyebrow { color: #b08a1e; font-weight: 600; font-size: 10px; letter-spacing: 2.4px; text-transform: uppercase; }
.cpt-seg-eyebrow em { font-style: normal; color: #bdb192; margin: 0 6px; }
.cpt-seg-title { font-size: 20px; font-weight: 600; line-height: 1.15; color: #0e2a47; margin: 3px 0 5px; }
.cpt-seg-hl { font-size: 12.5px; line-height: 1.5; color: #45566b; }
.cpt-seg-hl s { text-decoration: none; color: #c8960a; margin: 0 6px; }
.cpt-seg-note { font-size: 11.5px; line-height: 1.45; color: #6a7789; font-style: italic; margin-top: 4px; }
.cpt-seg-foot { margin-top: 7px; padding-top: 6px; border-top: 1px dashed #e7dcc2; font-size: 11.5px; color: #33465c; }
.cpt-seg-foot b { color: #b08a1e; font-weight: 600; font-size: 9px; letter-spacing: 1.4px; text-transform: uppercase; margin-right: 6px; }
.cpt-seg-foot u { text-decoration: none; color: #cbbfa4; margin: 0 9px; }

/* Included / excluded */
.cpt-inc { display: flex; gap: 26px; }
.cpt-inc-col { flex: 1; min-width: 0; }
.cpt-inc-col h4 { font-size: 13px; color: #0e2a47; margin: 0 0 7px; font-family: 'Fraunces', Georgia, serif; }
.cpt-inc-item { display: flex; align-items: flex-start; gap: 7px; font-size: 11.5px; color: #3a495c; margin-bottom: 5px; line-height: 1.4; }
.cpt-mark { flex-shrink: 0; font-weight: 700; }
.cpt-mark.yes { color: #1a6e2e; }
.cpt-mark.no { color: #a83828; }

/* Pricing */
.cpt-ptable { width: 100%; border-collapse: collapse; font-size: 11.5px; }
.cpt-ptable th { text-align: left; background: #0e2a47; color: #fff; font-weight: 600; padding: 8px 11px; font-size: 9.5px; letter-spacing: 0.5px; text-transform: uppercase; }
.cpt-ptable td { padding: 8px 11px; border-bottom: 1px solid #eee2c8; vertical-align: top; }
.cpt-ptable tr:last-child td { border-bottom: none; }
.cpt-pt-cat { color: #0e2a47; font-weight: 600; white-space: nowrap; }
.cpt-pt-price { color: #806000; font-weight: 600; white-space: nowrap; }
.cpt-pt-hotels { color: #6a7789; font-size: 10.5px; line-height: 1.35; }
.cpt-pbox { background: linear-gradient(135deg,#0e2a47,#163d6b); color: #fff; border-radius: 14px; padding: 16px 22px; display: flex; align-items: center; gap: 20px; }
.cpt-pbox-l { flex-shrink: 0; }
.cpt-pbox-eyebrow { color: #f0c53a; font-size: 9.5px; letter-spacing: 2.6px; text-transform: uppercase; }
.cpt-pbox-big { font-size: 32px; font-weight: 600; margin: 3px 0 0; line-height: 1; }
.cpt-pbox-r { font-size: 11.5px; color: rgba(255,255,255,0.85); line-height: 1.5; }
.cpt-pbox-r b { color: #f0c53a; font-weight: 600; }
.cpt-price-note { font-size: 10.5px; color: #8a7a5c; margin-top: 6px; }

/* Contact strip */
.cpt-contact { flex-shrink: 0; height: 58px; background: linear-gradient(180deg,#0e2a47,#081a30); color: #fff; display: flex; align-items: center; justify-content: space-between; padding: 0 40px; }
.cpt-contact-brand { font-size: 15px; font-weight: 600; color: #e8b015; letter-spacing: 2px; }
.cpt-contact-brand span { display: block; font-size: 7.5px; letter-spacing: 5px; color: #c8960a; margin-top: 1px; }
.cpt-contact-rows { display: flex; gap: 22px; font-size: 11px; }
.cpt-contact-rows div b { color: #e8b015; font-weight: 600; margin-right: 5px; }

/* Page 2 header */
.cpt-slim { flex-shrink: 0; height: 74px; background: linear-gradient(135deg,#0e2a47,#163d6b); color: #fff; display: flex; align-items: center; gap: 16px; padding: 0 40px; }
.cpt-slim-logo { background: #fff; border-radius: 999px; padding: 6px 14px; display: inline-flex; }
.cpt-slim-logo img { height: 24px; display: block; }
.cpt-slim-t { font-size: 19px; font-weight: 600; color: #fff; }
.cpt-slim-e { margin-left: auto; font-size: 10px; letter-spacing: 2.6px; text-transform: uppercase; color: #f0c53a; }

/* ---- Density steps: applied when the content overflows the page box ---- */
.cpt.d1 .cpt-inner { padding: 16px 44px 18px; }
.cpt.d1 .cpt-intro { font-size: 12.5px; line-height: 1.5; margin-bottom: 12px; }
.cpt.d1 .cpt-sec { margin-bottom: 14px; }
.cpt.d1 .cpt-seg { padding-bottom: 9px; margin-bottom: 9px; gap: 12px; }
.cpt.d1 .cpt-seg-thumb { width: 118px; height: 84px; }
.cpt.d1 .cpt-seg-title { font-size: 18px; margin: 2px 0 4px; }
.cpt.d1 .cpt-seg-hl { font-size: 11.5px; line-height: 1.44; }
.cpt.d1 .cpt-seg-foot { margin-top: 5px; padding-top: 5px; font-size: 11px; }
.cpt.d1 .cpt-inc-item { font-size: 11px; margin-bottom: 4px; }
.cpt.d1 .cpt-ptable th { padding: 7px 10px; }
.cpt.d1 .cpt-ptable td { padding: 7px 10px; }
.cpt.d1 .cpt-sec-head { margin-bottom: 8px; }
.cpt.d1 .cpt-sec-head h3 { font-size: 18px; }

.cpt.d2 .cpt-inner { padding: 13px 42px 15px; }
.cpt.d2 .cpt-intro { font-size: 11.5px; line-height: 1.45; margin-bottom: 10px; }
.cpt.d2 .cpt-sec { margin-bottom: 11px; }
.cpt.d2 .cpt-seg { padding-bottom: 7px; margin-bottom: 7px; gap: 11px; }
.cpt.d2 .cpt-seg-thumb { width: 104px; height: 74px; }
.cpt.d2 .cpt-seg-title { font-size: 16.5px; margin: 2px 0 3px; }
.cpt.d2 .cpt-seg-hl { font-size: 11px; line-height: 1.4; }
.cpt.d2 .cpt-seg-note { font-size: 10.5px; }
.cpt.d2 .cpt-seg-foot { margin-top: 4px; padding-top: 4px; font-size: 10.5px; }
.cpt.d2 .cpt-inc-item { font-size: 10.5px; margin-bottom: 3px; gap: 6px; }
.cpt.d2 .cpt-inc-col h4 { font-size: 12px; margin-bottom: 5px; }
.cpt.d2 .cpt-ptable { font-size: 10.5px; }
.cpt.d2 .cpt-ptable th { padding: 6px 9px; }
.cpt.d2 .cpt-ptable td { padding: 6px 9px; }
.cpt.d2 .cpt-pt-hotels { font-size: 9.5px; }
.cpt.d2 .cpt-sec-head { margin-bottom: 7px; }
.cpt.d2 .cpt-sec-head h3 { font-size: 17px; }
.cpt.d2 .cpt-pbox { padding: 13px 20px; }
.cpt.d2 .cpt-pbox-big { font-size: 28px; }

.cpt.d3 .cpt-inner { padding: 11px 40px 13px; }
.cpt.d3 .cpt-intro { font-size: 10.5px; line-height: 1.4; margin-bottom: 8px; }
.cpt.d3 .cpt-sec { margin-bottom: 9px; }
.cpt.d3 .cpt-seg { padding-bottom: 6px; margin-bottom: 6px; gap: 10px; }
.cpt.d3 .cpt-seg-thumb { width: 92px; height: 64px; }
.cpt.d3 .cpt-seg-eyebrow { font-size: 9px; letter-spacing: 2px; }
.cpt.d3 .cpt-seg-title { font-size: 15px; margin: 1px 0 3px; }
.cpt.d3 .cpt-seg-hl { font-size: 10.5px; line-height: 1.36; }
.cpt.d3 .cpt-seg-note { font-size: 10px; }
.cpt.d3 .cpt-seg-foot { margin-top: 4px; padding-top: 4px; font-size: 10px; }
.cpt.d3 .cpt-inc-item { font-size: 10px; margin-bottom: 2px; gap: 5px; line-height: 1.35; }
.cpt.d3 .cpt-inc-col h4 { font-size: 11.5px; margin-bottom: 4px; }
.cpt.d3 .cpt-inc { gap: 20px; }
.cpt.d3 .cpt-ptable { font-size: 10px; }
.cpt.d3 .cpt-ptable th { padding: 5px 8px; }
.cpt.d3 .cpt-ptable td { padding: 5px 8px; }
.cpt.d3 .cpt-pt-hotels { font-size: 9px; }
.cpt.d3 .cpt-sec-head { margin-bottom: 6px; }
.cpt.d3 .cpt-sec-head h3 { font-size: 16px; }
.cpt.d3 .cpt-pbox { padding: 11px 18px; }
.cpt.d3 .cpt-pbox-big { font-size: 25px; }
`

/** yyyy-mm-dd -> "12 Oct 2026". Parsed as UTC so the date never shifts a day. */
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
  { key: 'dbl', label: 'Double (pp)' },
  { key: 'single', label: 'Single Supp.' },
  { key: 'triple', label: 'Triple (pp)' },
  { key: 'quad', label: 'Quad (pp)' },
]

const CompactDoc = forwardRef<HTMLDivElement, { data: CompactData }>(({ data }, ref) => {
  const d = data

  useEffect(() => {
    if (typeof document === 'undefined') return
    let el = document.getElementById('cpt-doc-css') as HTMLStyleElement | null
    if (!el) { el = document.createElement('style'); el.id = 'cpt-doc-css'; document.head.appendChild(el) }
    el.textContent = CSS
  }, [])

  const segments = d.segments.filter((s) => !s.hidden)

  const heroBand = (
    <div className="cpt-hero-wrap">
      {d.heroUrl ? <img className="cpt-hero" src={d.heroUrl} crossOrigin="anonymous" alt="" /> : null}
      <div className="cpt-hero-ov" />
      <div className="cpt-hero-top">
        <div className="cpt-logo"><img src={d.logoUrl} crossOrigin="anonymous" alt="Egypt Top Light" /></div>
      </div>
      <div className="cpt-hero-bottom">
        <div className="cpt-eyebrow">Tailor-Made Egypt Itinerary</div>
        <h1 className="fr cpt-title">{d.title}</h1>
        <div className="cpt-title-rule" />
        <div className="cpt-meta">
          {d.meta.ref ? <>Ref {d.meta.ref}<i>·</i></> : null}
          {d.meta.pax} {d.meta.pax === 1 ? 'guest' : 'guests'}
          {d.meta.arrival ? <><i>·</i>{fmtDate(d.meta.arrival)}{d.meta.departure ? <><i>→</i>{fmtDate(d.meta.departure)}</> : null}</> : null}
        </div>
      </div>
    </div>
  )

  const glance = (
    <div className="cpt-glance">
      <div><b className="fr">{d.overview.days}</b><span>{d.overview.days === 1 ? 'Day' : 'Days'}</span></div>
      <div><b className="fr">{d.overview.nights}</b><span>{d.overview.nights === 1 ? 'Night' : 'Nights'}</span></div>
      <div><b className="fr">{d.overview.cities}</b><span>{d.overview.cities === 1 ? 'City' : 'Cities'}</span></div>
      <div><b className="fr">{d.overview.pax}</b><span>{d.overview.pax === 1 ? 'Guest' : 'Guests'}</span></div>
    </div>
  )

  const introBlock = d.intro ? <p className="cpt-intro">{d.intro}</p> : null

  const segmentsBlock = segments.length > 0 ? (
    <div className="cpt-sec">
      <div className="cpt-sec-head"><h3 className="fr">Your Itinerary</h3><div className="cpt-sec-rule" /></div>
      {segments.map((s) => {
        const url = s.photoUrl || ''
        // Overrides come straight from a comma input, so blanks can slip through.
        const hl = s.highlights.map((h) => (h ?? '').trim()).filter(Boolean)
        return (
          <div className="cpt-seg" key={s.key}>
            <div className="cpt-seg-thumb" style={url ? { backgroundImage: `url("${url}")` } : undefined} />
            <div className="cpt-seg-main">
              <div className="cpt-seg-eyebrow">{s.label}{s.dayRange ? <><em>·</em>{s.dayRange}</> : null}</div>
              <h4 className="fr cpt-seg-title">{s.destination}</h4>
              {hl.length > 0 && (
                <div className="cpt-seg-hl">
                  {hl.map((h, k) => <span key={k}>{k > 0 ? <s>·</s> : null}{h}</span>)}
                </div>
              )}
              {s.notes.map((n, k) => <div className="cpt-seg-note" key={k}>{n}</div>)}
              {(s.stay || s.meals) && (
                <div className="cpt-seg-foot">
                  {s.stay ? <><b>Stay</b>{s.stay}</> : null}
                  {s.stay && s.meals ? <u>·</u> : null}
                  {s.meals ? <><b>Meals</b>{s.meals}</> : null}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  ) : null

  const incBlock = (d.included.length > 0 || d.excluded.length > 0) ? (
    <div className="cpt-sec">
      <div className="cpt-sec-head"><h3 className="fr">What's Included</h3><div className="cpt-sec-rule" /></div>
      <div className="cpt-inc">
        <div className="cpt-inc-col">
          <h4>Included</h4>
          {d.included.map((t, i) => <div className="cpt-inc-item" key={i}><span className="cpt-mark yes">✓</span>{t}</div>)}
        </div>
        <div className="cpt-inc-col">
          <h4>Not included</h4>
          {d.excluded.map((t, i) => <div className="cpt-inc-item" key={i}><span className="cpt-mark no">✕</span>{t}</div>)}
        </div>
      </div>
    </div>
  ) : null

  // The compact sheet always carries pricing: the tier table when it has real rows,
  // otherwise the per-person box, otherwise an explicit "on request" line — never blank.
  const tierRows = d.pricing.rows.filter((r) => (r.category ?? '').trim() && (r.dbl > 0 || r.single > 0 || r.triple > 0 || r.quad > 0))
  const showTable = d.pricing.show && tierRows.length > 0
  const mode = d.pricing.columns || 'all'
  const hasAny = (key: PriceColKey) => tierRows.some((r) => (r[key] || 0) > 0)
  const cols = mode === 'all'
    ? PRICE_COLS.filter((c) => c.key === 'dbl' || c.key === 'single' || hasAny(c.key))
    : PRICE_COLS.filter((c) => c.key === mode)
  const anyHotels = tierRows.some((r) => (r.hotels ?? '').trim())
  const basis = d.roomBasis || 'double'

  const pricingBlock = (
    <div className="cpt-sec">
      <div className="cpt-sec-head"><h3 className="fr">Pricing</h3><div className="cpt-sec-rule" /></div>
      {showTable ? (
        <>
          <table className="cpt-ptable">
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
                  <td className="cpt-pt-cat">{r.category}</td>
                  {cols.map((c) => <td className="cpt-pt-price" key={c.key}>{(r[c.key] || 0) > 0 ? `${(r[c.key] || 0).toLocaleString()} USD` : '—'}</td>)}
                  {anyHotels ? (
                    <td className="cpt-pt-hotels">
                      {(r.hotels ?? '').split('\n').map((l) => l.trim()).filter(Boolean).map((l, k) => <div key={k}>{l}</div>)}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="cpt-price-note">Rates are per person in USD, based on {basis} room occupancy.</div>
        </>
      ) : d.price.pp > 0 ? (
        <div className="cpt-pbox">
          <div className="cpt-pbox-l">
            <div className="cpt-pbox-eyebrow">Package Price</div>
            <div className="fr cpt-pbox-big">${d.price.pp.toLocaleString()}</div>
          </div>
          <div className="cpt-pbox-r">
            <div>per person · sharing {basis} room</div>
            {d.price.sgl > 0 ? <div><b>Single supplement</b> ${d.price.sgl.toLocaleString()} per person</div> : null}
            <div>{d.overview.nights} {d.overview.nights === 1 ? 'night' : 'nights'} · {d.overview.days} {d.overview.days === 1 ? 'day' : 'days'} · {d.meta.pax} {d.meta.pax === 1 ? 'guest' : 'guests'}</div>
          </div>
        </div>
      ) : (
        <div className="cpt-price-note">Pricing on request — please contact us for a tailored quotation.</div>
      )}
    </div>
  )

  const contact = (
    <div className="cpt-contact">
      <div className="fr cpt-contact-brand">EGYPT TOP LIGHT<span>T R A V E L</span></div>
      <div className="cpt-contact-rows">
        <div><b>WhatsApp</b>{d.contact.phone}</div>
        <div><b>Email</b>{d.contact.email}</div>
        <div><b>Web</b>{d.contact.website}</div>
      </div>
    </div>
  )

  const cls = `cpt d${Math.max(0, Math.min(3, d.density))}`

  if (!d.twoPage) {
    return (
      <div className={cls} ref={ref}>
        <div className="cpt-page">
          {heroBand}
          {glance}
          <div className="cpt-flow" data-cpt-flow="1">
            <div className="cpt-inner">
              {introBlock}
              {segmentsBlock}
              {incBlock}
              {pricingBlock}
            </div>
          </div>
          {contact}
        </div>
      </div>
    )
  }

  return (
    <div className={cls} ref={ref}>
      <div className="cpt-page">
        {heroBand}
        {glance}
        <div className="cpt-flow" data-cpt-flow="1">
          <div className="cpt-inner">
            {introBlock}
            {segmentsBlock}
          </div>
        </div>
      </div>
      <div className="cpt-page">
        <div className="cpt-slim">
          <div className="cpt-slim-logo"><img src={d.logoUrl} crossOrigin="anonymous" alt="Egypt Top Light" /></div>
          <div className="fr cpt-slim-t">{d.title}</div>
          <div className="cpt-slim-e">Inclusions &amp; Pricing</div>
        </div>
        <div className="cpt-flow" data-cpt-flow="1">
          <div className="cpt-inner">
            {incBlock}
            {pricingBlock}
          </div>
        </div>
        {contact}
      </div>
    </div>
  )
})

export default CompactDoc
