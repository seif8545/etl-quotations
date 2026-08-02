import { useEffect, useMemo, useRef, useState } from 'react'

import { loadRefData, supabase } from '../lib/supabase'

import { computeTotals, tripDays, effectiveSelections } from '../lib/pricing'

import { getHtml2Pdf, waitForAssets } from '../lib/pdf'

import ItineraryDoc from './ItineraryDoc'

import type { ItineraryData } from './ItineraryDoc'

import type { QuotationDraft, RefData, DayPreset } from '../lib/types'

import CompactDoc, { SHEET_H, MAX_TILES, DEFAULT_SECTIONS, DEFAULT_TRUST } from './CompactDoc'

import type { CompactData, CompactSections } from './CompactDoc'

import { siteInfo } from '../lib/sitePhotos'

import { deriveSegments, applyOverrides, summariseLines } from '../lib/segments'

import type { PackageCategory } from '../lib/packageCategories'

import type { Segment, SegmentOverride, SegSourceDay } from '../lib/segments'

interface Meals { breakfast: boolean; lunch: boolean; dinner: boolean }

interface EditableDay { uid: string; title: string; description: string; photo: string; sites: string[]; guide: boolean; meals: Meals; hotel: string; dayLabel?: string }

interface FixedDay { on: boolean; title: string; description: string; photo: string; meals: Meals; hotel: string }

interface PriceRow { category: string; dbl: number; single: number; triple: number; quad: number; hotels: string }

type PriceColumnsMode = 'all' | 'dbl' | 'single' | 'triple' | 'quad'

interface FlightInsert { id: number; label: string; text: string; targetUid: string; position: 'start' | 'end' }

/** What the agent can change about a city on the compact sheet. */
export interface CityOverride {
  name?: string
  bullets?: string[]
  /** Legacy single photo. Read when `photos` is absent so old packages still open. */
  photo?: string
  /** 1–4 photo paths. Set = wins outright over whatever was auto-resolved. */
  photos?: string[]
  hidden?: boolean
}

/**
 * A destination the agent typed in by hand. Auto cities come from the sites picked on
 * each day; an extra is for places with no site behind them — a free afternoon, a beach
 * stay, an add-on the itinerary does not itemise.
 */
export interface ExtraCity {
  id: string
  name: string
  bullets: string[]
  photos: string[]
  hidden?: boolean
  /** Where it sits: '__start', '__end', or the key of the auto city it follows. */
  after: string
}

/** Read a city override's photo list, tolerating the pre-multi-photo shape. */
export const ovPhotos = (ov: CityOverride | undefined): string[] | undefined => {
  if (!ov) return undefined
  if (ov.photos) return ov.photos.filter(Boolean)
  if (ov.photo) return [ov.photo]
  return undefined
}

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
  priceTableOn: boolean; priceRows: PriceRow[]; priceColumns?: PriceColumnsMode
  flights: FlightInsert[]
  roomBasis?: string

  /** Per-block edits for the compact one-page sheet. Optional: older saved packages auto-derive. */
  compactSegments?: SegmentOverride[]

  /** Per-city edits for the compact sheet, keyed by the derived city name. */
  compactCities?: Record<string, CityOverride>

  /** Hand-typed destinations that exist only on the compact sheet. */
  compactExtraCities?: ExtraCity[]

  /** Compact-only inclusions. When off, the card mirrors the main PDF's lists. */
  compactIncOwn?: boolean
  compactIncluded?: string
  compactExcluded?: string

  /** Which blocks the compact card renders. */
  compactSections?: CompactSections

  /** The three trust-strip lines on the compact card. */
  compactTrust?: string[]

  /**
   * Manual filing in the Packages list, set from that list rather than in here.
   * Carried through save so re-saving a package does not un-file it.
   */
  category?: PackageCategory
}

const TOUR_MEALS = (): Meals => ({ breakfast: true, lunch: false, dinner: true })

const mealList = (m: Meals): string[] => [m.breakfast && 'Breakfast', m.lunch && 'Lunch', m.dinner && 'Dinner'].filter(Boolean) as string[]

const DEFAULT_PRICE_ROWS = (): PriceRow[] => [
  { category: '3 Star', dbl: 0, single: 0, triple: 0, quad: 0, hotels: '' },
  { category: '4 Star', dbl: 0, single: 0, triple: 0, quad: 0, hotels: '' },
  { category: '4 Star Deluxe', dbl: 0, single: 0, triple: 0, quad: 0, hotels: '' },
  { category: '5 Star', dbl: 0, single: 0, triple: 0, quad: 0, hotels: '' },
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
  const none = !meals.breakfast && !meals.lunch && !meals.dinner
  return (
    <div className="meal-ticker">
      <span className="meal-ticker-label">Meals</span>
      {items.map(([k, label]) => (
        <button type="button" key={k} className={`meal-toggle${meals[k] ? ' on' : ''}`}
          onClick={() => onChange({ ...meals, [k]: !meals[k] })}>{label}</button>
      ))}
      <button type="button" className={`meal-toggle meal-toggle-none${none ? ' on' : ''}`}
        title="No meals this day — removes the Meals line from the PDF"
        onClick={() => onChange({ breakfast: false, lunch: false, dinner: false })}>None</button>
    </div>
  )
}

/**
 * The photo tray for one destination on the compact card: up to MAX_TILES thumbnails,
 * each swappable or removable, plus an empty slot to add the next one. The card lays
 * these out as a mosaic, so the count here is what changes the picture, not the order.
 */
function PhotoStrip({ photos, onPick, onRemove, suggestion }: {
  photos: string[]
  onPick: (slot: number) => void
  onRemove: (slot: number) => void
  suggestion?: () => void
}) {
  const shots = photos.filter(Boolean).slice(0, MAX_TILES)
  return (
    <div className="cseg-shots">
      <div className="cseg-shots-grid">
        {shots.map((p, i) => (
          <div className="cseg-shot" key={i + p}>
            <img src={photoSrc(p)} alt="" onClick={() => onPick(i)} title="Click to swap this photo" />
            <button className="cseg-shot-x" title="Remove this photo" onClick={() => onRemove(i)}>×</button>
          </div>
        ))}
        {shots.length < MAX_TILES && (
          <button className="cseg-shot-add" title={`Add photo ${shots.length + 1} of ${MAX_TILES}`} onClick={() => onPick(shots.length)}>+</button>
        )}
      </div>
      <span className="muted small">{shots.length || 'no'} photo{shots.length === 1 ? '' : 's'}</span>
      {suggestion && <button className="link" onClick={suggestion}>Use all suggested</button>}
    </div>
  )
}

const PHOTO_BUCKET = 'tour-photos'

/** Photo values are either a path under /images/tours/ or a full URL (Supabase Storage upload). */
const photoSrc = (p: string) => (/^https?:\/\//.test(p) || p.startsWith('data:') ? p : '/images/tours/' + p)

/** Client-facing branded package PDF builder. Opens from a quotation (draft) or a saved package. */
function FixedDayEditor({ label, day, set, onPickPhoto }: { label: string; day: FixedDay; set: (d: FixedDay) => void; onPickPhoto: () => void }) {
  return (
    <section className={`b-day b-fixed${day.on ? '' : ' off'}`}>
      <div className="b-day-head">
        <label className="check pill-check"><input type="checkbox" checked={day.on} onChange={(e) => set({ ...day, on: e.target.checked })} /> {label}</label>
        <input value={day.title} disabled={!day.on} onChange={(e) => set({ ...day, title: e.target.value })} />
      </div>
      {day.on && (
        <div className="b-day-body">
          <div className="b-photo">
            {day.photo ? <img src={photoSrc(day.photo)} alt="" /> : <div className="b-nophoto">No photo — the PDF will show a styled title card instead</div>}
            <button className="link" onClick={onPickPhoto}>Change photo</button>
            {day.photo && <button className="link danger" onClick={() => set({ ...day, photo: '' })}>Remove photo</button>}
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

export default function PackageBuilder({ draft, saved, savedId, onClose }: { draft?: QuotationDraft; saved?: PackageState; savedId?: number; onClose: () => void }) {

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
  const [priceColumnsMode, setPriceColumnsMode] = useState<PriceColumnsMode>(saved?.priceColumns ?? 'all')
  const [included, setIncluded] = useState(saved?.included ?? '')
  const [excluded, setExcluded] = useState(saved?.excluded ?? '')
  const [flights, setFlights] = useState<FlightInsert[]>(saved?.flights ?? [])
  const [roomBasis, setRoomBasis] = useState(saved?.roomBasis ?? 'double')
  
  const [manifest, setManifest] = useState<Record<string, string[]>>({})
  const [uploads, setUploads] = useState<Record<string, { name: string; url: string }[]>>({})
  const [uploadArea, setUploadArea] = useState('my-uploads')
  const [uploading, setUploading] = useState(false)
  
  const [picker, setPicker] = useState<{ target: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')
  const [error, setError] = useState('')
  const [currentId, setCurrentId] = useState<number | undefined>(savedId)
  
  const docRef = useRef<HTMLDivElement>(null)
  const [compactNode, setCompactNode] = useState<HTMLDivElement | null>(null)
  const [logoUrl, setLogoUrl] = useState('/images/logo.png')

  useEffect(() => {
    let dead = false
    fetch('/images/logo.png')
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('logo ' + r.status))))
      .then((b) => new Promise<string>((res, rej) => {
        const fr = new FileReader()
        fr.onload = () => res(String(fr.result))
        fr.onerror = () => rej(fr.error)
        fr.readAsDataURL(b)
      }))
      .then((u) => { if (!dead) setLogoUrl(u) })
      .catch(() => { /* fall back to the path — no worse than before */ })
    return () => { dead = true }
  }, [])

  const [segOverrides, setSegOverrides] = useState<SegmentOverride[]>(saved?.compactSegments ?? [])
  const [cityOv, setCityOv] = useState<Record<string, CityOverride>>(saved?.compactCities ?? {})
  const [extraCities, setExtraCities] = useState<ExtraCity[]>(saved?.compactExtraCities ?? [])
  const [compactOpen, setCompactOpen] = useState(false)
  const [density, setDensity] = useState(0)

  const [cxSections, setCxSections] = useState<CompactSections>({ ...DEFAULT_SECTIONS(), ...(saved?.compactSections ?? {}) })
  const [cxTrust, setCxTrust] = useState<string[]>(saved?.compactTrust ?? DEFAULT_TRUST())
  const [cxIncOwn, setCxIncOwn] = useState(saved?.compactIncOwn ?? false)
  const [cxIncluded, setCxIncluded] = useState(saved?.compactIncluded ?? '')
  const [cxExcluded, setCxExcluded] = useState(saved?.compactExcluded ?? '')

  const [hotels, setHotels] = useState<{ nights: number; destination: string }[]>((saved?.hotels ?? (draft?.accommodation ?? []).filter((a) => a.nights > 0)) as { nights: number; destination: string }[])
  const totalNights = hotels.reduce((s, h) => s + h.nights, 0)
  const [meta, setMeta] = useState(saved?.meta ?? { ref: draft?.groupRef ?? '', pax: draft?.pax ?? 0, arrival: draft?.arrivalDate ?? '', departure: draft?.departureDate ?? '' })

  useEffect(() => {
    loadRefData().then((r) => {
      setRef(r)
      if (saved || !draft) return 
      
      const nameOf = (id: number) => r.sites.find((s) => s.id === id)?.name ?? ''
      const dd = draft.days ?? []
      const presetById = new Map(r.dayPresets.map((p) => [p.id, p]))
      
      const presetDays: EditableDay[] = dd.map((d) => ({
        uid: d.uid, title: d.label, description: presetById.get(d.presetId)?.description ?? d.description, photo: d.photo,
        sites: (d.siteIds ?? []).map(nameOf).filter(Boolean), guide: !!d.includeGuide, meals: TOUR_MEALS(), hotel: '',
      }))
      
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
      if (totalNights > 0) inc.push(`${totalNights} nights hotel accommodation on ${roomBasis} room basis`) 
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
    loadUploads()
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
  
  function duplicateDay(uid: string) {
    setDays((ds) => {
      const i = ds.findIndex((d) => d.uid === uid)
      if (i === -1) return ds
      const copy: EditableDay = { ...ds[i], uid: newUid() }
      return [...ds.slice(0, i + 1), copy, ...ds.slice(i + 1)]
    })
  }

  const setDayLabel = (uid: string, dayLabel: string) => updateDay(uid, { dayLabel: dayLabel || undefined })
  
  function addDayFromPreset(p: DayPreset) {
    const nameOf = (id: number) => ref?.sites.find((x) => x.id === id)?.name ?? ''
    const day: EditableDay = {
      uid: newUid(), title: p.name, description: p.description, photo: p.photo,
      sites: p.site_ids.map(nameOf).filter(Boolean), guide: p.include_guide, meals: TOUR_MEALS(), hotel: '',
    }
    setDays((ds) => [...ds, day])
  }

  const updateRow = (i: number, patch: Partial<PriceRow>) => setPriceRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  
  const setFlightTarget = (id: number, targetUid: string, position: 'start' | 'end') => setFlights((fs) => fs.map((f) => (f.id === id ? { ...f, targetUid, position } : f)))
  const removeFlight = (id: number) => setFlights((fs) => fs.filter((f) => f.id !== id))

  async function loadUploads() {
    try {
      const root = await supabase.storage.from(PHOTO_BUCKET).list('', { limit: 200 })
      if (root.error || !root.data) return
      const out: Record<string, { name: string; url: string }[]> = {}
      for (const entry of root.data) {
        if (entry.id) continue 
        const { data: inner } = await supabase.storage.from(PHOTO_BUCKET).list(entry.name, { limit: 500, sortBy: { column: 'name', order: 'asc' } })
        const imgs = (inner ?? []).filter((f) => f.id)
        if (!imgs.length) continue
        out[entry.name] = imgs.map((f) => ({ name: f.name, url: supabase.storage.from(PHOTO_BUCKET).getPublicUrl(entry.name + '/' + f.name).data.publicUrl }))
      }
      setUploads(out)
    } catch { /* picker still works without uploads */ }
  }

  async function uploadPhotos(fileList: FileList | File[]) {
    const area = (uploadArea.trim() || 'my-uploads').toLowerCase().replace(/[^a-z0-9 _-]+/g, '').replace(/\s+/g, '-') || 'my-uploads'
    const imgs = Array.from(fileList).filter((f) => f.type.startsWith('image/'))
    if (!imgs.length) return
    setUploading(true)
    try {
      for (const f of imgs) {
        const clean = f.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-')
        const { error: upErr } = await supabase.storage.from(PHOTO_BUCKET).upload(`${area}/${Date.now()}-${clean}`, f, { contentType: f.type || 'image/jpeg' })
        if (upErr) throw upErr
      }
      await loadUploads()
      setUploadArea(area)
    } catch (e: any) { setError(e.message ?? String(e)) }
    setUploading(false)
  }

  function pickPhoto(photo: string) {
    if (!picker) return

    /* "city:<key>#<slot>" and "extra:<id>#<slot>" — slot is the index in that
       destination's photo list, or its length when adding a new tile. */
    if (picker.target.startsWith('city:')) {
      const [key, slotRaw] = picker.target.slice(5).split('#')
      setCityPhoto(key, Number(slotRaw ?? 0), photo)
      setPicker(null); return
    }
    if (picker.target.startsWith('extra:')) {
      const [id, slotRaw] = picker.target.slice(6).split('#')
      setExtraPhoto(id, Number(slotRaw ?? 0), photo)
      setPicker(null); return
    }
    if (picker.target.startsWith('seg:')) { setSegOv(Number(picker.target.slice(4)), { photo }); setPicker(null); return }
    if (picker.target === 'hero') setHero(photo)
    else if (picker.target === 'arrival') setArrival((a) => ({ ...a, photo }))
    else if (picker.target === 'departure') setDeparture((a) => ({ ...a, photo }))
    else updateDay(picker.target, { photo })
    setPicker(null)
  }

  const data: ItineraryData = useMemo(() => {
    const REGION_CITY: Record<string, string> = {
      'Pyramids': 'Cairo', 'Sakkara': 'Cairo', 'Cairo/Giza': 'Cairo', 'More Sites': 'Cairo',
      'Alexandria/Behera': 'Alexandria', 'Luxor': 'Luxor', 'Aswan': 'Aswan',
      'Sharm el Sheikh': 'Sharm El Sheikh', 'Kafr el Sheikh/Sharkia/Minya/Sohag/Qena': 'Nile Valley',
    }

    // Dynamically compute unique cities from accommodation destinations and day sites
    const activeCities = new Set<string>()

    if (ref && draft) {
      for (const id of effectiveSelections(draft).siteIds) {
        const st = ref.sites.find((x) => x.id === id); if (!st) continue
        const reg = ref.regions.find((r) => r.id === st.region_id)?.name
        if (reg) activeCities.add(REGION_CITY[reg] ?? reg)
      }
    }

    // 1. Add all hotel destinations currently listed
    hotels.forEach((h) => {
      if (h.destination.trim()) {
        const mapped = REGION_CITY[h.destination] ?? h.destination.trim()
        activeCities.add(mapped)
      }
    })

    // 2. Add cities from custom editable days/sites
    days.forEach((d) => {
      d.sites.forEach((site) => {
        const info = siteInfo(site, manifest)
        if (info.city) activeCities.add(info.city)
      })
    })

    const liveCityCount = activeCities.size || 1

    let overview: { days: number; nights: number; cities: number; pax: number }
    if (saved) {
      const liveDayCount = days.length + (arrival.on ? 1 : 0) + (departure.on ? 1 : 0)
      overview = { ...saved.overview, days: liveDayCount || saved.overview.days, nights: hotels.length ? totalNights : saved.overview.nights, cities: liveCityCount, pax: meta.pax }
    } else {
      const diff = draft ? tripDays(draft) : 0
      const oNights = diff > 0 ? diff : totalNights
      const oDays = diff > 0 ? diff + 1 : (totalNights > 0 ? totalNights + 1 : days.length)
      overview = { days: oDays, nights: oNights, cities: liveCityCount, pax: meta.pax }
    }

    const seq: { uid: string; title: string; description: string; photoUrl: string; highlights: string[]; meals: string[]; hotel: string; dayLabel?: string }[] = [
      ...(arrival.on ? [{ uid: '__arrival', title: arrival.title, description: arrival.description, photoUrl: arrival.photo ? photoSrc(arrival.photo) : '', highlights: ['Meet & assist', 'Hotel check-in', 'Overnight'], meals: mealList(arrival.meals), hotel: arrival.hotel }] : []),
      ...days.map((d) => ({
        uid: d.uid, title: d.title, description: d.description,
        photoUrl: d.photo ? photoSrc(d.photo) : '',
        highlights: [...d.sites.map((s) => s.trim()).filter(Boolean), ...(d.guide ? ['Private guide'] : [])],
        meals: mealList(d.meals), hotel: d.hotel, dayLabel: d.dayLabel,
      })),
      ...(departure.on ? [{ uid: '__departure', title: departure.title, description: departure.description, photoUrl: departure.photo ? photoSrc(departure.photo) : '', highlights: ['Hotel check-out', 'Airport transfer'], meals: mealList(departure.meals), hotel: departure.hotel }] : []),
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
      heroUrl: photoSrc(hero),
      logoUrl: '/images/logo.png',
      meta,
      overview,
      days: seqDays,
      hotels,
      included: included.split('\n').map((s) => s.trim()).filter(Boolean),
      excluded: excluded.split('\n').map((s) => s.trim()).filter(Boolean),
      price: { pp, sgl, show: showPrice },
      pricing: { show: priceTableOn, refPp: pp, refSgl: sgl, rows: priceRows, columns: priceColumnsMode },
      contact: CONTACT,
      roomBasis,
    }
  }, [title, intro, hero, days, arrival, departure, pp, sgl, showPrice, priceTableOn, priceRows, priceColumnsMode, included, excluded, draft, saved, hotels, totalNights, ref, meta, flights, roomBasis, manifest]) 

  function buildState(): PackageState {
    return {
      title, intro, hero, meta,
      overview: { days: data.overview.days, nights: data.overview.nights, cities: data.overview.cities },
      hotels, days, arrival, departure,
      pp, sgl, showPrice, included, excluded, priceTableOn, priceRows, priceColumns: priceColumnsMode, flights,
      roomBasis, 
      compactSegments: segOverrides,
      compactCities: cityOv,
      compactExtraCities: extraCities,
      compactIncOwn: cxIncOwn,
      compactIncluded: cxIncluded,
      compactExcluded: cxExcluded,
      compactSections: cxSections,
      compactTrust: cxTrust,
      category: saved?.category,
    }
  }

  async function savePackage(asNewVersion = false) {
    try {
      const st = buildState()
      const row = {
        name: st.title, group_ref: st.meta.ref, pax: st.meta.pax,
        arrival_date: st.meta.arrival || null, departure_date: st.meta.departure || null,
        data: st,
      }
      if (currentId && !asNewVersion) {
        const { error: e } = await supabase.from('q_package_docs').update(row).eq('id', currentId)
        if (!e) { setSavedMsg('Saved'); setTimeout(() => setSavedMsg(''), 2500) }
      } else {
        const { data: u } = await supabase.auth.getUser()
        const { data: ins, error: e } = await supabase.from('q_package_docs')
          .insert({ ...row, created_by: u.user?.id }).select('id').single()
        if (!e) {
          if (ins?.id) setCurrentId(ins.id)
          setSavedMsg(asNewVersion ? 'Saved as new version' : 'Saved to Packages')
          setTimeout(() => setSavedMsg(''), 2500)
        }
      }
    } catch { /* don't block export on save errors */ }
  }

  async function exportPdf() {
    setBusy(true); setError('')
    try {
      const node = docRef.current
      if (!node) throw new Error('Document not ready')
      await waitForAssets(node)

      const scrolled: Array<[HTMLElement, number, number]> = []
      for (let el: HTMLElement | null = node.parentElement; el; el = el.parentElement) {
        if (el.scrollTop || el.scrollLeft) { scrolled.push([el, el.scrollTop, el.scrollLeft]); el.scrollTop = 0; el.scrollLeft = 0 }
      }
      const winX = window.scrollX, winY = window.scrollY
      window.scrollTo(0, 0)

      const safe = (title || 'package').replace(/[^\w\-]+/g, '_')
      const PAGE_W = 794, PAGE_H = 1123, SCALE = 2, CUT = 18

      const crop = (src: HTMLCanvasElement) => {
        const out = document.createElement('canvas')
        out.width = src.width
        out.height = src.height
        const ctx = out.getContext('2d')
        if (!ctx) return src
        ctx.fillStyle = '#fffefa'
        ctx.fillRect(0, 0, out.width, out.height)
        ctx.drawImage(src, CUT, 0, src.width - CUT * 2, src.height, 0, 0, out.width, out.height)
        return out
      }

      try {
        const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
          import('html2canvas'),
          import('jspdf'),
        ])

        const pages = Array.from(node.children) as HTMLElement[]
        if (pages.length === 0) throw new Error('No pages to export')

        const pdf = new jsPDF({ unit: 'px', format: [PAGE_W, PAGE_H], orientation: 'portrait', hotfixes: ['px_scaling'] })

        for (let i = 0; i < pages.length; i++) {
          const raw = await html2canvas(pages[i], { scale: SCALE, useCORS: true, backgroundColor: '#fffefa', logging: false })
          const out = crop(raw)
          if (i > 0) pdf.addPage([PAGE_W, PAGE_H], 'portrait')
          pdf.addImage(out.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, PAGE_W, PAGE_H)
        }

        pdf.save(safe + '.pdf')
      } catch (perPageErr) {
        const html2pdf = await getHtml2Pdf()
        const opt = {
          margin: 0,
          filename: safe + '.pdf',
          image: { type: 'jpeg', quality: 0.95 },
          html2canvas: { scale: SCALE, useCORS: true, backgroundColor: '#fffefa', logging: false },
          jsPDF: { unit: 'px', format: [PAGE_W, PAGE_H], orientation: 'portrait', hotfixes: ['px_scaling'] },
          pagebreak: { mode: ['css'] },
        }
        try {
          await html2pdf().set(opt).from(node).toCanvas().then(function (this: any) {
            const src: HTMLCanvasElement | undefined = this && this.prop ? this.prop.canvas : undefined
            if (!src || !src.width || !src.height) return
            this.prop.canvas = crop(src)
          }).toImg().toPdf().save()
        } catch (cropErr) {
          await html2pdf().set(opt).from(node).save()
        }
      } finally {
        window.scrollTo(winX, winY)
        scrolled.forEach(([el, t, l]) => { el.scrollTop = t; el.scrollLeft = l })
      }

      await savePackage(false)

    } catch (e: any) {
      setError(e.message ?? String(e))
    }
    setBusy(false)
  }

  const MAX_SHEET_H = SHEET_H
  const MAX_DENSITY = 4

  const setCityOvFor = (key: string, patch: Partial<CityOverride>) =>
    setCityOv((m) => ({ ...m, [key]: { ...m[key], ...patch } }))

  /** Write one tile of a city's photo list, seeding from the auto photo on first edit. */
  function setCityPhoto(key: string, slot: number, photo: string) {
    setCityOv((m) => {
      const base = ovPhotos(m[key]) ?? (autoCity[key]?.photo ? [autoCity[key].photo] : [])
      const next = base.slice(0, MAX_TILES)
      if (slot >= next.length) next.push(photo)
      else next[slot] = photo
      return { ...m, [key]: { ...m[key], photos: next.slice(0, MAX_TILES), photo: undefined } }
    })
  }

  function removeCityPhoto(key: string, slot: number) {
    setCityOv((m) => {
      const base = ovPhotos(m[key]) ?? (autoCity[key]?.photo ? [autoCity[key].photo] : [])
      const next = base.filter((_, i) => i !== slot)
      return { ...m, [key]: { ...m[key], photos: next, photo: undefined } }
    })
  }

  const setExtra = (id: string, patch: Partial<ExtraCity>) =>
    setExtraCities((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)))

  function setExtraPhoto(id: string, slot: number, photo: string) {
    setExtraCities((xs) => xs.map((x) => {
      if (x.id !== id) return x
      const next = x.photos.slice(0, MAX_TILES)
      if (slot >= next.length) next.push(photo)
      else next[slot] = photo
      return { ...x, photos: next.slice(0, MAX_TILES) }
    }))
  }

  const removeExtraPhoto = (id: string, slot: number) =>
    setExtraCities((xs) => xs.map((x) => (x.id === id ? { ...x, photos: x.photos.filter((_, i) => i !== slot) } : x)))

  const addExtraCity = () =>
    setExtraCities((xs) => [...xs, { id: newUid(), name: '', bullets: [], photos: [], after: '__end' }])

  const removeExtraCity = (id: string) => setExtraCities((xs) => xs.filter((x) => x.id !== id))

  function moveExtraCity(id: string, dir: -1 | 1) {
    setExtraCities((xs) => {
      const i = xs.findIndex((x) => x.id === id)
      const j = i + dir
      if (i === -1 || j < 0 || j >= xs.length) return xs
      const copy = xs.slice(); const t = copy[i]; copy[i] = copy[j]; copy[j] = t
      return copy
    })
  }

  const setSegOv = (i: number, patch: Partial<SegmentOverride>) =>
    setSegOverrides((os) => {
      const next = os.slice()
      while (next.length <= i) next.push({})
      next[i] = { ...next[i], ...patch }
      return next
    })

  const segSource: SegSourceDay[] = useMemo(() => [
    ...(arrival.on ? [{ uid: '__arrival', title: arrival.title, description: arrival.description, photo: arrival.photo, sites: [] as string[], meals: arrival.meals, hotel: arrival.hotel }] : []),
    ...days.map((d) => ({
      uid: d.uid, title: d.title, description: d.description, photo: d.photo,
      sites: [...d.sites.map((x) => x.trim()).filter(Boolean), ...(d.guide ? ['Private guide'] : [])],
      meals: d.meals, hotel: d.hotel,
    })),
    ...(departure.on ? [{ uid: '__departure', title: departure.title, description: departure.description, photo: departure.photo, sites: [] as string[], meals: departure.meals, hotel: departure.hotel }] : []),
  ], [arrival, days, departure])

  const notesByUid = useMemo(() => {
    const out: Record<string, string[]> = {}
    for (const f of flights) {
      if (!f.targetUid) continue
      if (!out[f.targetUid]) out[f.targetUid] = []
      out[f.targetUid].push(f.text)
    }
    return out
  }, [flights])

  const segmentsAll: Segment[] = useMemo(
    () => applyOverrides(deriveSegments(segSource, hotels, { notesByUid }), segOverrides),
    [segSource, hotels, notesByUid, segOverrides],
  )

  const [aspects, setAspects] = useState<Record<string, number>>({})

  const compactData: CompactData = useMemo(() => {
    const visible = segmentsAll.filter((s) => !s.hidden)

    type Bucket = { sites: string[]; lines: string[]; photos: { name: string; photoUrl: string; aspect: number }[]; used: Set<string> }
    const order: string[] = []
    const byCity = new Map<string, Bucket>()
    const seenSite = new Set<string>()

    const dayFallback: string[] = []
    for (const seg of visible) {
      for (let i = seg.dayFrom; i <= seg.dayTo; i++) dayFallback[i] = seg.destination
    }

    segSource.forEach((day, di) => {
      const lines = (day.description ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
      const touched = new Set<string>()

      for (const raw of day.sites) {
        const name = (raw ?? '').trim()
        if (!name || /^private guide$/i.test(name) || /^\+\d+ more$/.test(name)) continue
        const info = siteInfo(name, manifest)
        const city = info.city || dayFallback[di] || 'Egypt'
        if (!byCity.has(city)) { byCity.set(city, { sites: [], lines: [], photos: [], used: new Set() }); order.push(city) }
        const b = byCity.get(city)!
        touched.add(city)

        const key = name.toLowerCase()
        if (!seenSite.has(key)) {
          seenSite.add(key)
          b.sites.push(name)
          if (info.photo && b.photos.length < MAX_TILES && !b.used.has(info.photo)) {
            b.used.add(info.photo)
            const url = photoSrc(info.photo)
            b.photos.push({ name, photoUrl: url, aspect: aspects[url] ?? 0 })
          }
        }
      }

      for (const city of touched) byCity.get(city)!.lines.push(...lines)
    })

    const tileOf = (path: string, label: string) => {
      const url = photoSrc(path)
      return { name: label, photoUrl: url, aspect: aspects[url] ?? 0 }
    }

    const autoGroups = order.map((city) => {
      const b = byCity.get(city)!
      const ov = cityOv[city] ?? {}
      const chosen = ovPhotos(ov)

      /* An explicit photo list wins outright — including an empty one, which is how
         the agent says "no picture for this stop". */
      let photos = chosen
        ? chosen.slice(0, MAX_TILES).map((p) => tileOf(p, ov.name || city))
        : b.photos.slice(0, 1)

      if (!chosen && !photos.length) {
        const p = siteInfo(city, manifest).photo
        if (p) photos = [tileOf(p, city)]
      }

      return {
        key: city,
        city: ov.name ?? city,
        bullets: ov.bullets ?? summariseLines(b.lines, b.sites, 3),
        photos,
        hidden: !!ov.hidden,
      }
    })

    /* Hand-typed destinations slot in around the auto ones. */
    const extrasAt = (slot: string) => extraCities
      .filter((x) => !x.hidden && (x.after || '__end') === slot && (x.name.trim() || x.photos.length))
      .map((x) => ({
        key: 'extra:' + x.id,
        city: x.name.trim() || 'Destination',
        bullets: x.bullets.map((b) => b.trim()).filter(Boolean),
        photos: x.photos.slice(0, MAX_TILES).map((p) => tileOf(p, x.name)),
        hidden: false,
      }))

    const groups = [
      ...extrasAt('__start'),
      ...autoGroups.flatMap((g) => (g.hidden ? extrasAt(g.key) : [g, ...extrasAt(g.key)])),
      ...extrasAt('__end'),
    ].filter((g) => !g.hidden)

    const stayOrder: string[] = []
    const stayMap = new Map<string, { nights: number; destination: string; hotel: string }>()
    for (const seg of visible) {
      const dest = seg.destination || 'Egypt'
      if (!stayMap.has(dest)) { stayMap.set(dest, { nights: 0, destination: dest, hotel: '' }); stayOrder.push(dest) }
      const e = stayMap.get(dest)!
      e.nights += seg.nights
      if (!e.hotel && seg.stay && seg.stay !== dest) e.hotel = seg.stay
    }

    const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean)

    return {
      title,
      logoUrl,
      meta,
      overview: { ...data.overview, cities: groups.length || data.overview.cities },
      groups,
      stays: stayOrder.map((d) => stayMap.get(d)!),
      included: cxIncOwn ? lines(cxIncluded) : data.included,
      excluded: cxIncOwn ? lines(cxExcluded) : data.excluded,
      price: { pp, sgl, show: showPrice },
      pricing: { show: priceTableOn, rows: priceRows, columns: priceColumnsMode },
      contact: CONTACT,
      roomBasis,
      density,
      sections: cxSections,
      trust: cxTrust,
    }
  }, [title, logoUrl, meta, data, segmentsAll, manifest, aspects, cityOv, extraCities, pp, sgl, showPrice, priceTableOn, priceRows, priceColumnsMode, roomBasis, density, cxIncOwn, cxIncluded, cxExcluded, cxSections, cxTrust])

  const tileUrls = useMemo(
    () => compactData.groups.flatMap((g) => g.photos.map((p) => p.photoUrl)).join('|'),
    [compactData.groups],
  )

  useEffect(() => {
    const urls = tileUrls ? tileUrls.split('|') : []
    const missing = Array.from(new Set(urls)).filter((u) => u && !(u in aspects))
    if (!missing.length) return
    let dead = false
    Promise.all(missing.map((u) => new Promise<[string, number]>((res) => {
      const im = new Image()
      im.onload = () => res([u, im.naturalWidth > 0 && im.naturalHeight > 0 ? im.naturalWidth / im.naturalHeight : 1.5])
      im.onerror = () => res([u, 1.5])
      im.src = u
    }))).then((pairs) => {
      if (dead) return
      setAspects((prev) => {
        const next = { ...prev }
        for (const [u, a] of pairs) next[u] = a
        return next
      })
    })
    return () => { dead = true }
  }, [tileUrls, aspects])

  const fitSig = useMemo(() => JSON.stringify([
    compactData.groups.map((g) => [g.city, g.bullets, g.photos.map((p) => [p.name, p.aspect])]),
    compactData.stays, compactData.included, compactData.excluded, compactData.title,
    compactData.pricing, compactData.price, compactData.meta, compactData.overview,
    compactData.sections, compactData.trust,
  ]), [compactData])

  useEffect(() => { setDensity(0) }, [fitSig])

  useEffect(() => {
    const node = compactNode
    if (!node) return
    let cancelled = false
    let raf = 0

    const measure = () => {
      if (cancelled) return
      const body = node.querySelector('[data-cx-body]') as HTMLElement | null
      if (!body) return
      if (body.scrollHeight > body.clientHeight + 1 && density < MAX_DENSITY) setDensity((x) => x + 1)
    }

    const schedule = () => {
      window.cancelAnimationFrame(raf)
      raf = window.requestAnimationFrame(measure)
    }

    schedule()

    const fonts = (document as any).fonts
    if (fonts?.ready?.then) fonts.ready.then(schedule).catch(() => {})

    let ro: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(schedule)
      ro.observe(node)
    }

    return () => { cancelled = true; window.cancelAnimationFrame(raf); ro?.disconnect() }
  }, [compactNode, fitSig, density])

  async function exportCompact(kind: 'png' | 'pdf') {
    setBusy(true); setError('')
    const scrolled: Array<[HTMLElement, number, number]> = []
    const winX = window.scrollX, winY = window.scrollY
    try {
      const node = compactNode
      if (!node) throw new Error('Document not ready')
      await waitForAssets(node)

      for (let el: HTMLElement | null = node.parentElement; el; el = el.parentElement) {
        if (el.scrollTop || el.scrollLeft) { scrolled.push([el, el.scrollTop, el.scrollLeft]); el.scrollTop = 0; el.scrollLeft = 0 }
      }
      window.scrollTo(0, 0)

      const safe = (title || 'package').replace(/[^\w\-]+/g, '_') + '_compact'
      const SCALE = 3, CUT = 27

      const { default: html2canvas } = await import('html2canvas')
      const raw = await html2canvas(node, { scale: SCALE, useCORS: true, backgroundColor: '#fffefa', logging: false })

      const OUT_W = 1080
      const outH = Math.max(1, Math.round(OUT_W * node.offsetHeight / node.offsetWidth))

      const canvas = document.createElement('canvas')
      canvas.width = OUT_W
      canvas.height = outH
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas not available')
      ctx.fillStyle = '#fffefa'
      ctx.fillRect(0, 0, OUT_W, outH)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(raw, CUT, 0, raw.width - CUT * 2, raw.height, 0, 0, OUT_W, outH)

      const body = node.querySelector('[data-cx-body]') as HTMLElement | null
      if (body && body.scrollHeight > body.clientHeight + 1) {
        const over = body.scrollHeight - body.clientHeight
        setError(`Content overflows the 4:5 card by ~${over}px and has been cut off. Trim some inclusions, sites or pricing rows.`)
      }

      if (kind === 'png') {
        const a = document.createElement('a')
        a.href = canvas.toDataURL('image/png')
        a.download = safe + '.png'
        document.body.appendChild(a); a.click(); a.remove()
      } else {
        const { jsPDF } = await import('jspdf')
        const w = OUT_W, h = outH
        const pdf = new jsPDF({ unit: 'px', format: [w, h], orientation: h >= w ? 'portrait' : 'landscape', hotfixes: ['px_scaling'] })
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, w, h)
        pdf.save(safe + '.pdf')
      }
    } catch (e: any) {
      setError(e.message ?? String(e))
    } finally {
      window.scrollTo(winX, winY)
      scrolled.forEach(([el, t, l]) => { el.scrollTop = t; el.scrollLeft = l })
      setBusy(false)
    }
  }

  const daySlots = [
    ...(arrival.on ? [{ uid: '__arrival', title: arrival.title }] : []),
    ...days.map((d) => ({ uid: d.uid, title: d.title })),
    ...(departure.on ? [{ uid: '__departure', title: departure.title }] : []),
  ]

  const autoCity = useMemo(() => {
    const out: Record<string, { bullets: string[]; photo: string; photos: string[]; siteCount: number }> = {}
    const order: string[] = []
    const buckets = new Map<string, { sites: string[]; lines: string[]; photo: string; photos: string[] }>()
    const seen = new Set<string>()
    const fallback: string[] = []
    for (const seg of segmentsAll.filter((x) => !x.hidden)) {
      for (let i = seg.dayFrom; i <= seg.dayTo; i++) fallback[i] = seg.destination
    }
    segSource.forEach((day, di) => {
      const lines = (day.description ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
      const touched = new Set<string>()
      for (const raw of day.sites) {
        const name = (raw ?? '').trim()
        if (!name || /^private guide$/i.test(name) || /^\+\d+ more$/.test(name)) continue
        const info = siteInfo(name, manifest)
        const city = info.city || fallback[di] || 'Egypt'
        if (!buckets.has(city)) { buckets.set(city, { sites: [], lines: [], photo: '', photos: [] }); order.push(city) }
        const b2 = buckets.get(city)!
        touched.add(city)
        const k = name.toLowerCase()
        if (!seen.has(k)) {
          seen.add(k); b2.sites.push(name)
          if (!b2.photo && info.photo) b2.photo = info.photo
          if (info.photo && b2.photos.length < MAX_TILES && !b2.photos.includes(info.photo)) b2.photos.push(info.photo)
        }
      }
      for (const c of touched) buckets.get(c)!.lines.push(...lines)
    })
    for (const city of order) {
      const b2 = buckets.get(city)!
      const fallback = b2.photo || siteInfo(city, manifest).photo
      out[city] = {
        bullets: summariseLines(b2.lines, b2.sites, 3),
        photo: fallback,
        photos: b2.photos.length ? b2.photos : (fallback ? [fallback] : []),
        siteCount: b2.sites.length,
      }
    }
    return out
  }, [segSource, segmentsAll, manifest])

  const compactCityKeys = useMemo(() => Object.keys(autoCity), [autoCity])

  const visibleSegCount = segmentsAll.filter((x) => !x.hidden).length

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
          <button onClick={() => savePackage(false)}>Save</button>
          {currentId && <button onClick={() => savePackage(true)}>Save as new version</button>}
          <button onClick={onClose}>Close</button>
          <button className="primary" disabled={busy} onClick={exportPdf}>{busy ? 'Building…' : 'Export PDF'}</button>
          <button disabled={busy} title="One-page compact sheet as a PNG image" onClick={() => exportCompact('png')}>Compact PNG</button>
          <button disabled={busy} title="One-page compact sheet as a printable PDF" onClick={() => exportCompact('pdf')}>Compact PDF</button>
        </div>
        {error && <div className="error">{error}</div>}
        <div className="builder-body">
          <div className="b-trip">
            <div className="b-trip-dates">
              <label>Arrival <input type="date" value={meta.arrival} onChange={(e) => setMeta((m) => ({ ...m, arrival: e.target.value }))} /></label>
              <label>Departure <input type="date" value={meta.departure} onChange={(e) => setMeta((m) => ({ ...m, departure: e.target.value }))} /></label>
              <label>Guests <input type="number" min={1} value={meta.pax} onChange={(e) => setMeta((m) => ({ ...m, pax: Math.max(1, Number(e.target.value) || 1) }))} style={{ width: 64 }} /></label>
            </div>
            <div className="b-trip-accom">
              <b>Accommodation nights</b>
              
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px' }}>
                Room Basis: <select value={roomBasis} onChange={(e) => setRoomBasis(e.target.value)}>
                  <option value="single">Single</option>
                  <option value="double">Double</option>
                  <option value="triple">Triple</option>
                  <option value="quadruple">Quadruple</option>
                </select>
              </label>

              {hotels.map((h, i) => (
                <div className="b-accom-row" key={i}>
                  <input type="number" min={0} value={h.nights} onChange={(e) => setHotels((hs) => hs.map((x, j) => (j === i ? { ...x, nights: Math.max(0, Number(e.target.value) || 0) } : x)))} />
                  <span>nights in</span>
                  <input value={h.destination} onChange={(e) => setHotels((hs) => hs.map((x, j) => (j === i ? { ...x, destination: e.target.value } : x)))} placeholder="Destination" />
                  <button className="link danger" onClick={() => setHotels((hs) => hs.filter((_, j) => j !== i))}>remove</button>
                </div>
              ))}
              <button onClick={() => setHotels((hs) => [...hs, { nights: 1, destination: '' }])}>+ Add accommodation</button>
            </div>
          </div>

          <section className="b-sec b-compact">
            <div className="b-day-head">
              <h4>Compact sheet (PNG / PDF)</h4>
              <span className="muted small">{compactData.groups.length} cit{compactData.groups.length === 1 ? 'y' : 'ies'} · 1080×1350{density > 0 ? ' · condensed ×' + density : ''}</span>
              <button className="link" onClick={() => setCompactOpen((o) => !o)}>{compactOpen ? 'Hide' : 'Edit cities'}</button>
              {Object.keys(cityOv).length > 0 && <button className="link danger" onClick={() => setCityOv({})}>Reset to auto</button>}
            </div>
            {compactOpen && (
              <div className="cseg-list">
                <p className="muted small">One row per destination on the shareable card. Everything here is yours to change — rename it, rewrite its bullets, give it up to {MAX_TILES} photos, or hide it. Blank bullets fall back to the auto-generated ones. Only affects the compact PNG / PDF.</p>

                {compactCityKeys.map((key) => {
                  const ov = cityOv[key] ?? {}
                  const auto = autoCity[key]
                  const shots = ovPhotos(ov) ?? (auto?.photo ? [auto.photo] : [])
                  return (
                    <div className={`cseg-row${ov.hidden ? ' off' : ''}`} key={key}>
                      <PhotoStrip
                        photos={shots}
                        onPick={(slot) => setPicker({ target: `city:${key}#${slot}` })}
                        onRemove={(slot) => removeCityPhoto(key, slot)}
                        suggestion={auto && auto.photos.length > shots.length
                          ? () => setCityOvFor(key, { photos: auto.photos.slice(0, MAX_TILES), photo: undefined })
                          : undefined}
                      />
                      <div className="cseg-fields">
                        <div className="cseg-line">
                          <input className="cseg-dest" value={ov.name ?? key} placeholder="Destination name" onChange={(e) => setCityOvFor(key, { name: e.target.value })} />
                          <span className="muted small cseg-range">{auto ? auto.siteCount + ' site' + (auto.siteCount === 1 ? '' : 's') : ''}</span>
                        </div>
                        <textarea
                          rows={3}
                          className="cseg-blurb"
                          placeholder={'One highlight per line — these render as bullets'}
                          value={(ov.bullets ?? auto?.bullets ?? []).join('\n')}
                          onChange={(e) => {
                            const lines = e.target.value.split('\n')
                            const hasText = lines.some((l) => l.trim())
                            setCityOv((m) => ({ ...m, [key]: { ...m[key], bullets: hasText ? lines : undefined } }))
                          }}
                        />
                      </div>
                      <button className="link danger" onClick={() => setCityOvFor(key, { hidden: !ov.hidden })}>{ov.hidden ? 'Show' : 'Hide'}</button>
                    </div>
                  )
                })}
                {compactCityKeys.length === 0 && <p className="muted">No cities yet — add sites to your days and they'll group here.</p>}

                {/* ---------- Hand-typed destinations ---------- */}
                <div className="b-day-head" style={{ marginTop: 14 }}>
                  <h5 style={{ margin: 0 }}>Extra destinations</h5>
                  <span className="muted small">Places with no site behind them — a beach stay, a free day, an add-on.</span>
                </div>
                {extraCities.map((x, i) => (
                  <div className={`cseg-row${x.hidden ? ' off' : ''}`} key={x.id}>
                    <PhotoStrip
                      photos={x.photos}
                      onPick={(slot) => setPicker({ target: `extra:${x.id}#${slot}` })}
                      onRemove={(slot) => removeExtraPhoto(x.id, slot)}
                    />
                    <div className="cseg-fields">
                      <div className="cseg-line">
                        <input className="cseg-dest" value={x.name} placeholder="Destination name (e.g. Hurghada)" onChange={(e) => setExtra(x.id, { name: e.target.value })} />
                        <select value={x.after} onChange={(e) => setExtra(x.id, { after: e.target.value })} title="Where this destination sits on the card">
                          <option value="__start">First on the card</option>
                          {compactCityKeys.map((k) => <option key={k} value={k}>After {cityOv[k]?.name ?? k}</option>)}
                          <option value="__end">Last on the card</option>
                        </select>
                        <button disabled={i === 0} onClick={() => moveExtraCity(x.id, -1)}>↑</button>
                        <button disabled={i === extraCities.length - 1} onClick={() => moveExtraCity(x.id, 1)}>↓</button>
                      </div>
                      <textarea
                        rows={3}
                        className="cseg-blurb"
                        placeholder={'One highlight per line — these render as bullets'}
                        value={x.bullets.join('\n')}
                        onChange={(e) => setExtra(x.id, { bullets: e.target.value.split('\n') })}
                      />
                    </div>
                    <div className="cseg-acts">
                      <button className="link" onClick={() => setExtra(x.id, { hidden: !x.hidden })}>{x.hidden ? 'Show' : 'Hide'}</button>
                      <button className="link danger" onClick={() => removeExtraCity(x.id)}>Remove</button>
                    </div>
                  </div>
                ))}
                <button onClick={addExtraCity}>+ Add destination</button>

                {/* ---------- Which blocks appear ---------- */}
                <div className="b-day-head" style={{ marginTop: 16 }}>
                  <h5 style={{ margin: 0 }}>Show on the card</h5>
                </div>
                <div className="price-columns-picker">
                  {([
                    ['stats', 'Days / nights / cities'], ['dates', 'Travel dates'], ['stays', 'Stays row'],
                    ['inclusions', 'Inclusions'], ['excluded', 'Not included'], ['trust', 'Trust strip'], ['pricing', 'Pricing'],
                  ] as [keyof CompactSections, string][]).map(([k, label]) => (
                    <button type="button" key={k} className={`meal-toggle${cxSections[k] ? ' on' : ''}`}
                      onClick={() => setCxSections((s) => ({ ...s, [k]: !s[k] }))}>{label}</button>
                  ))}
                </div>

                {cxSections.trust && (
                  <div className="cseg-line" style={{ marginTop: 8, gap: 8 }}>
                    {cxTrust.map((t, i) => (
                      <input key={i} value={t} placeholder={`Trust line ${i + 1}`} style={{ flex: 1 }}
                        onChange={(e) => setCxTrust((ts) => ts.map((x, j) => (j === i ? e.target.value : x)))} />
                    ))}
                  </div>
                )}

                {/* ---------- Card-only inclusions ---------- */}
                <label className="check" style={{ marginTop: 14 }}>
                  <input type="checkbox" checked={cxIncOwn} onChange={(e) => {
                    const on = e.target.checked
                    if (on && !cxIncluded.trim() && !cxExcluded.trim()) { setCxIncluded(included); setCxExcluded(excluded) }
                    setCxIncOwn(on)
                  }} />
                  {' '}Use a shorter inclusions list on the card only
                </label>
                {cxIncOwn && (
                  <div className="b-sec b-inc" style={{ padding: 0, border: 'none' }}>
                    <div>
                      <h4>Included on the card <span className="muted small">(one per line)</span></h4>
                      <textarea rows={6} value={cxIncluded} onChange={(e) => setCxIncluded(e.target.value)} />
                      <button className="link" onClick={() => setCxIncluded(included)}>Copy from the main list</button>
                    </div>
                    <div>
                      <h4>Not included on the card <span className="muted small">(one per line)</span></h4>
                      <textarea rows={6} value={cxExcluded} onChange={(e) => setCxExcluded(e.target.value)} />
                      <button className="link" onClick={() => setCxExcluded(excluded)}>Copy from the main list</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="b-cover">
            <img className="b-hero" src={photoSrc(hero)} alt="" />
            <button className="link" onClick={() => setPicker({ target: 'hero' })}>Change cover photo</button>
            <input className="b-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <div className="muted small">{meta.ref ? `Ref ${meta.ref} · ` : ''}{meta.pax} pax · {meta.arrival} → {meta.departure}</div>
            <textarea rows={2} value={intro} onChange={(e) => setIntro(e.target.value)} />
          </section>

          <FixedDayEditor label="Arrival day" day={arrival} set={setArrival} onPickPhoto={() => setPicker({ target: 'arrival' })} />

          {ref!.dayPresets.length > 0 && (
            <div className="day-presets">
              {(() => {
                const total: Record<string, number> = {}
                ref!.dayPresets.forEach((p) => { total[p.name] = (total[p.name] ?? 0) + 1 })
                const seen: Record<string, number> = {}
                return ref!.dayPresets.map((p) => {
                  seen[p.name] = (seen[p.name] ?? 0) + 1
                  const label = total[p.name] > 1 ? `${p.name} #${seen[p.name]}` : p.name
                  return <button key={p.id} type="button" className="day-chip-add" onClick={() => addDayFromPreset(p)}>+ {label}</button>
                })
              })()}
            </div>
          )}

          {days.map((d, i) => (
            <section key={d.uid} className="b-day">
              <div className="b-day-head">
                <b>Day {i + (arrival.on ? 2 : 1)}</b>
                <input className="b-day-label" placeholder={`Day ${i + (arrival.on ? 2 : 1)}`} title="Override the day label shown in the PDF (e.g. 'Days 2-5')" value={d.dayLabel ?? ''} onChange={(e) => setDayLabel(d.uid, e.target.value)} />
                <button disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button disabled={i === days.length - 1} onClick={() => move(i, 1)}>↓</button>
                <button title="Insert a copy of this day right below it" onClick={() => duplicateDay(d.uid)}>⧉ Duplicate</button>
                <input value={d.title} onChange={(e) => updateDay(d.uid, { title: e.target.value })} />
                <button className="link danger" onClick={() => removeDay(d.uid)}>Remove</button>
              </div>
              <div className="b-day-body">
                <div className="b-photo">
                  {d.photo ? <img src={photoSrc(d.photo)} alt="" /> : <div className="b-nophoto">No photo — the PDF will show a styled title card instead</div>}
                  <button className="link" onClick={() => setPicker({ target: d.uid })}>Change photo</button>
                  {d.photo && <button className="link danger" onClick={() => updateDay(d.uid, { photo: '' })}>Remove photo</button>}
                </div>
                <div className="b-day-text">
                  <textarea rows={3} value={d.description} onChange={(e) => updateDay(d.uid, { description: e.target.value })} />
                  <input className="b-highlights" placeholder="Highlights (comma-separated — leave empty for none)" value={d.sites.join(', ')} onChange={(e) => updateDay(d.uid, { sites: e.target.value.split(',').map((s) => s.replace(/^\s+/, '')) })} />
                  <MealTicker meals={d.meals} onChange={(m) => updateDay(d.uid, { meals: m })} />
                  <input className="b-hotel" placeholder="Accommodation (hotel / cruise)" value={d.hotel} onChange={(e) => updateDay(d.uid, { hotel: e.target.value })} />
                </div>
              </div>
            </section>
          ))}

          {days.length === 0 && <p className="muted">No day-by-day items yet. Add tour-day presets or select sites in the quotation and they'll appear here as days.</p>}

          {flights.length > 0 && (
            <section className="b-sec">
              <div className="b-day-head">
                <h4>Inter-city transfers</h4>
                <button className="link danger" onClick={() => setFlights([])}>Remove all</button>
              </div>
              <p className="muted small">Slot each inter-city flight or road transfer into a day — it appears as a bullet at the start or end of that day, or remove ones you don't need.</p>
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
                  <button className="link danger" onClick={() => removeFlight(f.id)}>Remove</button>
                </div>
              ))}
            </section>
          )}

          <FixedDayEditor label="Departure day" day={departure} set={setDeparture} onPickPhoto={() => setPicker({ target: 'departure' })} />

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

          <section className="b-sec">
            <label className="check"><input type="checkbox" checked={priceTableOn} onChange={(e) => setPriceTableOn(e.target.checked)} /> Add pricing table (hotel categories)</label>
            {priceTableOn && (
              <div className="b-ptable">
                <div className="muted small">Quote reference: ${pp.toLocaleString()} per person (double){sgl > 0 ? ` · $${sgl.toLocaleString()} single supplement` : ''}</div>
                <div className="price-columns-picker">
                  <span className="meal-ticker-label">Show in PDF</span>
                  {([
                    ['all', 'All'], ['dbl', 'Double only'], ['single', 'Single only'], ['triple', 'Triple only'], ['quad', 'Quadruple only'],
                  ] as [PriceColumnsMode, string][]).map(([mode, label]) => (
                    <button type="button" key={mode} className={`meal-toggle${priceColumnsMode === mode ? ' on' : ''}`}
                      onClick={() => setPriceColumnsMode(mode)}>{label}</button>
                  ))}
                </div>
                <div className="table-scroll">
                  <table className="grid-table wide">
                    <thead><tr><th>Category</th><th>Per person (DBL) USD</th><th>Single supp. USD</th><th>Triple USD</th><th>Quad USD</th><th>Offered hotels</th><th /></tr></thead>
                    <tbody>
                      {priceRows.map((r, i) => (
                        <tr key={i}>
                          <td><input value={r.category} onChange={(e) => updateRow(i, { category: e.target.value })} /></td>
                          <td><input type="number" min={0} value={r.dbl} onChange={(e) => updateRow(i, { dbl: +e.target.value })} /></td>
                          <td><input type="number" min={0} value={r.single} onChange={(e) => updateRow(i, { single: +e.target.value })} /></td>
                          <td><input type="number" min={0} value={r.triple} onChange={(e) => updateRow(i, { triple: +e.target.value })} /></td>
                          <td><input type="number" min={0} value={r.quad} onChange={(e) => updateRow(i, { quad: +e.target.value })} /></td>
                          <td style={{ width: '30%', minWidth: '250px', maxWidth: '400px' }}>
                            <textarea 
                              className="pr-hotels" 
                              rows={4} 
                              value={r.hotels} 
                              onChange={(e) => updateRow(i, { hotels: e.target.value })} 
                              style={{ 
                                width: '100%', 
                                maxWidth: '100%',
                                boxSizing: 'border-box', 
                                resize: 'vertical',
                                whiteSpace: 'pre-wrap'
                              }}
                              placeholder={'One line per destination, e.g.\nCairo: Hilton Grand Nile or equal\nNile Cruise: Sonesta or similar\nHurghada: JAZ Aquamarine or equal'} 
                            />
                          </td>
                          <td>{priceRows.length > 1 && <button className="link danger" onClick={() => setPriceRows((rs) => rs.filter((_, j) => j !== i))}>×</button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button onClick={() => setPriceRows((rs) => [...rs, { category: '', dbl: 0, single: 0, triple: 0, quad: 0, hotels: '' }])}>+ Add row</button>
              </div>
            )}
          </section>
        </div>
      </div>

      <div style={{ position: 'absolute', left: -99999, top: 0 }}>
        <ItineraryDoc ref={docRef} data={data} />
        <CompactDoc ref={setCompactNode} data={compactData} />
      </div>

      {picker && (
        <div className="picker-overlay" onClick={() => setPicker(null)}>
          <div className="picker" onClick={(e) => e.stopPropagation()}>
            <div className="picker-head"><b>Choose a photo</b><button onClick={() => setPicker(null)}>×</button></div>
            <div className="picker-up" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); uploadPhotos(e.dataTransfer.files) }}>
              <b>{uploading ? 'Uploading…' : 'Add photos:'}</b>
              {!uploading && <>
                <span>drag & drop onto this box, or</span>
                <label className="picker-browse">browse
                  <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => { const fl = e.target.files ? Array.from(e.target.files) : []; e.target.value = ''; if (fl.length) uploadPhotos(fl) }} />
                </label>
                <span>· collection:</span>
                <input className="picker-up-area" list="picker-up-areas" value={uploadArea} onChange={(e) => setUploadArea(e.target.value)} />
                <datalist id="picker-up-areas">{[...new Set([...Object.keys(manifest), ...Object.keys(uploads)])].map((s) => <option key={s} value={s} />)}</datalist>
              </>}
            </div>
            <div className="picker-grid">
              {Object.entries(manifest).map(([area, files]) => (
                <div key={area} className="picker-area">
                  <h5>{area.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</h5>
                  <div className="picker-thumbs">
                    {files.map((f) => (
                      <img key={f} src={`/images/tours/${area}/${f}`} alt="" onClick={() => pickPhoto(`${area}/${f}`)} />
                    ))}
                  </div>
                </div>
              ))}
              {Object.entries(uploads).map(([area, ufiles]) => (
                <div key={'up-' + area} className="picker-area">
                  <h5>{area.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())} — Uploaded</h5>
                  <div className="picker-thumbs">
                    {ufiles.map((f) => (
                      <img key={f.url} src={f.url} alt="" onClick={() => pickPhoto(f.url)} />
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