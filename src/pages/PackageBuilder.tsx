import { useEffect, useMemo, useRef, useState } from 'react'
import { loadRefData, supabase } from '../lib/supabase'
import { computeTotals, tripDays, effectiveSelections } from '../lib/pricing'
import { getHtml2Pdf, waitForAssets } from '../lib/pdf'
import ItineraryDoc from './ItineraryDoc'
import type { ItineraryData } from './ItineraryDoc'
import type { QuotationDraft, RefData } from '../lib/types'

interface Meals { breakfast: boolean; lunch: boolean; dinner: boolean }
interface EditableDay { uid: string; title: string; description: string; photo: string; sites: string[]; guide: boolean; meals: Meals; hotel: string }
interface FixedDay { on: boolean; title: string; description: string; photo: string; meals: Meals; hotel: string }
interface PriceRow { category: string; dbl: number; single: number; hotels: string }
interface FlightInsert { id: number; label: string; text: string; targetUid: string; position: 'start' | 'end' }

/** Full serializable state of a built package — stored in q_package_docs so packages can be re-opened. */
export interface PackageState {
  title: string; intro: string; hero: string
  meta: { ref: string; pax: number; arrival: string; departure: string }
  overview: { days: number; nights: number; cities: number }
  hotels: { nights: number; destination: string }[]
  days: EditableDay[]
  arrival: FixedDay; departure: FixedDay
  pp: number; sgl: number; showPrice: boolean
  included: string; excluded: string
  priceTableOn: boolean; priceRows: PriceRow[]
  flights: FlightInsert[]
}

const TOUR_MEALS = (): Meals => ({ breakfast: true, lunch: false, dinner: true })
const mealList = (m: Meals): string[] => [m.breakfast && 'Breakfast', m.lunch && 'Lunch', m.dinner && 'Dinner'].filter(Boolean) as string[]

const DEFAULT_PRICE_ROWS = (): PriceRow[] => [
  { category: '3 Star', dbl: 0, single: 0, hotels: '' },
  { category: '4 Star', dbl: 0, single: 0, hotels: '' },
  { category: '4 Star Deluxe', dbl: 0, single: 0, hotels: '' },
  { category: '5 Star', dbl: 0, single: 0, hotels: '' },
]

const DEFAULT_ARRIVAL = (): FixedDay => ({
  on: true, title: 'Arrival — Welcome to Egypt',
  description: 'Arrival at Cairo International Airport.\nMeet & assist by our representative through passport and customs formalities.\nPrivate air-conditioned transfer to your hotel.\nCheck-in, overnight and time to relax after your journey.',
  photo: 'arrivedepart/arrival-plane.jpg', meals: { breakfast: false, lunch: false, dinner: true }, hotel: '',
})
const DEFAULT_DEPARTURE = (): FixedDay => ({
  on: true, title: 'Departure',
  description: 'Breakfast at your hotel (subject to flight timing).\nCheck-out and assistance with your luggage.\nPrivate air-conditioned transfer to the airport.\nFinal meet & assist through departure formalities — we wish you a safe journey home!',
  photo: 'arrivedepart/departure-plane.jpg', meals: { breakfast: true, lunch: false, dinner: false }, hotel: '',
})

/** Best-effort default photo for a standalone site turned into its own day. */
const SITE_PHOTO: Record<string, string> = {
  'pyramids': 'cairo-giza/entrance-pyramids.jpeg', 'khufu pyramid': 'cairo-giza/gem-pyramids.jpeg',
  'grand egyptian museum': 'cairo-giza/gem-pyramids.jpeg', 'egyptian museum': 'cairo-giza/civilization-museum.jpg',
  'egyptian museum (guide)': 'cairo-giza/civilization-museum.jpg', 'civilization museum': 'cairo-giza/civilization-museum.jpg',
  'citadel': 'cairo-giza/citadel-view.jpeg', 'moez street': 'cairo-giza/al-moez.jpeg',
  'sakkara': 'memphis-sakkara-dahshur/sakkara-1.jpeg', 'all sakkara': 'memphis-sakkara-dahshur/sakkara-1.jpeg',
  'memphis': 'memphis-sakkara-dahshur/memphis-1.jpeg', 'karnak': 'luxor-aswan/hypostyle.jpeg',
  'luxor temple': 'luxor-aswan/luxorpath.jpeg', 'valley of kings': 'luxor-aswan/colossi.jpeg',
  'hatshepsut': 'luxor-aswan/colossi.jpeg', 'abu simbel': 'luxor-aswan/abusimbel.jpeg',
  'philae': 'luxor-aswan/aswan-temple.jpeg', 'kom ombo': 'luxor-aswan/kom-ombo.jpeg',
  'edfu': 'luxor-aswan/kom-ombo.jpeg', 'qaitbay': 'alexandria/qaitbay-2.jpeg',
}
const photoForSite = (name: string) => SITE_PHOTO[name.trim().toLowerCase()] ?? ''
const newUid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random())

const CONTACT = { phone: '+20 105 537 6633', email: 'info@egypttoplight.net', website: 'egypttoplight.net', social: '@egypttoplighttravel' }

function MealTicker({ meals, onChange }: { meals: Meals; onChange: (m: Meals) => void }) {
  const items: [keyof Meals, string][] = [['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['dinner', 'Dinner']]
  return (
    <div className="meal-ticker">
      <span className="meal-ticker-label">Meals</span>
      {items.map(([k, label]) => (
        <button type="button" key={k} className={`meal-toggle${meals[k] ? ' on' : ''}`}
          onClick={() => onChange({ ...meals, [k]: !meals[k] })}>{label}</button>
      ))}
    </div>
  )
}

/** Client-facing branded package PDF builder. Opens from a quotation (draft) or a saved package. */
export default function PackageBuilder({ draft, saved, onClose }: { draft?: QuotationDraft; saved?: PackageState; onClose: () => void }) {
  const [ref, setRef] = useState<RefData | null>(null)
  const [title, setTitle] = useState(saved?.title ?? (draft?.name || 'Egypt Travel Package'))
  const [intro, setIntro] = useState(saved?.intro ?? 'We are delighted to present the following tailor-made programme for your journey through Egypt — thoughtfully arranged to blend iconic landmarks with authentic experiences.')
  const [hero, setHero] = useState(saved?.hero ?? 'cairo-giza/gem-pyramids.jpeg')
  const [days, setDays] = useState<EditableDay[]>(saved?.days ?? [])
  const [arrival, setArrival] = useState<FixedDay>(saved?.arrival ?? DEFAULT_ARRIVAL())
  const [departure, setDeparture] = useState<FixedDay>(saved?.departure ?? DEFAULT_DEPARTURE())
  const [pp, setPp] = useState(saved?.pp ?? 0)
  const [sgl, setSgl] = useState(saved?.sgl ?? 0)
  const [showPrice, setShowPrice] = useState(saved?.showPrice ?? true)
  const [priceTableOn, setPriceTableOn] = useState(saved?.priceTableOn ?? false)
  const [priceRows, setPriceRows] = useState<PriceRow[]>(saved?.priceRows ?? DEFAULT_PRICE_ROWS())
  const [included, setIncluded] = useState(saved?.included ?? '')
  const [excluded, setExcluded] = useState(saved?.excluded ?? '')
  const [flights, setFlights] = useState<FlightInsert[]>(saved?.flights ?? [])
  const [manifest, setManifest] = useState<Record<string, string[]>>({})
  const [picker, setPicker] = useState<{ target: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')
  const [error, setError] = useState('')
  const docRef = useRef<HTMLDivElement>(null)

  const hotels = saved?.hotels ?? (draft?.accommodation ?? []).filter((a) => a.nights > 0)
  const totalNights = hotels.reduce((s, h) => s + h.nights, 0)
  const meta = saved?.meta ?? { ref: draft?.groupRef ?? '', pax: draft?.pax ?? 0, arrival: draft?.arrivalDate ?? '', departure: draft?.departureDate ?? '' }

  useEffect(() => {
    loadRefData().then((r) => {
      setRef(r)
      if (saved || !draft) return // saved packages are already initialised from stored state
      const nameOf = (id: number) => r.sites.find((s) => s.id === id)?.name ?? ''
      const dd = draft.days ?? []
      const presetById = new Map(r.dayPresets.map((p) => [p.id, p]))
      const presetDays: EditableDay[] = dd.map((d) => ({
        uid: d.uid, title: d.label, description: presetById.get(d.presetId)?.description ?? d.description, photo: d.photo,
        sites: (d.siteIds ?? []).map(nameOf).filter(Boolean), guide: !!d.includeGuide, meals: TOUR_MEALS(), hotel: '',
      }))
      // Sites picked directly (not via a preset day) each become their own day.
      const covered = new Set<number>()
      for (const d of dd) for (const id of (d.siteIds ?? [])) covered.add(id)
      const manualDays: EditableDay[] = (draft.siteIds ?? [])
        .filter((id) => !covered.has(id))
        .map((id) => {
          const nm = nameOf(id)
          return { uid: newUid(), title: nm, description: nm ? `Visit ${nm} with time to explore its highlights.` : '', photo: photoForSite(nm), sites: nm ? [nm] : [], guide: draft.includeGuide, meals: TOUR_MEALS(), hotel: '' }
        })
      setDays([...presetDays, ...manualDays])
      if (dd[0]?.photo) setHero(dd[0].photo)
      const t = computeTotals(draft, r)
      setPp(Math.round(t.perPersonDBL))
      setSgl(Math.round(t.sglSupplementUSD))

      const guideAnywhere = draft.includeGuide || dd.some((x) => x.includeGuide)
      const hasMeals = Object.values(draft.mealCounts ?? {}).some((q) => q > 0)
      const inc: string[] = []
      if (totalNights > 0) inc.push(`${totalNights} nights hotel accommodation on double room basis`)
      inc.push('Private air-conditioned vehicle for all transfers and excursions')
      if (guideAnywhere) inc.push('Private licensed Egyptologist guide')
      inc.push('Entrance fees to all sites listed in the itinerary')
      inc.push('Meet & assist service on arrival and departure')
      if (hasMeals) inc.push('Meals as specified in the itinerary')
      inc.push('All local taxes and service charges')
      setIncluded(inc.join('\n'))
      setExcluded([
        'International airfare', 'Egypt entry visa', 'Travel insurance',
        'Tipping and gratuities', 'Drinks during meals',
        'Personal expenses and optional excursions', 'Anything not listed under "Included"',
      ].join('\n'))

      const xferRegionIds = new Set(r.regions.filter((rg) => rg.name === 'Domestic Flights' || rg.name === 'Road Transfers').map((rg) => rg.id))
      if (xferRegionIds.size) {
        const eff = effectiveSelections(draft)
        setFlights(r.transfers
          .filter((t) => xferRegionIds.has(t.region_id) && (eff.transferCounts[t.id] ?? 0) > 0)
          .map((t) => {
            const isCar = /^Car/.test(t.name)
            const route = t.name.replace(/^(?:Flight|Car)\s*[—-]\s*/, '')
            const text = isCar
              ? `Private air-conditioned road transfer from ${route}.`
              : `Domestic flight from ${route}, followed by a private transfer to your hotel.`
            return { id: t.id, label: `${route} (${isCar ? 'car' : 'flight'})`, text, targetUid: '', position: 'end' as const }
          }))
      }
    }).catch((e) => setError(e.message ?? String(e)))
    fetch('/images/tours/manifest.json').then((r) => r.json()).then(setManifest).catch(() => {})
  }, [])

  function move(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= days.length) return
    const copy = days.slice(); const tmp = copy[i]; copy[i] = copy[j]; copy[j] = tmp
    setDays(copy)
  }
  const updateDay = (uid: string, patch: Partial<EditableDay>) =>
    setDays((ds) => ds.map((d) => (d.uid === uid ? { ...d, ...patch } : d)))
  const removeDay = (uid: string) => setDays((ds) => ds.filter((d) => d.uid !== uid))
  const updateRow = (i: number, patch: Partial<PriceRow>) => setPriceRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const setFlightTarget = (id: number, targetUid: string, position: 'start' | 'end') => setFlights((fs) => fs.map((f) => (f.id === id ? { ...f, targetUid, position } : f)))

  function pickPhoto(photo: string) {
    if (!picker) return
    if (picker.target === 'hero') setHero(photo)
    else if (picker.target === 'arrival') setArrival((a) => ({ ...a, photo }))
    else if (picker.target === 'departure') setDeparture((a) => ({ ...a, photo }))
    else updateDay(picker.target, { photo })
    setPicker(null)
  }

  const data: ItineraryData = useMemo(() => {
    let overview: { days: number; nights: number; cities: number; pax: number }
    if (saved) {
      overview = { ...saved.overview, pax: meta.pax }
    } else {
      const diff = draft ? tripDays(draft) : 0
      const oNights = diff > 0 ? diff : totalNights
      const oDays = diff > 0 ? diff + 1 : (totalNights > 0 ? totalNights + 1 : days.length)
      const REGION_CITY: Record<string, string> = {
        'Pyramids': 'Cairo', 'Sakkara': 'Cairo', 'Cairo/Giza': 'Cairo', 'More Sites': 'Cairo',
        'Alexandria/Behera': 'Alexandria', 'Luxor': 'Luxor', 'Aswan': 'Aswan',
        'Sharm el Sheikh': 'Sharm El Sheikh', 'Kafr el Sheikh/Sharkia/Minya/Sohag/Qena': 'Nile Valley',
      }
      const citySet = new Set<string>()
      if (ref && draft) {
        for (const id of effectiveSelections(draft).siteIds) {
          const st = ref.sites.find((x) => x.id === id); if (!st) continue
          const reg = ref.regions.find((r) => r.id === st.region_id)?.name
          if (reg) citySet.add(REGION_CITY[reg] ?? reg)
        }
      }
      for (const h of hotels) citySet.add(REGION_CITY[h.destination] ?? h.destination)
      overview = { days: oDays, nights: oNights, cities: citySet.size || 1, pax: meta.pax }
    }

    const seq: { uid: string; title: string; description: string; photoUrl: string; highlights: string[]; meals: string[]; hotel: string }[] = [
      ...(arrival.on ? [{ uid: '__arrival', title: arrival.title, description: arrival.description, photoUrl: arrival.photo ? '/images/tours/' + arrival.photo : '', highlights: ['Meet & assist', 'Hotel check-in', 'Overnight'], meals: mealList(arrival.meals), hotel: arrival.hotel }] : []),
      ...days.map((d) => ({
        uid: d.uid, title: d.title, description: d.description,
        photoUrl: d.photo ? '/images/tours/' + d.photo : '',
        highlights: [...d.sites, ...(d.guide ? ['Private guide'] : [])],
        meals: mealList(d.meals),
        hotel: d.hotel,
      })),
      ...(departure.on ? [{ uid: '__departure', title: departure.title, description: departure.description, photoUrl: departure.photo ? '/images/tours/' + departure.photo : '', highlights: ['Hotel check-out', 'Airport transfer'], meals: mealList(departure.meals), hotel: departure.hotel }] : []),
    ]
    for (const f of flights) {
      if (!f.targetUid) continue
      const it = seq.find((x) => x.uid === f.targetUid)
      if (!it) continue
      it.description = f.position === 'start'
        ? (f.text + (it.description ? '\n' + it.description : ''))
        : ((it.description ? it.description + '\n' : '') + f.text)
    }
    const seqDays = seq.map(({ uid: _uid, ...rest }) => rest)

    return {
      title, intro,
      heroUrl: '/images/tours/' + hero,
      logoUrl: '/images/logo.png',
      meta,
      overview,
      days: seqDays,
      hotels,
      included: included.split('\n').map((s) => s.trim()).filter(Boolean),
      excluded: excluded.split('\n').map((s) => s.trim()).filter(Boolean),
      price: { pp, sgl, show: showPrice },
      pricing: { show: priceTableOn, refPp: pp, refSgl: sgl, rows: priceRows },
      contact: CONTACT,
    }
  }, [title, intro, hero, days, arrival, departure, pp, sgl, showPrice, priceTableOn, priceRows, included, excluded, draft, saved, hotels, totalNights, ref, meta, flights])

  function buildState(): PackageState {
    return {
      title, intro, hero, meta,
      overview: { days: data.overview.days, nights: data.overview.nights, cities: data.overview.cities },
      hotels, days, arrival, departure,
      pp, sgl, showPrice, included, excluded, priceTableOn, priceRows, flights,
    }
  }

  async function savePackage() {
    try {
      const st = buildState()
      const { data: u } = await supabase.auth.getUser()
      const { error: e } = await supabase.from('q_package_docs').insert({
        name: st.title, group_ref: st.meta.ref, pax: st.meta.pax,
        arrival_date: st.meta.arrival || null, departure_date: st.meta.departure || null,
        data: st, created_by: u.user?.id,
      })
      if (!e) { setSavedMsg('Saved to Packages'); setTimeout(() => setSavedMsg(''), 2500) }
    } catch { /* don't block export on save errors */ }
  }

  async function exportPdf() {
    setBusy(true); setError('')
    try {
      const html2pdf = await getHtml2Pdf()
      const node = docRef.current
      if (!node) throw new Error('Document not ready')
      await waitForAssets(node)
      const safe = (title || 'package').replace(/[^\w\-]+/g, '_')
      await html2pdf().set({
        margin: 0,
        filename: safe + '.pdf',
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#fffefa', logging: false },
        jsPDF: { unit: 'px', format: [794, 1123], orientation: 'portrait', hotfixes: ['px_scaling'] },
        // Added .accommodation-section to prevent the heading from separating from the cards
        pagebreak: { mode: ['css'], avoid: ['.day', '.hotel-card', '.b-inc', '.included-section', '.pricing-table', 'table', '.accommodation-section'] },
      }).from(node).save()
      await savePackage()
    } catch (e: any) {
      setError(e.message ?? String(e))
    }
    setBusy(false)
  }

  function FixedDayEditor({ label, day, set, target }: { label: string; day: FixedDay; set: (d: FixedDay) => void; target: string }) {
    return (
      <section className={`b-day b-fixed${day.on ? '' : ' off'}`}>
        <div className="b-day-head">
          <label className="check pill-check"><input type="checkbox" checked={day.on} onChange={(e) => set({ ...day, on: e.target.checked })} /> {label}</label>
          <input value={day.title} disabled={!day.on} onChange={(e) => set({ ...day, title: e.target.value })} />
        </div>
        {day.on && (
          <div className="b-day-body">
            <div className="b-photo">
              {day.photo ? <img src={`/images/tours/${day.photo}`} alt="" /> : <div className="b-nophoto">No photo</div>}
              <button className="link" onClick={() => setPicker({ target })}>Change photo</button>
            </div>
            <div className="b-day-text">
              <textarea rows={3} value={day.description} onChange={(e) => set({ ...day, description: e.target.value })} />
              <MealTicker meals={day.meals} onChange={(m) => set({ ...day, meals: m })} />
              <input className="b-hotel" placeholder="Accommodation (hotel / cruise)" value={day.hotel} onChange={(e) => set({ ...day, hotel: e.target.value })} />
            </div>
          </div>
        )}
      </section>
    )
  }

  const daySlots = [
    ...(arrival.on ? [{ uid: '__arrival', title: arrival.title }] : []),
    ...days.map((d) => ({ uid: d.uid, title: d.title })),
    ...(departure.on ? [{ uid: '__departure', title: departure.title }] : []),
  ]

  if (!ref) return (
    <div className="builder-overlay"><div className="card">{error ? `Error: ${error}` : 'Loading…'} <button onClick={onClose}>Close</button></div></div>
  )

  return (
    <div className="builder-overlay">
      <div className="builder">
        <div className="builder-bar">
          <h3>Package PDF builder</h3>
          <span className="spacer" />
          {savedMsg && <span className="small" style={{ color: '#bfe6c0' }}>{savedMsg}</span>}
          <button onClick={savePackage}>Save</button>
          <button onClick={onClose}>Close</button>
          <button className="primary" disabled={busy} onClick={exportPdf}>{busy ? 'Building…' : 'Export PDF'}</button>
        </div>
        {error && <div className="error">{error}</div>}
        <div className="builder-body">
          <section className="b-cover">
            <img className="b-hero" src={`/images/tours/${hero}`} alt="" />
            <button className="link" onClick={() => setPicker({ target: 'hero' })}>Change cover photo</button>
            <input className="b-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <div className="muted small">{meta.ref ? `Ref ${meta.ref} · ` : ''}{meta.pax} pax · {meta.arrival} → {meta.departure}</div>
            <textarea rows={2} value={intro} onChange={(e) => setIntro(e.target.value)} />
          </section>

          <FixedDayEditor label="Arrival day" day={arrival} set={setArrival} target="arrival" />

          {days.map((d, i) => (
            <section key={d.uid} className="b-day">
              <div className="b-day-head">
                <b>Day {i + (arrival.on ? 2 : 1)}</b>
                <button disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button disabled={i === days.length - 1} onClick={() => move(i, 1)}>↓</button>
                <input value={d.title} onChange={(e) => updateDay(d.uid, { title: e.target.value })} />
                <button className="link danger" onClick={() => removeDay(d.uid)}>Remove</button>
              </div>
              <div className="b-day-body">
                <div className="b-photo">
                  {d.photo ? <img src={`/images/tours/${d.photo}`} alt="" /> : <div className="b-nophoto">No photo</div>}
                  <button className="link" onClick={() => setPicker({ target: d.uid })}>Change photo</button>
                </div>
                <div className="b-day-text">
                  <textarea rows={3} value={d.description} onChange={(e) => updateDay(d.uid, { description: e.target.value })} />
                  {d.sites.length > 0 && <div className="muted small">Highlights: {d.sites.join(', ')}</div>}
                  <MealTicker meals={d.meals} onChange={(m) => updateDay(d.uid, { meals: m })} />
                  <input className="b-hotel" placeholder="Accommodation (hotel / cruise)" value={d.hotel} onChange={(e) => updateDay(d.uid, { hotel: e.target.value })} />
                </div>
              </div>
            </section>
          ))}
          {days.length === 0 && <p className="muted">No day-by-day items yet. Add tour-day presets or select sites in the quotation and they'll appear here as days.</p>}

          {flights.length > 0 && (
            <section className="b-sec">
              <h4>Inter-city transfers</h4>
              <p className="muted small">Slot each inter-city flight or road transfer into a day — it appears as a bullet at the start or end of that day.</p>
              {flights.map((f) => (
                <div key={f.id} className="flight-row">
                  <b>{f.label}</b>
                  <select value={f.targetUid ? `${f.targetUid}|${f.position}` : ''} onChange={(e) => {
                    const v = e.target.value
                    if (!v) setFlightTarget(f.id, '', 'end')
                    else { const [uid, pos] = v.split('|'); setFlightTarget(f.id, uid, pos as 'start' | 'end') }
                  }}>
                    <option value="">— not shown —</option>
                    {daySlots.flatMap((slot, si) => [
                      <option key={slot.uid + '|start'} value={`${slot.uid}|start`}>Start of Day {si + 1} — {slot.title}</option>,
                      <option key={slot.uid + '|end'} value={`${slot.uid}|end`}>End of Day {si + 1} — {slot.title}</option>,
                    ])}
                  </select>
                </div>
              ))}
            </section>
          )}

          <FixedDayEditor label="Departure day" day={departure} set={setDeparture} target="departure" />

          <section className="b-sec b-inc" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', width: '100%' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <h4 style={{ margin: '0 0 0.5rem 0' }}>Included <span className="muted small">(one per line)</span></h4>
              <textarea 
                style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', padding: '0.5rem', fontFamily: 'inherit' }} 
                rows={8} 
                value={included} 
                onChange={(e) => setIncluded(e.target.value)} 
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <h4 style={{ margin: '0 0 0.5rem 0' }}>Not included <span className="muted small">(one per line)</span></h4>
              <textarea 
                style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', padding: '0.5rem', fontFamily: 'inherit' }} 
                rows={8} 
                value={excluded} 
                onChange={(e) => setExcluded(e.target.value)} 
              />
            </div>
          </section>

          {hotels.length > 0 && (
            <section className="b-sec">
              <h4>Accommodation</h4>
              <ul>{hotels.map((h, i) => <li key={i}>{h.nights} night{h.nights > 1 ? 's' : ''} — {h.destination}</li>)}</ul>
            </section>
          )}

          <section className="b-sec">
            <label className="check"><input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} /> Show package price</label>
            {showPrice && <div className="b-price">
              <label>Per person (DBL) $<input type="number" value={pp} onChange={(e) => setPp(+e.target.value)} /></label>
              <label>Single supplement $<input type="number" value={sgl} onChange={(e) => setSgl(+e.target.value)} /></label>
            </div>}
          </section>

          <section className="b-sec">
            <label className="check"><input type="checkbox" checked={priceTableOn} onChange={(e) => setPriceTableOn(e.target.checked)} /> Add pricing table (hotel categories)</label>
            {priceTableOn && (
              <div className="b-ptable">
                <div className="muted small">Quote reference: ${pp.toLocaleString()} per person (double){sgl > 0 ? ` · $${sgl.toLocaleString()} single supplement` : ''}</div>
                <div className="table-scroll">
                  <table className="grid-table wide">
                    <thead><tr><th>Category</th><th>Per person (DBL) USD</th><th>Single supp. USD</th><th>Offered hotels</th><th /></tr></thead>
                    <tbody>
                      {priceRows.map((r, i) => (
                        <tr key={i}>
                          <td><input value={r.category} onChange={(e) => updateRow(i, { category: e.target.value })} /></td>
                          <td><input type="number" min={0} value={r.dbl} onChange={(e) => updateRow(i, { dbl: +e.target.value })} /></td>
                          <td><input type="number" min={0} value={r.single} onChange={(e) => updateRow(i, { single: +e.target.value })} /></td>
                          <td><input value={r.hotels} onChange={(e) => updateRow(i, { hotels: e.target.value })} placeholder="e.g. Falcon Hills or equal" /></td>
                          <td>{priceRows.length > 1 && <button className="link danger" onClick={() => setPriceRows((rs) => rs.filter((_, j) => j !== i))}>×</button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button onClick={() => setPriceRows((rs) => [...rs, { category: '', dbl: 0, single: 0, hotels: '' }])}>+ Add row</button>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Off-screen branded document captured for the PDF */}
      <div style={{ position: 'absolute', left: -99999, top: 0 }}>
        <ItineraryDoc ref={docRef} data={data} />
      </div>

      {picker && (
        <div className="picker-overlay" onClick={() => setPicker(null)}>
          <div className="picker" onClick={(e) => e.stopPropagation()}>
            <div className="picker-head"><b>Choose a photo</b><button onClick={() => setPicker(null)}>×</button></div>
            <div className="picker-grid">
              {Object.entries(manifest).map(([area, files]) => (
                <div key={area} className="picker-area">
                  <h5>{area}</h5>
                  <div className="picker-thumbs">
                    {files.map((f) => (
                      <img key={f} src={`/images/tours/${area}/${f}`} alt="" onClick={() => pickPhoto(`${area}/${f}`)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
