import { forwardRef, useEffect, useRef } from 'react'

export interface ItineraryData {
  title: string
  intro: string
  heroUrl: string
  logoUrl: string
  meta: { ref: string; pax: number; arrival: string; departure: string }
  overview: { days: number; nights: number; cities: number; pax: number }
  days: { title: string; description: string; photoUrl: string; highlights: string[]; meals: string[]; hotel: string; dayLabel?: string }[]
  hotels: { nights: number; destination: string }[]
  included: string[]
  excluded: string[]
  price: { pp: number; sgl: number; show: boolean }
  pricing: { show: boolean; refPp: number; refSgl: number; rows: { category: string; dbl: number; single: number; triple: number; quad: number; hotels: string }[]; columns?: 'all' | 'dbl' | 'single' | 'triple' | 'quad' }
  contact: { phone: string; email: string; website: string; social: string }
  roomBasis?: string // <-- Added here
}

const CSS = `
.itin { width: 794px; background: #fffefa; color: #0e2a47; font-family: 'Inter', system-ui, sans-serif; font-size: 14px; line-height: 1.5; }

/* iOS inflates text in blocks wider than the viewport, which this page always is when
   the builder is open on a phone — it would reflow every page of the PDF. */
.itin, .itin * { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }

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
/* Single measurable child of .df-body. autoFitDays() sizes the day's type against this
   box so a long description can never be clipped by the fixed 1123px page. */
.df-fit { flex: 0 0 auto; display: flex; flex-direction: column; min-height: 0; }
.df-noimg { position: relative; flex-shrink: 0; height: 300px; background: linear-gradient(135deg,#0e2a47,#163d6b); padding: 40px 64px 0; overflow: hidden; }
.df-noimg-top { display: flex; align-items: center; justify-content: space-between; }
.df-noimg-logo { background: #ffffff; border-radius: 999px; padding: 10px 22px; display: inline-flex; box-shadow: 0 6px 20px rgba(0,0,0,0.25); }
.df-noimg-logo img { height: 32px; display: block; }
.df-noimg-num { font-size: 64px; font-weight: 600; line-height: 1; color: rgba(255,255,255,0.18); }
.df-noimg-eyebrow { color: #f0c53a; font-weight: 600; font-size: 12px; letter-spacing: 3px; text-transform: uppercase; margin-top: 30px; }
.df-noimg-divider { width: 66px; height: 3px; background: linear-gradient(135deg,#c8960a,#e8b015); border-radius: 3px; margin: 14px 0 16px; }
.df-noimg-title { font-size: 38px; font-weight: 600; line-height: 1.08; color: #fff; margin: 0; text-shadow: 0 2px 12px rgba(0,0,0,0.3); }
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
.pt-hl + .pt-hl { margin-top: 4px; }

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

/* ---------------------------------------------------------------------------
   AUTO-FIT FOR DAY PAGES
   Every page block is a fixed 1123px with overflow:hidden (the exporter slices
   the canvas 1:1, so the height cannot flex). A day whose description is longer
   than the body box used to be silently CLIPPED mid-sentence. This measures each
   day page in the live DOM and shrinks, in order of preference:
     1. the photo band (632 -> 400px), which buys up to 232px of body at full type
        size; the overlaid day number and title scale with it so the caption can
        never be clipped by the shorter band
     2. the type scale (15px -> 11.4px floor), applied to the bullets, the body
        padding and the footer rule spacing
   The first combination that fits is used, so pages that already fit are left
   untouched. All values are written as inline px — html2canvas reads computed
   styles from its clone, and px needs no var()/calc() resolution to survive.
   --------------------------------------------------------------------------- */
const FIT_PHOTO_H = [632, 580, 530, 480, 440, 400]
const FIT_SCALES = [1, 0.97, 0.94, 0.91, 0.88, 0.85, 0.82, 0.79, 0.76]

const fitDayPage = (page: HTMLElement): void => {
  const body = page.querySelector('.df-body') as HTMLElement | null
  const box = page.querySelector('.df-fit') as HTMLElement | null
  if (!body || !box) return
  const photo = page.querySelector('.df-photo') as HTMLElement | null
  const list = page.querySelector('.df-desc') as HTMLElement | null
  const foot = page.querySelector('.d-foot') as HTMLElement | null
  const items = list ? Array.prototype.slice.call(list.querySelectorAll('li')) as HTMLElement[] : []

  const cap = page.querySelector('.df-cap') as HTMLElement | null
  const title = page.querySelector('.df-title') as HTMLElement | null
  const num = page.querySelector('.df-num') as HTMLElement | null

  const apply = (photoH: number, k: number): void => {
    if (photo) photo.style.height = photoH + 'px'
    if (photo) {
      // The caption is absolutely positioned inside the band, so a shorter band has
      // to carry a smaller heading or the title would run up under the day number.
      const pk = Math.min(1, photoH / 632)
      const capBottom = Math.max(26, Math.round(46 * pk))
      if (num) num.style.fontSize = Math.max(96, Math.round(150 * pk)) + 'px'
      if (cap) cap.style.bottom = capBottom + 'px'
      if (title && cap) {
        // Leave the top ~26% of the band clear for the ghost number, then step the
        // title down until the whole caption clears it.
        const room = photoH - Math.round(photoH * 0.26) - capBottom
        for (let t = Math.round(46 * pk); t >= 24; t -= 2) {
          title.style.fontSize = t + 'px'
          if (cap.offsetHeight <= room) break
        }
      }
    }
    body.style.paddingTop = (44 * k).toFixed(1) + 'px'
    body.style.paddingBottom = (48 * k).toFixed(1) + 'px'
    if (list) list.style.fontSize = (15 * k).toFixed(2) + 'px'
    for (let i = 0; i < items.length; i++) {
      items[i].style.fontSize = (15 * k).toFixed(2) + 'px'
      items[i].style.marginBottom = (11 * k).toFixed(2) + 'px'
      items[i].style.paddingLeft = Math.max(13, Math.round(20 * k)) + 'px'
    }
    if (foot) {
      foot.style.marginTop = Math.round(26 * k) + 'px'
      foot.style.paddingTop = Math.round(18 * k) + 'px'
    }
  }

  // Available content height of .df-body, read back after each apply() because
  // the body is flex:1 and grows by exactly what the photo gives up.
  const fits = (): boolean => {
    const cs = getComputedStyle(body)
    const avail = body.clientHeight - parseFloat(cs.paddingTop || '0') - parseFloat(cs.paddingBottom || '0')
    return box.offsetHeight <= avail
  }

  for (let si = 0; si < FIT_SCALES.length; si++) {
    for (let pi = 0; pi < FIT_PHOTO_H.length; pi++) {
      apply(FIT_PHOTO_H[pi], FIT_SCALES[si])
      if (fits()) return
    }
  }
  // Floor reached: the tightest combination stays applied. Nothing is lost that
  // was not already lost before, and in practice no realistic day reaches here.
}

const autoFitDays = (root: HTMLElement | null): void => {
  if (!root) return
  const pages = root.querySelectorAll('.day-full')
  for (let i = 0; i < pages.length; i++) fitDayPage(pages[i] as HTMLElement)
}

const bulletsOf = (s: string): string[] => (s ? s.split('\n').map((l) => l.trim()).filter(Boolean) : [])

const ItineraryDoc = forwardRef<HTMLDivElement, { data: ItineraryData }>(({ data }, ref) => {
  const d = data
  const rootRef = useRef<HTMLDivElement | null>(null)
  // Keep our own handle on the root as well as honouring the forwarded ref, so the
  // fit pass can find the day pages without reaching into the whole document.
  const setRoot = (node: HTMLDivElement | null): void => {
    rootRef.current = node
    if (typeof ref === 'function') ref(node)
    else if (ref) (ref as { current: HTMLDivElement | null }).current = node
  }
  useEffect(() => {
    if (typeof document === 'undefined') return
    let el = document.getElementById('itin-doc-css') as HTMLStyleElement | null
    if (!el) { el = document.createElement('style'); el.id = 'itin-doc-css'; document.head.appendChild(el) }
    el.textContent = CSS
  }, [])

  // Re-fit after every content change, and again once the webfonts land — Fraunces
  // and Inter change the wrapped line count, so a pass against the fallback font
  // would leave the wrong scale applied.
  useEffect(() => {
    if (typeof document === 'undefined') return
    autoFitDays(rootRef.current)
    let alive = true
    const again = () => { if (alive) autoFitDays(rootRef.current) }
    const t = window.setTimeout(again, 0)
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
    if (fonts && fonts.ready) fonts.ready.then(again).catch(() => {})
    return () => { alive = false; window.clearTimeout(t) }
  }, [data])

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
    const label = day.dayLabel || `Day ${i + 1}`
    return (
      <div className="day-full a" key={i}>
        {day.photoUrl ? (
          <div className="df-photo">
            <div className="df-img" style={{ backgroundImage: `url("${day.photoUrl}")` }} />
            <div className="df-grad" />
            <div className="df-num fr">{num}</div>
            <div className="df-cap">
              <div className="df-eyebrow">{label}</div>
              <h2 className="df-title fr">{day.title}</h2>
            </div>
          </div>
        ) : (
          <div className="df-noimg">
            <div className="df-noimg-top">
              <div className="df-noimg-logo"><img src={d.logoUrl} crossOrigin="anonymous" alt="Egypt Top Light" /></div>
              <div className="df-noimg-num fr">{num}</div>
            </div>
            <div className="df-noimg-eyebrow">{label}</div>
            <div className="df-noimg-divider" />
            <h2 className="df-noimg-title fr">{day.title}</h2>
          </div>
        )}
        <div className="df-body">
          <div className="df-fit">
            {bl.length > 0 ? <ul className="df-desc">{bl.map((l, k) => <li key={k}>{l}</li>)}</ul> : null}
            {details(day)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="itin" ref={setRoot}>
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

      {/* Accommodation + price */}
      {(d.hotels.length > 0 || d.price.show) && (
        <div className="summary-page">
          {d.hotels.length > 0 && (
            <div className="sum-block">
              <div className="sec-eyebrow">Where You Stay</div>
              <h2 className="fr sec-title">Accommodation</h2>
              <div className="sec-rule" />
              {d.hotels.map((h, i) => (
                <div className="hotel-card" key={i}>
                  <div className="hotel-badge"><b>{h.nights}</b><span>{h.nights > 1 ? 'nights' : 'night'}</span></div>
                  <div>
                    <div className="hotel-name fr">{h.destination}</div>
                    {/* Updated this line to use the dynamic room basis state */}
                    <div className="hotel-sub">{h.nights} night{h.nights > 1 ? 's' : ''} · {d.roomBasis || 'double'} room basis</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {d.price.show && (
            <div className="price-box">
              <div className="price-eyebrow">Package Price</div>
              <div className="fr price-big">${d.price.pp.toLocaleString()}</div>
              {/* Also updated this to match the basis for consistency */}
              <div className="price-unit">per person · sharing {d.roomBasis || 'double'} room</div>
              {d.price.sgl > 0 && <div className="price-sgl">Single room supplement: ${d.price.sgl.toLocaleString()} per person</div>}
            </div>
          )}
        </div>
      )}

      {/* Inclusions — own fixed page so long lists never clip the price box */}
      {(d.included.length > 0 || d.excluded.length > 0) && (
        <div className="summary-page">
          <div className="sum-block">
            <div className="sec-eyebrow">The Details</div>
            <h2 className="fr sec-title">What's Included</h2>
            <div className="sec-rule" />
            <div className="inc-grid">
              <div className="inc-col"><h4>Included</h4>{d.included.map((t, i) => <div className="inc-item" key={i}><span className="mark yes">✓</span>{t}</div>)}</div>
              <div className="inc-col"><h4>Not included</h4>{d.excluded.map((t, i) => <div className="inc-item" key={i}><span className="mark no">✕</span>{t}</div>)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Pricing table */}
      {d.pricing.show && d.pricing.rows.length > 0 && (() => {
        type PriceColKey = 'dbl' | 'single' | 'triple' | 'quad'
        const PRICE_COLS: { key: PriceColKey; label: string }[] = [
          { key: 'dbl', label: 'Per Person in Double' },
          /* On a solo quote the figure in this column is the whole price, not a top-up.
             Labelling it 'Supplement' there reads as money owed on top of a per-person
             rate that isn't shown. Only single-basis documents are affected. */
          { key: 'single', label: d.roomBasis === 'single' ? 'Single Occupancy' : 'Single Supplement' },
          { key: 'triple', label: 'Per Person in Triple' },
          { key: 'quad', label: 'Per Person in Quadruple' },
        ]
        const val = (r: (typeof d.pricing.rows)[number], key: PriceColKey) => r[key] || 0
        const mode = d.pricing.columns || 'all'
        const hasAny = (key: PriceColKey) => d.pricing.rows.some((r) => val(r, key) > 0)
        const cols = mode === 'all'
          ? PRICE_COLS.filter((c) => c.key === 'dbl' || c.key === 'single' || hasAny(c.key))
          : PRICE_COLS.filter((c) => c.key === mode)
        return (
          <div className="summary-page">
            <div className="sec-eyebrow">Pricing</div>
            <h2 className="fr sec-title">Package Pricing</h2>
            <div className="sec-rule" />
            <table className="price-table">
              <thead><tr><th>Category</th>{cols.map((c) => <th key={c.key}>{c.label}</th>)}<th>Offered Hotels</th></tr></thead>
              <tbody>
                {d.pricing.rows.map((r, i) => (
                  <tr key={i}>
                    <td className="pt-cat">{r.category}</td>
                    {cols.map((c) => <td className="pt-price" key={c.key}>{val(r, c.key) > 0 ? `${val(r, c.key).toLocaleString()} USD` : '—'}</td>)}
                    <td className="pt-hotels">{r.hotels.split('\n').map((l) => l.trim()).filter(Boolean).map((l, k) => <div className="pt-hl" key={k}>{l}</div>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })()}

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