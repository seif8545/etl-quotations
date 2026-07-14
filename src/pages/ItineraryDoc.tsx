import { forwardRef, useEffect } from 'react'

export interface ItineraryData {
  title: string
  intro: string
  heroUrl: string
  logoUrl: string
  meta: { ref: string; pax: number; arrival: string; departure: string }
  overview: { days: number; nights: number; cities: number; pax: number }
  days: { title: string; description: string; photoUrl: string; highlights: string[]; meals: string[]; hotel: string }[]
  hotels: { nights: number; destination: string }[]
  included: string[]
  excluded: string[]
  price: { pp: number; sgl: number; show: boolean }
  pricing: { show: boolean; refPp: number; refSgl: number; rows: { category: string; dbl: number; single: number; hotels: string }[] }
  contact: { phone: string; email: string; website: string; social: string }
}

const CSS = `
.itin { width: 794px; background: #fffefa; color: #0e2a47; font-family: 'Inter', system-ui, sans-serif; font-size: 14px; line-height: 1.5; }
.itin * { box-sizing: border-box; }
.itin .fr { font-family: 'Fraunces', Georgia, serif; }

/* Cover */
.itin-cover { position: relative; height: 1123px; overflow: hidden; display: flex; flex-direction: column; justify-content: space-between; }
.cover-hero { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.cover-ov { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(14,42,71,0.18) 0%, rgba(14,42,71,0.30) 45%, rgba(8,26,48,0.92) 100%); }
.cover-top { position: relative; z-index: 2; padding: 48px; display: flex; justify-content: center; }
.cover-logo { background: #ffffff; border-radius: 999px; padding: 13px 26px; box-shadow: 0 6px 24px rgba(0,0,0,0.25); }
.cover-logo img { height: 46px; display: block; }
.cover-bottom { position: relative; z-index: 2; padding: 0 64px 84px; color: #fff; }
.cover-eyebrow { color: #f0c53a; font-weight: 600; font-size: 13px; letter-spacing: 4px; text-transform: uppercase; margin-bottom: 14px; }
.cover-title { font-size: 56px; font-weight: 600; line-height: 1.02; margin: 0 0 20px; color: #fff; text-shadow: 0 2px 20px rgba(0,0,0,0.35); }
.cover-divider { width: 92px; height: 3px; background: linear-gradient(135deg,#c8960a,#e8b015); border-radius: 3px; margin-bottom: 20px; }
.cover-meta { font-size: 15px; letter-spacing: 0.3px; color: rgba(255,255,255,0.9); }
.cover-meta span { color: #f0c53a; margin: 0 9px; }

/* Opening — at a glance */
.opening { height: 1123px; overflow: hidden; box-sizing: border-box; padding: 96px 74px; display: flex; flex-direction: column; justify-content: center; background: #fffefa; }
.op-eyebrow { color: #b08a1e; font-weight: 600; font-size: 13px; letter-spacing: 4px; text-transform: uppercase; }
.op-title { font-size: 48px; font-weight: 600; color: #0e2a47; margin: 12px 0 0; }
.op-rule { width: 78px; height: 3px; background: linear-gradient(135deg,#c8960a,#e8b015); border-radius: 3px; margin: 22px 0 42px; }
.op-stats { display: flex; margin-bottom: 46px; }
.op-stats > div { flex: 1; text-align: center; border-left: 1px solid #e7dcc2; }
.op-stats > div:first-child { border-left: none; }
.op-stats b { display: block; font-size: 54px; font-weight: 600; color: #c8960a; line-height: 1; }
.op-stats span { display: block; margin-top: 8px; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; color: #8a7a5c; }
.op-intro { font-size: 18px; line-height: 1.9; color: #3a495c; max-width: 640px; margin: 0; }

/* Day — one full page each; alternating photo position */
.day-full { height: 1123px; overflow: hidden; display: flex; flex-direction: column; background: #fffefa; }
.df-photo { position: relative; overflow: hidden; flex-shrink: 0; height: 632px; }
.df-img { position: absolute; inset: -3px; background-size: cover; background-position: center; }
.df-grad { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(8,26,48,0) 42%, rgba(8,26,48,0.88) 100%); }
.df-num { position: absolute; top: 30px; right: 54px; font-size: 150px; font-weight: 600; line-height: 0.8; color: rgba(255,255,255,0.20); }
.df-cap { position: absolute; left: 62px; right: 62px; bottom: 46px; z-index: 2; color: #fff; }
.df-eyebrow { color: #f0c53a; font-weight: 600; font-size: 12px; letter-spacing: 3px; text-transform: uppercase; margin-bottom: 10px; }
.df-title { font-size: 46px; font-weight: 600; line-height: 1.04; margin: 0; color: #fff; text-shadow: 0 2px 16px rgba(0,0,0,0.4); }
.df-body { flex: 1; padding: 44px 64px 48px; display: flex; flex-direction: column; }
.df-b-eyebrow { color: #b08a1e; font-weight: 600; font-size: 12px; letter-spacing: 3px; text-transform: uppercase; margin-bottom: 8px; }
.df-b-title { font-size: 40px; font-weight: 600; line-height: 1.06; color: #0e2a47; margin: 0; }
.df-b-rule { width: 66px; height: 3px; background: linear-gradient(135deg,#c8960a,#e8b015); border-radius: 3px; margin: 18px 0 24px; }
.df-desc { list-style: none; margin: 0; padding: 0; }
.df-desc li { position: relative; padding-left: 20px; margin-bottom: 11px; font-size: 15px; color: #45566b; line-height: 1.6; }
.df-desc li::before { content: '\\2022'; position: absolute; left: 2px; top: 0; color: #c8960a; font-weight: 700; }
.df-body .d-foot { margin-top: 26px; border-top: 1px solid #ece0c4; padding-top: 18px; }

/* Day details (shared) */
.d-tags { font-size: 12px; letter-spacing: 0.4px; color: #9a8862; margin-bottom: 10px; }
.d-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 18px; }
.d-meals { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 7px; }
.d-lbl { font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; color: #9a8862; margin-right: 5px; }
.d-pill { font-size: 12px; color: #0e2a47; background: #f4f7fa; border: 1px solid #dde7f0; border-radius: 999px; padding: 4px 12px; }
.d-accom { font-size: 13px; color: #33465c; }
.d-accom .d-lbl { color: #b08a1e; }

/* Summary */
.summary-page { height: 1123px; overflow: hidden; box-sizing: border-box; padding: 70px 64px; background: #fffefa; }
.sum-block { margin-bottom: 34px; }
.sec-eyebrow { color: #b08a1e; font-weight: 600; font-size: 12px; letter-spacing: 3px; text-transform: uppercase; }
.sec-title { font-size: 32px; font-weight: 600; color: #0e2a47; margin: 8px 0 0; }
.sec-rule { width: 64px; height: 3px; background: linear-gradient(135deg,#c8960a,#e8b015); border-radius: 3px; margin: 15px 0 24px; }
.hotel-card { display: flex; align-items: center; gap: 18px; background: #faf5e9; border: 1px solid #efe4cb; border-radius: 12px; padding: 15px 22px; margin-bottom: 12px; }
.hotel-badge { width: 54px; height: 54px; border-radius: 50%; background: #0e2a47; color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink: 0; }
.hotel-badge b { font-size: 20px; line-height: 1; color: #e8b015; }
.hotel-badge span { font-size: 8px; text-transform: uppercase; letter-spacing: 1px; margin-top: 2px; }
.hotel-name { font-size: 18px; color: #0e2a47; }
.hotel-sub { font-size: 12px; color: #8a7a5c; margin-top: 3px; }
.inc-grid { display: flex; gap: 28px; }
.inc-col { flex: 1; }
.inc-col h4 { font-size: 16px; color: #0e2a47; margin: 0 0 12px; font-family: 'Fraunces', Georgia, serif; }
.inc-item { display: flex; align-items: flex-start; gap: 9px; font-size: 12.5px; color: #3a495c; margin-bottom: 8px; line-height: 1.45; }
.mark { flex-shrink: 0; font-weight: 700; }
.mark.yes { color: #1a6e2e; }
.mark.no { color: #a83828; }
.price-box { background: linear-gradient(135deg,#0e2a47,#163d6b); color: #fff; border-radius: 16px; padding: 26px 30px; text-align: center; margin-top: 26px; }
.price-eyebrow { color: #f0c53a; font-size: 12px; letter-spacing: 3px; text-transform: uppercase; }
.price-big { font-size: 46px; font-weight: 600; margin: 6px 0 2px; }
.price-unit { font-size: 12.5px; color: rgba(255,255,255,0.82); }
.price-sgl { font-size: 12px; color: #f0c53a; margin-top: 8px; }
.price-ref { font-size: 13px; color: #45566b; margin-bottom: 18px; }
.price-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.price-table th { text-align: left; background: #0e2a47; color: #fff; font-weight: 600; padding: 11px 14px; font-size: 10.5px; letter-spacing: 0.5px; text-transform: uppercase; }
.price-table td { padding: 11px 14px; border-bottom: 1px solid #eee2c8; vertical-align: top; }
.pt-cat { color: #0e2a47; font-weight: 600; white-space: nowrap; }
.pt-price { color: #806000; font-weight: 600; white-space: nowrap; }
.pt-hotels { color: #6a7789; font-size: 11.5px; }

/* Closing */
.sec-h { font-size: 30px; font-weight: 600; color: #0e2a47; margin: 0 0 6px; }
.rule { width: 64px; height: 3px; background: linear-gradient(135deg,#c8960a,#e8b015); border-radius: 3px; margin-bottom: 22px; }
.itin-closing { background: linear-gradient(180deg,#0e2a47,#081a30); color: #fff; height: 1123px; overflow: hidden; padding: 84px 64px 64px; display: flex; flex-direction: column; }
.itin-why { padding: 0 0 30px; }
.itin-why .sec-h { color: #fff; }
.why-grid { display: flex; flex-wrap: wrap; gap: 22px 36px; margin-top: 8px; }
.why-item { width: 45%; }
.why-item b { display: block; font-family: 'Fraunces', Georgia, serif; font-size: 17px; color: #e8b015; margin-bottom: 5px; }
.why-item span { font-size: 12.5px; color: rgba(255,255,255,0.82); line-height: 1.55; }
.itin-contact { text-align: center; margin-top: auto; }
.contact-thanks { font-size: 42px; font-weight: 600; margin: 0 0 10px; color: #fff; }
.contact-tag { font-size: 15px; color: rgba(255,255,255,0.82); margin-bottom: 34px; }
.contact-rows { display: inline-block; text-align: left; }
.contact-row { display: flex; gap: 12px; margin-bottom: 14px; font-size: 15px; align-items: baseline; }
.contact-row b { color: #e8b015; width: 96px; flex-shrink: 0; font-weight: 600; }
.contact-row span { color: #fff; }
.contact-brand { margin-bottom: 30px; }
.contact-brand-name { display: block; font-size: 38px; font-weight: 600; color: #e8b015; letter-spacing: 2px; }
.contact-brand-sub { display: block; font-size: 15px; letter-spacing: 10px; color: #c8960a; margin-top: 2px; }
`

const bulletsOf = (s: string): string[] => (s ? s.split('\n').map((l) => l.trim()).filter(Boolean) : [])

const ItineraryDoc = forwardRef<HTMLDivElement, { data: ItineraryData }>(({ data }, ref) => {
  const d = data
  useEffect(() => {
    if (typeof document === 'undefined') return
    let el = document.getElementById('itin-doc-css') as HTMLStyleElement | null
    if (!el) { el = document.createElement('style'); el.id = 'itin-doc-css'; document.head.appendChild(el) }
    el.textContent = CSS
  }, [])

  type DDay = ItineraryData['days'][number]

  const details = (day: DDay) => (
    <div className="d-foot">
      {day.highlights.length > 0 ? <div className="d-tags">{day.highlights.join('   ·   ')}</div> : null}
      <div className="d-meta">
        {day.meals.length > 0 ? <span className="d-meals"><span className="d-lbl">Meals</span>{day.meals.map((m, j) => <span className="d-pill" key={j}>{m}</span>)}</span> : null}
        {day.hotel ? <span className="d-accom"><span className="d-lbl">Stay</span> {day.hotel}</span> : null}
      </div>
    </div>
  )

  const dayPage = (day: DDay, i: number) => {
    const bl = bulletsOf(day.description)
    const num = String(i + 1).padStart(2, '0')
    return (
      <div className="day-full a" key={i}>
        <div className="df-photo">
          {day.photoUrl ? <div className="df-img" style={{ backgroundImage: `url("${day.photoUrl}")` }} /> : null}
          <div className="df-grad" />
          <div className="df-num fr">{num}</div>
          <div className="df-cap">
            <div className="df-eyebrow">Day {i + 1}</div>
            <h2 className="df-title fr">{day.title}</h2>
          </div>
        </div>
        <div className="df-body">
          {bl.length > 0 ? <ul className="df-desc">{bl.map((l, k) => <li key={k}>{l}</li>)}</ul> : null}
          {details(day)}
        </div>
      </div>
    )
  }

  return (
    <div className="itin" ref={ref}>
      {/* Cover */}
      <div className="itin-cover">
        <img className="cover-hero" src={d.heroUrl} crossOrigin="anonymous" alt="" />
        <div className="cover-ov" />
        <div className="cover-top"><div className="cover-logo"><img src={d.logoUrl} crossOrigin="anonymous" alt="Egypt Top Light" /></div></div>
        <div className="cover-bottom">
          <div className="cover-eyebrow">Tailor-Made Egypt Itinerary</div>
          <h1 className="fr cover-title">{d.title}</h1>
          <div className="cover-divider" />
          <div className="cover-meta">
            {d.meta.ref ? <>Ref {d.meta.ref}<span>·</span></> : null}
            {d.meta.pax} {d.meta.pax === 1 ? 'guest' : 'guests'}<span>·</span>{d.meta.arrival}{d.meta.departure ? <> <span>→</span> {d.meta.departure}</> : null}
          </div>
        </div>
      </div>

      {/* Opening — at a glance */}
      <div className="opening">
        <div className="op-eyebrow">Your Journey</div>
        <h2 className="fr op-title">At a Glance</h2>
        <div className="op-rule" />
        <div className="op-stats">
          <div><b className="fr">{d.overview.days}</b><span>{d.overview.days === 1 ? 'Day' : 'Days'}</span></div>
          <div><b className="fr">{d.overview.nights}</b><span>{d.overview.nights === 1 ? 'Night' : 'Nights'}</span></div>
          <div><b className="fr">{d.overview.cities}</b><span>{d.overview.cities === 1 ? 'City' : 'Cities'}</span></div>
          <div><b className="fr">{d.overview.pax}</b><span>{d.overview.pax === 1 ? 'Guest' : 'Guests'}</span></div>
        </div>
        {d.intro ? <p className="fr op-intro">{d.intro}</p> : null}
      </div>

      {/* One full page per day */}
      {d.days.map((day, i) => dayPage(day, i))}

      {/* Accommodation + inclusions + price */}
      {(d.hotels.length > 0 || d.included.length > 0 || d.excluded.length > 0 || d.price.show) && (
        <div className="summary-page">
          {d.hotels.length > 0 && (
            <div className="sum-block">
              <div className="sec-eyebrow">Where You Stay</div>
              <h2 className="fr sec-title">Accommodation</h2>
              <div className="sec-rule" />
              {d.hotels.map((h, i) => (
                <div className="hotel-card" key={i}>
                  <div className="hotel-badge"><b>{h.nights}</b><span>{h.nights > 1 ? 'nights' : 'night'}</span></div>
                  <div><div className="hotel-name fr">{h.destination}</div><div className="hotel-sub">{h.nights} night{h.nights > 1 ? 's' : ''} · double room basis</div></div>
                </div>
              ))}
            </div>
          )}
          {(d.included.length > 0 || d.excluded.length > 0) && (
            <div className="sum-block">
              <div className="sec-eyebrow">The Details</div>
              <h2 className="fr sec-title">What's Included</h2>
              <div className="sec-rule" />
              <div className="inc-grid">
                <div className="inc-col"><h4>Included</h4>{d.included.map((t, i) => <div className="inc-item" key={i}><span className="mark yes">✓</span>{t}</div>)}</div>
                <div className="inc-col"><h4>Not included</h4>{d.excluded.map((t, i) => <div className="inc-item" key={i}><span className="mark no">✕</span>{t}</div>)}</div>
              </div>
            </div>
          )}
          {d.price.show && (
            <div className="price-box">
              <div className="price-eyebrow">Package Price</div>
              <div className="fr price-big">${d.price.pp.toLocaleString()}</div>
              <div className="price-unit">per person · sharing double room</div>
              {d.price.sgl > 0 && <div className="price-sgl">Single room supplement: ${d.price.sgl.toLocaleString()} per person</div>}
            </div>
          )}
        </div>
      )}

      {/* Pricing table */}
      {d.pricing.show && d.pricing.rows.length > 0 && (
        <div className="summary-page">
          <div className="sec-eyebrow">Investment</div>
          <h2 className="fr sec-title">Package Pricing</h2>
          <div className="sec-rule" />
          {d.pricing.refPp > 0 && <div className="price-ref">Based on the quoted rate of <b>${d.pricing.refPp.toLocaleString()}</b> per person in double occupancy{d.pricing.refSgl > 0 ? <> · single supplement <b>${d.pricing.refSgl.toLocaleString()}</b></> : null}.</div>}
          <table className="price-table">
            <thead><tr><th>Category</th><th>Per Person in Double</th><th>Single Supplement</th><th>Offered Hotels</th></tr></thead>
            <tbody>
              {d.pricing.rows.map((r, i) => (
                <tr key={i}><td className="pt-cat">{r.category}</td><td className="pt-price">{r.dbl > 0 ? `${r.dbl.toLocaleString()} USD` : '—'}</td><td className="pt-price">{r.single > 0 ? `${r.single.toLocaleString()} USD` : '—'}</td><td className="pt-hotels">{r.hotels}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Closing */}
      <div className="itin-closing">
        <div className="itin-why">
          <h2 className="fr sec-h">Why Egypt Top Light</h2>
          <div className="rule" />
          <div className="why-grid">
            <div className="why-item"><b>Licensed & Trusted</b><span>A fully licensed Egyptian tour operator with an excellent TripAdvisor reputation.</span></div>
            <div className="why-item"><b>Expert Egyptologists</b><span>Private, professionally licensed guides who bring every site to life.</span></div>
            <div className="why-item"><b>Tailor-Made</b><span>Every journey is built around you — pace, interests and comfort.</span></div>
            <div className="why-item"><b>24/7 Support</b><span>A dedicated team on hand throughout your stay in Egypt.</span></div>
          </div>
        </div>
        <div className="itin-contact">
          <div className="contact-brand"><span className="fr contact-brand-name">EGYPT TOP LIGHT</span><span className="contact-brand-sub">T R A V E L</span></div>
          <h2 className="fr contact-thanks">Thank You</h2>
          <div className="contact-tag">We look forward to welcoming you to Egypt.</div>
          <div className="contact-rows">
            <div className="contact-row"><b>WhatsApp</b><span>{d.contact.phone}</span></div>
            <div className="contact-row"><b>Email</b><span>{d.contact.email}</span></div>
            <div className="contact-row"><b>Website</b><span>{d.contact.website}</span></div>
            <div className="contact-row"><b>Social</b><span>{d.contact.social}</span></div>
          </div>
        </div>
      </div>
    </div>
  )
})

export default ItineraryDoc
