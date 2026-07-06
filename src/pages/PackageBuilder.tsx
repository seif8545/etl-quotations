import { useEffect, useMemo, useRef, useState } from 'react'
import { loadRefData } from '../lib/supabase'
import { computeTotals, tripDays, effectiveSelections } from '../lib/pricing'
import { getHtml2Pdf, waitForAssets } from '../lib/pdf'
import ItineraryDoc from './ItineraryDoc'
import type { ItineraryData } from './ItineraryDoc'
import type { QuotationDraft, RefData } from '../lib/types'

interface EditableDay { uid: string; title: string; description: string; photo: string; sites: string[]; guide: boolean }
interface FixedDay { on: boolean; title: string; description: string; photo: string }

const CONTACT = { phone: '+20 105 537 6633', email: 'info@egypttoplight.net', website: 'egypttoplight.net', social: '@egypttoplighttravel' }

/** Client-facing branded package PDF builder (edit → one-click export). */
export default function PackageBuilder({ draft, onClose }: { draft: QuotationDraft; onClose: () => void }) {
  const [ref, setRef] = useState<RefData | null>(null)
  const [title, setTitle] = useState(draft.name || 'Egypt Travel Package')
  const [intro, setIntro] = useState('We are delighted to present the following tailor-made programme for your journey through Egypt — thoughtfully arranged to blend iconic landmarks with authentic experiences.')
  const [hero, setHero] = useState('cairo-giza/gem-pyramids.jpeg')
  const [days, setDays] = useState<EditableDay[]>([])
  const [arrival, setArrival] = useState<FixedDay>({
    on: true, title: 'Arrival — Welcome to Egypt',
    description: 'On arrival, our representative will meet and assist you through the airport formalities before a private transfer to your hotel for check-in and overnight.',
    photo: 'cairo-giza/citadel-view.jpeg',
  })
  const [departure, setDeparture] = useState<FixedDay>({
    on: true, title: 'Departure',
    description: 'After breakfast, check out of your hotel and enjoy a private transfer to the airport for your onward flight. We wish you a safe journey home.',
    photo: 'luxor-aswan/nile.jpeg',
  })
  const [pp, setPp] = useState(0)
  const [sgl, setSgl] = useState(0)
  const [showPrice, setShowPrice] = useState(true)
  const [included, setIncluded] = useState('')
  const [excluded, setExcluded] = useState('')
  const [manifest, setManifest] = useState<Record<string, string[]>>({})
  const [picker, setPicker] = useState<{ target: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const docRef = useRef<HTMLDivElement>(null)

  const hotels = (draft.accommodation ?? []).filter((a) => a.nights > 0)
  const totalNights = hotels.reduce((s, h) => s + h.nights, 0)

  useEffect(() => {
    loadRefData().then((r) => {
      setRef(r)
      const nameOf = (id: number) => r.sites.find((s) => s.id === id)?.name ?? ''
      const dd = draft.days ?? []
      setDays(dd.map((d) => ({
        uid: d.uid, title: d.label, description: d.description, photo: d.photo,
        sites: (d.siteIds ?? []).map(nameOf).filter(Boolean), guide: !!d.includeGuide,
      })))
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

  function pickPhoto(photo: string) {
    if (!picker) return
    if (picker.target === 'hero') setHero(photo)
    else if (picker.target === 'arrival') setArrival((a) => ({ ...a, photo }))
    else if (picker.target === 'departure') setDeparture((a) => ({ ...a, photo }))
    else updateDay(picker.target, { photo })
    setPicker(null)
  }

  const data: ItineraryData = useMemo(() => {
    const diff = tripDays(draft)
    const oNights = diff > 0 ? diff : totalNights
    const oDays = diff > 0 ? diff + 1 : (totalNights > 0 ? totalNights + 1 : days.length)
    const REGION_CITY: Record<string, string> = {
      'Pyramids': 'Cairo', 'Sakkara': 'Cairo', 'Cairo/Giza': 'Cairo', 'More Sites': 'Cairo',
      'Alexandria/Behera': 'Alexandria', 'Luxor': 'Luxor', 'Aswan': 'Aswan',
      'Sharm el Sheikh': 'Sharm El Sheikh', 'Kafr el Sheikh/Sharkia/Minya/Sohag/Qena': 'Nile Valley',
    }
    const citySet = new Set<string>()
    if (ref) {
      for (const id of effectiveSelections(draft).siteIds) {
        const st = ref.sites.find((x) => x.id === id); if (!st) continue
        const reg = ref.regions.find((r) => r.id === st.region_id)?.name
        if (reg) citySet.add(REGION_CITY[reg] ?? reg)
      }
    }
    for (const h of hotels) citySet.add(REGION_CITY[h.destination] ?? h.destination)

    const seqDays = [
      ...(arrival.on ? [{ title: arrival.title, description: arrival.description, photoUrl: arrival.photo ? '/images/tours/' + arrival.photo : '', highlights: ['Meet & assist', 'Hotel check-in', 'Overnight'] }] : []),
      ...days.map((d) => ({
        title: d.title, description: d.description,
        photoUrl: d.photo ? '/images/tours/' + d.photo : '',
        highlights: [...d.sites, ...(d.guide ? ['Private guide'] : [])],
      })),
      ...(departure.on ? [{ title: departure.title, description: departure.description, photoUrl: departure.photo ? '/images/tours/' + departure.photo : '', highlights: ['Hotel check-out', 'Airport transfer'] }] : []),
    ]

    return {
      title, intro,
      heroUrl: '/images/tours/' + hero,
      logoUrl: '/images/logo.png',
      meta: { ref: draft.groupRef, pax: draft.pax, arrival: draft.arrivalDate, departure: draft.departureDate },
      overview: { days: oDays, nights: oNights, cities: citySet.size || 1, pax: draft.pax },
      days: seqDays,
      hotels,
      included: included.split('\n').map((s) => s.trim()).filter(Boolean),
      excluded: excluded.split('\n').map((s) => s.trim()).filter(Boolean),
      price: { pp, sgl, show: showPrice },
      contact: CONTACT,
    }
  }, [title, intro, hero, days, arrival, departure, pp, sgl, showPrice, included, excluded, draft, hotels, totalNights, ref])

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
        pagebreak: { mode: ['css', 'legacy'] },
      }).from(node).save()
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
            </div>
          </div>
        )}
      </section>
    )
  }

  if (!ref) return (
    <div className="builder-overlay"><div className="card">{error ? `Error: ${error}` : 'Loading…'} <button onClick={onClose}>Close</button></div></div>
  )

  return (
    <div className="builder-overlay">
      <div className="builder">
        <div className="builder-bar">
          <h3>Package PDF builder</h3>
          <span className="spacer" />
          <button onClick={onClose}>Close</button>
          <button className="primary" disabled={busy} onClick={exportPdf}>{busy ? 'Building…' : 'Export PDF'}</button>
        </div>
        {error && <div className="error">{error}</div>}
        <div className="builder-body">
          <section className="b-cover">
            <img className="b-hero" src={`/images/tours/${hero}`} alt="" />
            <button className="link" onClick={() => setPicker({ target: 'hero' })}>Change cover photo</button>
            <input className="b-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <div className="muted small">{draft.groupRef ? `Ref ${draft.groupRef} · ` : ''}{draft.pax} pax · {draft.arrivalDate} → {draft.departureDate}</div>
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
                </div>
              </div>
            </section>
          ))}
          {days.length === 0 && <p className="muted">No tour days added to this quotation — the arrival and departure days above will still be included. Add tour-day presets when building the quotation for a full day-by-day itinerary.</p>}

          <FixedDayEditor label="Departure day" day={departure} set={setDeparture} target="departure" />

          <section className="b-sec b-inc">
            <div>
              <h4>Included <span className="muted small">(one per line)</span></h4>
              <textarea rows={7} value={included} onChange={(e) => setIncluded(e.target.value)} />
            </div>
            <div>
              <h4>Not included <span className="muted small">(one per line)</span></h4>
              <textarea rows={7} value={excluded} onChange={(e) => setExcluded(e.target.value)} />
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
