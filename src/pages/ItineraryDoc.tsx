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
.cover-ov { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(14,42,71,0.15) 0%, rgba(14,42,71,0.30) 45%, rgba(8,26,48,0.90) 100%); }
.cover-top { position: relative; z-index: 2; padding: 46px; display: flex; justify-content: center; }
.cover-logo { background: #ffffff; border-radius: 999px; padding: 14px 26px; box-shadow: 0 6px 24px rgba(0,0,0,0.25); }
.cover-logo img { height: 48px; display: block; }
.cover-bottom { position: relative; z-index: 2; padding: 0 60px 76px; color: #fff; }
.cover-eyebrow { color: #f0c53a; font-weight: 600; font-size: 13px; letter-spacing: 3px; text-transform: uppercase; margin-bottom: 12px; }
.cover-title { font-size: 52px; font-weight: 600; line-height: 1.03; margin: 0 0 18px; color: #fff; text-shadow: 0 2px 18px rgba(0,0,0,0.35); }
.cover-divider { width: 96px; height: 4px; background: linear-gradient(135deg,#c8960a,#e8b015); border-radius: 4px; margin-bottom: 18px; }
.cover-meta { font-size: 16px; color: rgba(255,255,255,0.92); }
.cover-meta span { color: #f0c53a; margin: 0 8px; }

/* Overview strip */
.itin-strip { display: flex; background: #0e2a47; color: #fff; padding: 26px 40px; page-break-inside: avoid; }
.stat { flex: 1; text-align: center; border-right: 1px solid rgba(255,255,255,0.14); }
.stat:last-child { border-right: none; }
.stat b { display: block; font-size: 32px; font-weight: 600; color: #e8b015; }
.stat span { font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; color: rgba(255,255,255,0.75); }

/* Sections */
.itin-sec { padding: 22px 48px; }
.sec-h { font-size: 27px; font-weight: 600; color: #0e2a47; margin: 0 0 6px; }
.rule { width: 62px; height: 3px; background: linear-gradient(135deg,#c8960a,#e8b015); border-radius: 3px; margin-bottom: 20px; }
.intro-card { background: #f7f1e6; border-left: 4px solid #c8960a; border-radius: 8px; padding: 20px 24px; font-size: 15px; color: #33465c; line-height: 1.6; }

/* Day cards */
.day { display: flex; background: #fff; border: 1px solid #ecdcb6; border-radius: 14px; overflow: hidden; margin-bottom: 14px; box-shadow: 0 6px 20px rgba(14,42,71,0.06); page-break-inside: avoid; }
.day.alt { flex-direction: row-reverse; }
.day-photo { width: 260px; height: 200px; flex-shrink: 0; object-fit: cover; }
.day-body { padding: 22px 26px; flex: 1; }
.day-tag { display: inline-block; background: linear-gradient(135deg,#c8960a,#e8b015); color: #3a2a00; font-weight: 700; font-size: 11px; letter-spacing: 1.2px; padding: 4px 13px; border-radius: 999px; }
.day-title { font-size: 23px; font-weight: 600; color: #0e2a47; margin: 10px 0 8px; }
.day-desc { list-style: none; margin: 8px 0 0; padding: 0; }
.day-desc li { position: relative; padding-left: 15px; margin-bottom: 5px; font-size: 12.5px; color: #45566b; line-height: 1.5; }
.day-desc li::before { content: '•'; position: absolute; left: 2px; top: -1px; color: #c8960a; font-weight: 700; font-size: 13px; }
.day-chips { margin-top: 14px; display: flex; flex-wrap: wrap; gap: 7px; }
.day-meals { margin-top: 9px; display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.day-accom { margin-top: 6px; font-size: 12px; color: #33465c; }
.meals-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #9a8862; margin-right: 2px; }
.meal-pill { font-size: 11px; color: #0e2a47; background: #eef3f8; border: 1px solid #d4e0ec; border-radius: 999px; padding: 3px 10px; }
.chip { font-size: 11px; color: #806000; border: 1px solid #e6cf8f; background: #fdf6e3; border-radius: 999px; padding: 3px 11px; }

/* Accommodation */
.hotel-card { display: flex; align-items: center; gap: 16px; background: #f7f1e6; border-radius: 10px; padding: 14px 20px; margin-bottom: 10px; page-break-inside: avoid; }
.hotel-badge { width: 52px; height: 52px; flex-shrink: 0; border-radius: 50%; background: linear-gradient(135deg,#0e2a47,#163d6b); color: #e8b015; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.hotel-badge b { font-size: 20px; font-weight: 700; line-height: 1; }
.hotel-badge span { font-size: 9px; letter-spacing: 1px; text-transform: uppercase; }
.hotel-name { font-size: 17px; font-weight: 600; color: #0e2a47; }
.hotel-sub { font-size: 12.5px; color: #6a7789; }

/* Included / excluded */
.inc-grid { display: flex; gap: 22px; }
.inc-col { flex: 1; background: #fff; border: 1px solid #ece0c4; border-radius: 12px; padding: 20px 22px; page-break-inside: avoid; }
.inc-col h4 { font-size: 16px; font-weight: 700; margin: 0 0 14px; color: #0e2a47; }
.inc-item { display: flex; align-items: flex-start; gap: 9px; font-size: 13px; color: #3a495c; margin-bottom: 9px; line-height: 1.4; }
.mark { width: 18px; height: 18px; flex-shrink: 0; border-radius: 50%; color: #fff; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; margin-top: 1px; }
.mark.yes { background: #1a6e2e; }
.mark.no { background: #b98a8a; }

/* Price */
.price-box { background: linear-gradient(135deg,#0e2a47,#163d6b); color: #fff; border-radius: 16px; padding: 30px; text-align: center; page-break-inside: avoid; }
.price-eyebrow { color: #f0c53a; font-size: 13px; letter-spacing: 2px; text-transform: uppercase; font-weight: 600; }
.price-big { font-size: 46px; font-weight: 700; color: #e8b015; margin: 8px 0 2px; }
.price-unit { font-size: 14px; color: rgba(255,255,255,0.85); }
.price-sgl { margin-top: 14px; font-size: 13px; color: rgba(255,255,255,0.8); border-top: 1px solid rgba(255,255,255,0.16); padding-top: 12px; }
.price-ref { font-size: 12.5px; color: #6a7789; margin-bottom: 14px; }
.price-ref b { color: #0e2a47; }
.price-table { width: 100%; border-collapse: collapse; font-size: 12.5px; page-break-inside: avoid; }
.price-table th { background: #0e2a47; color: #fff; font-family: 'Fraunces', Georgia, serif; font-weight: 600; text-align: left; padding: 10px 12px; font-size: 12px; }
.price-table td { border: 1px solid #e3d9c0; padding: 9px 12px; vertical-align: top; }
.price-table tbody tr:nth-child(even) { background: #faf5e9; }
.pt-cat { font-weight: 700; color: #0e2a47; white-space: nowrap; }
.pt-price { color: #806000; font-weight: 600; white-space: nowrap; }
.pt-hotels { color: #45566b; }

/* Why us */
.itin-closing { page-break-before: always; background: linear-gradient(180deg,#0e2a47,#081a30); color: #fff; min-height: 1115px; padding: 46px 56px 56px; display: flex; flex-direction: column; }
.itin-why { padding: 0 0 30px; }
.itin-why .sec-h { color: #fff; }
.why-grid { display: flex; flex-wrap: wrap; gap: 20px 34px; margin-top: 6px; }
.why-item { width: 45%; }
.why-item b { display: block; font-family: 'Fraunces', Georgia, serif; font-size: 16px; color: #e8b015; margin-bottom: 4px; }
.why-item span { font-size: 12.5px; color: rgba(255,255,255,0.82); line-height: 1.5; }

/* Contact */
.itin-contact { text-align: center; margin-top: auto; }
.contact-logo { background: #ffffff; border-radius: 999px; padding: 14px 28px; display: inline-block; margin-bottom: 30px; }
.contact-logo img { height: 50px; display: block; }
.contact-thanks { font-size: 40px; font-weight: 600; margin: 0 0 10px; color: #fff; }
.contact-tag { font-size: 15px; color: rgba(255,255,255,0.82); margin-bottom: 34px; }
.contact-rows { display: inline-block; text-align: left; }
.contact-row { display: flex; gap: 12px; margin-bottom: 14px; font-size: 15px; align-items: baseline; }
.contact-row b { color: #e8b015; width: 96px; flex-shrink: 0; font-weight: 600; }
.contact-row span { color: #fff; }
.contact-brand { margin-bottom: 30px; }
.contact-brand-name { display: block; font-size: 38px; font-weight: 600; color: #e8b015; letter-spacing: 2px; }
.contact-brand-sub { display: block; font-size: 15px; letter-spacing: 10px; color: #c8960a; margin-top: 2px; }
`

const ItineraryDoc = forwardRef<HTMLDivElement, { data: ItineraryData }>(({ data }, ref) => {
  const d = data
  useEffect(() => {
    if (typeof document !== 'undefined' && !document.getElementById('itin-doc-css')) {
      const el = document.createElement('style')
      el.id = 'itin-doc-css'
      el.textContent = CSS
      document.head.appendChild(el)
    }
  }, [])
  return (
    <div className="itin" ref={ref}>

      {/* Cover */}
      <div className="itin-cover">
        <img className="cover-hero" src={d.heroUrl} crossOrigin="anonymous" alt="" />
        <div className="cover-ov" />
        <div className="cover-top">
          <div className="cover-logo"><img src={d.logoUrl} crossOrigin="anonymous" alt="Egypt Top Light" /></div>
        </div>
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

      {/* Overview strip */}
      <div className="itin-strip">
        <div className="stat"><b>{d.overview.days}</b><span>{d.overview.days === 1 ? 'Day' : 'Days'}</span></div>
        <div className="stat"><b>{d.overview.nights}</b><span>{d.overview.nights === 1 ? 'Night' : 'Nights'}</span></div>
        <div className="stat"><b>{d.overview.cities}</b><span>{d.overview.cities === 1 ? 'City' : 'Cities'}</span></div>
        <div className="stat"><b>{d.overview.pax}</b><span>{d.overview.pax === 1 ? 'Guest' : 'Guests'}</span></div>
      </div>

      {/* Intro */}
      {d.intro ? (
        <div className="itin-sec"><div className="intro-card fr">{d.intro}</div></div>
      ) : null}

      {/* Days */}
      {d.days.length > 0 && (
        <div className="itin-sec" style={{ paddingTop: 8 }}>
          <h2 className="fr sec-h">Your Day-by-Day Journey</h2>
          <div className="rule" />
          {d.days.map((day, i) => (
            <div className={`day${i % 2 === 1 ? ' alt' : ''}`} key={i}>
              {day.photoUrl ? <img className="day-photo" src={day.photoUrl} crossOrigin="anonymous" alt="" /> : null}
              <div className="day-body">
                <span className="day-tag">DAY {i + 1}</span>
                <div className="fr day-title">{day.title}</div>
                {day.description ? (
                  <ul className="day-desc">{day.description.split('\n').map((l) => l.trim()).filter(Boolean).map((l, k) => <li key={k}>{l}</li>)}</ul>
                ) : null}
                {day.highlights.length > 0 && (
                  <div className="day-chips">{day.highlights.map((h, j) => <span className="chip" key={j}>{h}</span>)}</div>
                )}
                {day.meals.length > 0 && (
                  <div className="day-meals"><span className="meals-label">Meals</span>{day.meals.map((m, j) => <span className="meal-pill" key={j}>{m}</span>)}</div>
                )}
                {day.hotel ? (
                  <div className="day-accom"><span className="meals-label">Accommodation</span> {day.hotel}</div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Accommodation */}
      {d.hotels.length > 0 && (
        <div className="itin-sec">
          <h2 className="fr sec-h">Accommodation</h2>
          <div className="rule" />
          {d.hotels.map((h, i) => (
            <div className="hotel-card" key={i}>
              <div className="hotel-badge"><b>{h.nights}</b><span>{h.nights > 1 ? 'nights' : 'night'}</span></div>
              <div>
                <div className="hotel-name">{h.destination}</div>
                <div className="hotel-sub">{h.nights} night{h.nights > 1 ? 's' : ''} · double room basis</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Included / excluded */}
      {(d.included.length > 0 || d.excluded.length > 0) && (
        <div className="itin-sec">
          <h2 className="fr sec-h">What's Included</h2>
          <div className="rule" />
          <div className="inc-grid">
            <div className="inc-col">
              <h4>Included</h4>
              {d.included.map((t, i) => <div className="inc-item" key={i}><span className="mark yes">✓</span>{t}</div>)}
            </div>
            <div className="inc-col">
              <h4>Not included</h4>
              {d.excluded.map((t, i) => <div className="inc-item" key={i}><span className="mark no">✕</span>{t}</div>)}
            </div>
          </div>
        </div>
      )}

      {/* Price */}
      {d.price.show && (
        <div className="itin-sec">
          <div className="price-box">
            <div className="price-eyebrow">Package Price</div>
            <div className="fr price-big">${d.price.pp.toLocaleString()}</div>
            <div className="price-unit">per person · sharing double room</div>
            {d.price.sgl > 0 && <div className="price-sgl">Single room supplement: ${d.price.sgl.toLocaleString()} per person</div>}
          </div>
        </div>
      )}

      {/* Pricing table (hotel categories) */}
      {d.pricing.show && d.pricing.rows.length > 0 && (
        <div className="itin-sec">
          <h2 className="fr sec-h">Package Pricing</h2>
          <div className="rule" />
          {d.pricing.refPp > 0 && (
            <div className="price-ref">Based on the quoted rate of <b>${d.pricing.refPp.toLocaleString()}</b> per person in double occupancy{d.pricing.refSgl > 0 ? <> · single supplement <b>${d.pricing.refSgl.toLocaleString()}</b></> : null}.</div>
          )}
          <table className="price-table">
            <thead>
              <tr><th>Category</th><th>Per Person in Double</th><th>Single Occupancy Supplement</th><th>Offered Hotels</th></tr>
            </thead>
            <tbody>
              {d.pricing.rows.map((r, i) => (
                <tr key={i}>
                  <td className="pt-cat">{r.category}</td>
                  <td className="pt-price">{r.dbl > 0 ? `${r.dbl.toLocaleString()} USD` : '—'}</td>
                  <td className="pt-price">{r.single > 0 ? `${r.single.toLocaleString()} USD` : '—'}</td>
                  <td className="pt-hotels">{r.hotels}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Closing: why-us + contact on one navy page */}
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

      {/* Contact */}
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
