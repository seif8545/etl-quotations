import { useEffect, useMemo, useState } from 'react'
import { loadRefData, supabase } from '../lib/supabase'
import { computeTotals, sitePrice, transferPrice, tripDays, vehicleFor, effectiveSelections } from '../lib/pricing'
import { generateQuotationXlsx, downloadBlob } from '../lib/excel'
import { emptyDraft } from '../lib/types'
import type { QuotationDraft, RefData, DayPreset, QuotationDay } from '../lib/types'

const STEPS = ['Details', 'Accommodation', 'Sites', 'Transfers', 'Meals & Services', 'Review'] as const

interface Pkg { id: number; name: string; draft: QuotationDraft }

export default function QuotationWizard({ done, initial }: { done: () => void; initial?: QuotationDraft }) {
  const [ref, setRef] = useState<RefData | null>(null)
  const [loadError, setLoadError] = useState('')
  const [step, setStep] = useState(0)
  const [d, setD] = useState<QuotationDraft>(initial ? { ...emptyDraft(), ...initial } : emptyDraft())
  const [busy, setBusy] = useState(false)
  const [genError, setGenError] = useState('')
  const [packages, setPackages] = useState<Pkg[]>([])

  useEffect(() => {
    loadRefData().then(setRef).catch((e) => setLoadError(e.message ?? String(e)))
    supabase.from('q_packages').select('id,name,draft').order('name')
      .then(({ data }) => setPackages((data as Pkg[]) ?? []))
  }, [])

  function applyPackage(idStr: string) {
    const pkg = packages.find((p) => p.id === +idStr)
    if (!pkg) return
    const { accommodation, siteIds, transferCounts, mealCounts, guideTicket,
      guideAccommodation, includeGuide, includeRep, flightTicket, days } = { ...emptyDraft(), ...pkg.draft }
    setD((prev) => ({ ...prev, accommodation, siteIds, transferCounts, mealCounts,
      guideTicket, guideAccommodation, includeGuide, includeRep, flightTicket, days }))
  }

  const totals = useMemo(() => (ref ? computeTotals(d, ref) : null), [d, ref])

  if (loadError) return <div className="center-page error">Failed to load data: {loadError}</div>
  if (!ref || !totals) return <div className="center-page">Loading price lists…</div>

  const up = (patch: Partial<QuotationDraft>) => setD((prev) => ({ ...prev, ...patch }))

  const detailsValid = d.name.trim() && d.pax >= 1 && d.arrivalDate && d.departureDate &&
    d.departureDate >= d.arrivalDate && d.exchangeRate > 0

  async function generate() {
    setBusy(true); setGenError('')
    try {
      const blob = await generateQuotationXlsx(d, ref!)
      await saveQuotation(d, ref!)
      downloadBlob(blob, `${d.name.trim()}.xlsx`)
      done()
    } catch (e: any) {
      setGenError(e.message ?? String(e))
    }
    setBusy(false)
  }

  return (
    <div className="wizard">
      <nav className="steps">
        {STEPS.map((s, i) => (
          <button key={s} className={i === step ? 'active' : i < step ? 'done' : ''}
            onClick={() => setStep(i)}>{i + 1}. {s}</button>
        ))}
      </nav>

      <div className="wizard-body">
        {step === 0 && packages.length > 0 && (
          <label className="pkg-select">Start from package:{' '}
            <select defaultValue="" onChange={(e) => applyPackage(e.target.value)}>
              <option value="">— none —</option>
              {packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}
        {step === 0 && <Details d={d} up={up} />}
        {step === 1 && <Accommodation d={d} up={up} ref_={ref} />}
        {step === 2 && <><TourDays d={d} up={up} ref_={ref} /><Sites d={d} up={up} ref_={ref} /></>}
        {step === 3 && <Transfers d={d} up={up} ref_={ref} />}
        {step === 4 && <MealsServices d={d} up={up} ref_={ref} />}
        {step === 5 && <Review d={d} ref_={ref} />}
      </div>

      <aside className="totals card">
        <h4>Live totals (USD)</h4>
        <div><span>Accommodation</span><b>{fmt(totals.accommodationUSD)}</b></div>
        <div><span>Sites</span><b>{fmt(totals.sitesUSD)}</b></div>
        <div><span>Transfers /pax</span><b>{fmt(totals.transfersUSD)}</b></div>
        <div><span>Meals</span><b>{fmt(totals.mealsUSD)}</b></div>
        <div><span>Services /pax</span><b>{fmt(totals.servicesUSD)}</b></div>
        <div><span>Profit</span><b>{fmt(d.estimateProfit)}</b></div>
        <div className="grand"><span>P.P in DBL</span><b>${fmt(totals.perPersonDBL)}</b></div>
        <div><span>SGL supplement</span><b>{fmt(totals.sglSupplementUSD)}</b></div>
        <div className="muted small">Vehicle: {vehicleFor(d.pax || 1, ref)} · {tripDays(d)} day(s)</div>
      </aside>

      <footer className="wizard-nav">
        <button disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
        {step < STEPS.length - 1 ? (
          <button className="primary" onClick={() => setStep(step + 1)}>
            Next
          </button>
        ) : (
          <button className="primary" disabled={busy || !detailsValid} onClick={generate}>
            {busy ? 'Generating…' : 'Generate Excel'}
          </button>
        )}
        {genError && <span className="error">{genError}</span>}
      </footer>
    </div>
  )
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

function Details({ d, up }: StepProps) {
  return (
    <div className="form-grid">
      <label>Quotation name (file name)<input value={d.name} onChange={(e) => up({ name: e.target.value })} placeholder="e.g. Group-1234-Nov" /></label>
      <label>Group Ref. No.<input value={d.groupRef} onChange={(e) => up({ groupRef: e.target.value })} /></label>
      <label># PAX of group<input type="number" min={1} value={d.pax} onChange={(e) => up({ pax: +e.target.value })} /></label>
      <label>Arrival date<input type="date" value={d.arrivalDate} onChange={(e) => up({ arrivalDate: e.target.value })} /></label>
      <label>Departure date<input type="date" value={d.departureDate} onChange={(e) => up({ departureDate: e.target.value })} /></label>
      <label>Exchange rate (EGP/USD)<input type="number" step="0.01" min={0} value={d.exchangeRate} onChange={(e) => up({ exchangeRate: +e.target.value })} /></label>
      <label>Estimate profit (USD p.p.)<input type="number" step="0.01" value={d.estimateProfit} onChange={(e) => up({ estimateProfit: +e.target.value })} /></label>
      <label>Flight ticket (LE, optional)<input type="number" min={0} value={d.flightTicket} onChange={(e) => up({ flightTicket: +e.target.value })} /></label>
    </div>
  )
}

interface StepProps { d: QuotationDraft; up: (p: Partial<QuotationDraft>) => void; ref_?: RefData }

function Accommodation({ d, up, ref_ }: StepProps) {
  const ref = ref_!
  function set(dest: string, field: 'nights' | 'pricePerNight', value: number) {
    const list = d.accommodation.map((a) => ({ ...a }))
    let entry = list.find((a) => a.destination === dest)
    if (!entry) { entry = { destination: dest, nights: 0, pricePerNight: 0 }; list.push(entry) }
    entry[field] = value
    up({ accommodation: list })
  }
  return (
    <>
    <datalist id="ppn-opts">{[70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180].map((v) => <option key={v} value={v} />)}</datalist>
    <table className="grid-table">
      <thead><tr><th>Destination</th><th>Nights</th><th>Price / night (USD, in DBL)</th></tr></thead>
      <tbody>
        {ref.destinations.map((dest) => {
          const e = d.accommodation.find((a) => a.destination === dest.name)
          return (
            <tr key={dest.id}>
              <td>{dest.name}</td>
              <td><input type="number" min={0} value={e?.nights ?? 0} onChange={(ev) => set(dest.name, 'nights', +ev.target.value)} /></td>
              <td><input type="number" min={0} step={5} list="ppn-opts" value={e?.pricePerNight ?? 0} onChange={(ev) => set(dest.name, 'pricePerNight', +ev.target.value)} /></td>
            </tr>
          )
        })}
      </tbody>
    </table>
    </>
  )
}

function TourDays({ d, up, ref_ }: StepProps) {
  const ref = ref_!
  const presets = ref.dayPresets
  if (!presets.length) return null
  function addDay(p: DayPreset) {
    const uid = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID() : String(Date.now()) + Math.random()
    const day: QuotationDay = {
      uid, presetId: p.id, label: p.name, description: p.description, photo: p.photo,
      siteIds: [...p.site_ids], transferCounts: { ...p.transfer_counts }, includeGuide: p.include_guide,
    }
    up({ days: [...d.days, day] })
  }
  const removeDay = (uid: string) => up({ days: d.days.filter((x) => x.uid !== uid) })
  return (
    <section className="tour-days card">
      <h4>Quick tour days</h4>
      <p className="muted small">Add a ready-made day — its sites, transfer and guide are included automatically, and counted in the totals. Remove any time.</p>
      <div className="day-presets">
        {presets.map((p) => (
          <button key={p.id} type="button" className="day-chip-add" onClick={() => addDay(p)}>+ {p.name}</button>
        ))}
      </div>
      {d.days.length > 0 && (
        <div className="day-cards">
          {d.days.map((day, i) => (
            <div key={day.uid} className="day-card">
              {day.photo && <img src={`/images/tours/${day.photo}`} alt="" />}
              <div className="day-card-body">
                <b>Day {i + 1}: {day.label}</b>
                <span className="muted small">{day.siteIds.length} site(s){day.includeGuide ? ' · guide' : ''}</span>
              </div>
              <button type="button" className="link danger" onClick={() => removeDay(day.uid)}>Remove</button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function Sites({ d, up, ref_ }: StepProps) {
  const ref = ref_!
  const regions = ref.regions.filter((r) => r.kind === 'site')
  const daySites = new Set<number>()
  for (const day of d.days) for (const id of day.siteIds) daySites.add(id)
  function toggle(id: number) {
    up({ siteIds: d.siteIds.includes(id) ? d.siteIds.filter((x) => x !== id) : [...d.siteIds, id] })
  }
  return (
    <div className="pick-columns">
      {regions.map((reg) => {
        const sites = ref.sites.filter((s) => s.region_id === reg.id)
        if (!sites.length) return null
        return (
          <section key={reg.id}>
            <h4>{reg.name}</h4>
            {sites.map((s) => {
              const fromDay = daySites.has(s.id)
              const checked = fromDay || d.siteIds.includes(s.id)
              return (
                <label key={s.id} className={`check${fromDay ? ' locked' : ''}`}>
                  <input type="checkbox" checked={checked} disabled={fromDay} onChange={() => toggle(s.id)} />
                  <span>{s.name}{fromDay ? <em className="muted small"> (tour day)</em> : null}</span>
                  <em>{fmt(sitePrice(s, d.arrivalDate))} LE</em>
                </label>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}

function Transfers({ d, up, ref_ }: StepProps) {
  const ref = ref_!
  const regions = ref.regions.filter((r) => r.kind === 'trip')
  const pax = d.pax || 1
  const dayTransfers: Record<number, number> = {}
  for (const day of d.days) for (const [k, v] of Object.entries(day.transferCounts)) dayTransfers[+k] = (dayTransfers[+k] ?? 0) + v
  function setQty(id: number, qty: number) {
    up({ transferCounts: { ...d.transferCounts, [id]: Math.max(0, qty) } })
  }
  return (
    <div className="pick-columns">
      {regions.map((reg) => {
        const list = ref.transfers.filter((t) => t.region_id === reg.id)
        if (!list.length) return null
        return (
          <section key={reg.id}>
            <h4>{reg.name}</h4>
            {list.map((t) => {
              const qty = d.transferCounts[t.id] ?? 0
              const fromDay = dayTransfers[t.id] ?? 0
              const price = transferPrice(t, d.arrivalDate, pax, ref)
              return t.countable ? (
                <div key={t.id} className="check counter">
                  <button type="button" onClick={() => setQty(t.id, qty - 1)}>−</button>
                  <b>{qty}</b>
                  <button type="button" onClick={() => setQty(t.id, qty + 1)}>+</button>
                  <span>{t.name}{fromDay > 0 ? <em className="muted small"> +{fromDay} via tour day</em> : null}</span>
                  <em>{fmt(price)} LE</em>
                </div>
              ) : (
                <label key={t.id} className="check">
                  <input type="checkbox" checked={qty > 0} onChange={() => setQty(t.id, qty > 0 ? 0 : 1)} />
                  <span>{t.name}{fromDay > 0 ? <em className="muted small"> +{fromDay} via tour day</em> : null}</span>
                  <em>{fmt(price)} LE</em>
                </label>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}

function MealsServices({ d, up, ref_ }: StepProps) {
  const ref = ref_!
  const days = tripDays(d)
  const dayGuide = d.days.some((x) => x.includeGuide)
  function setMeal(id: number, qty: number) {
    up({ mealCounts: { ...d.mealCounts, [id]: Math.max(0, qty) } })
  }
  return (
    <div className="meals-services">
      <section>
        <h4>Meals (LE per meal)</h4>
        {ref.mealTiers.map((m) => {
          const qty = d.mealCounts[m.id] ?? 0
          return (
            <div key={m.id} className="check counter">
              <button type="button" onClick={() => setMeal(m.id, qty - 1)}>−</button>
              <b>{qty}</b>
              <button type="button" onClick={() => setMeal(m.id, qty + 1)}>+</button>
              <span>{m.price_le} LE meal</span>
              {qty > 0 && <em>{fmt(qty * m.price_le)} LE</em>}
            </div>
          )
        })}
      </section>
      <section>
        <h4>Services</h4>
        {ref.serviceRates.map((sr) => {
          const isGuide = sr.name === 'Guide'
          const lockedOn = isGuide && dayGuide
          const on = (isGuide ? d.includeGuide : sr.name === 'Rep' ? d.includeRep : false) || lockedOn
          const oDays = (isGuide ? d.guideDays : d.repDays) ?? days
          const oRate = (isGuide ? d.guideRate : d.repRate) ?? sr.rate_le_per_day
          return (
            <div key={sr.id} className="check">
              <input type="checkbox" checked={on} disabled={lockedOn}
                onChange={() => isGuide ? up({ includeGuide: !d.includeGuide }) : up({ includeRep: !d.includeRep })} />
              <span>{sr.name}{lockedOn ? <em className="muted small"> (tour day)</em> : null}</span>
              {on && <>
                <input type="number" min={0} value={oDays} style={{ width: 60 }}
                  onChange={(e) => up(isGuide ? { guideDays: +e.target.value } : { repDays: +e.target.value })} />
                <span className="muted small">days ×</span>
                <input type="number" min={0} value={oRate} style={{ width: 80 }}
                  onChange={(e) => up(isGuide ? { guideRate: +e.target.value } : { repRate: +e.target.value })} />
                <span className="muted small">LE/day</span>
                <em>{fmt(oDays * oRate)} LE</em>
              </>}
            </div>
          )
        })}
        <label>Guide ticket (LE)<input type="number" min={0} value={d.guideTicket} onChange={(e) => up({ guideTicket: +e.target.value })} /></label>
        <label>Guide accommodation (LE)<input type="number" min={0} value={d.guideAccommodation} onChange={(e) => up({ guideAccommodation: +e.target.value })} /></label>
      </section>
    </div>
  )
}

function Review({ d, ref_ }: { d: QuotationDraft; ref_: RefData }) {
  const ref = ref_
  const pax = d.pax || 1
  const eff = effectiveSelections(d)
  const sites = eff.siteIds.map((id) => ref.sites.find((s) => s.id === id)).filter(Boolean)
  const transfers = Object.entries(eff.transferCounts)
    .filter(([, q]) => q > 0)
    .map(([id, q]) => ({ t: ref.transfers.find((x) => x.id === +id)!, q }))
    .filter((x) => x.t)
  return (
    <div className="review">
      <p><b>{d.name}</b> · Ref {d.groupRef || '—'} · {pax} pax · {d.arrivalDate} → {d.departureDate}</p>
      {d.days.length > 0 && (
        <div className="review-days muted small">
          Tour days: {d.days.map((day, i) => `${i + 1}. ${day.label}`).join('  ·  ')}
        </div>
      )}
      <div className="review-cols">
        <section>
          <h4>Accommodation</h4>
          {d.accommodation.filter((a) => a.nights > 0 && a.pricePerNight > 0)
            .map((a) => <div key={a.destination}>{a.nights} nights {a.destination} — ${fmt(a.nights * a.pricePerNight)}</div>)}
        </section>
        <section>
          <h4>Sites ({sites.length})</h4>
          {d.flightTicket > 0 && <div>Flight Ticket — {fmt(d.flightTicket)} LE</div>}
          {sites.map((s) => <div key={s!.id}>{s!.name} — {fmt(sitePrice(s!, d.arrivalDate))} LE</div>)}
        </section>
        <section>
          <h4>Transfers</h4>
          {transfers.map(({ t, q }) => (
            <div key={t.id}>{q > 1 ? `${q}× ` : ''}{t.name} — {fmt(q * transferPrice(t, d.arrivalDate, pax, ref))} LE</div>
          ))}
        </section>
      </div>
    </div>
  )
}

async function saveQuotation(d: QuotationDraft, ref: RefData) {
  const { data: userData } = await supabase.auth.getUser()
  const uid = userData.user?.id
  if (!uid) throw new Error('Not signed in')
  const { data: q, error } = await supabase.from('q_quotations').insert({
    name: d.name.trim(),
    group_ref: d.groupRef,
    pax: d.pax,
    arrival_date: d.arrivalDate || null,
    departure_date: d.departureDate || null,
    exchange_rate: d.exchangeRate,
    estimate_profit: d.estimateProfit,
    flight_ticket: d.flightTicket || null,
    status: 'final',
    created_by: uid,
    draft: d,
  }).select('id').single()
  if (error) throw error

  const eff = effectiveSelections(d)
  const items: any[] = []
  let sort = 0
  for (const a of d.accommodation) {
    if (a.nights > 0 && a.pricePerNight > 0)
      items.push({ quotation_id: q.id, category: 'accommodation', label: `${a.nights} nights ${a.destination}`, quantity: a.nights, unit_price: a.pricePerNight, currency: 'USD', sort: sort++ })
  }
  for (const id of eff.siteIds) {
    const s = ref.sites.find((x) => x.id === id)
    if (s) items.push({ quotation_id: q.id, category: 'site', label: s.name, quantity: 1, unit_price: sitePrice(s, d.arrivalDate), currency: 'LE', sort: sort++ })
  }
  for (const [idStr, qty] of Object.entries(eff.transferCounts)) {
    if (qty <= 0) continue
    const t = ref.transfers.find((x) => x.id === +idStr)
    if (t) items.push({ quotation_id: q.id, category: 'transfer', label: t.name, quantity: qty, unit_price: transferPrice(t, d.arrivalDate, d.pax || 1, ref), currency: 'LE', sort: sort++ })
  }
  for (const [idStr, qty] of Object.entries(d.mealCounts)) {
    if (qty <= 0) continue
    const m = ref.mealTiers.find((x) => x.id === +idStr)
    if (m) items.push({ quotation_id: q.id, category: 'meal', label: `${m.price_le} LE meal`, quantity: qty, unit_price: m.price_le, currency: 'LE', sort: sort++ })
  }
  const days = tripDays(d)
  for (const sr of ref.serviceRates) {
    const isGuide = sr.name === 'Guide'
    const on = (isGuide && eff.includeGuide) || (sr.name === 'Rep' && d.includeRep)
    if (on) {
      const qDays = (isGuide ? d.guideDays : d.repDays) ?? days
      const qRate = (isGuide ? d.guideRate : d.repRate) ?? sr.rate_le_per_day
      items.push({ quotation_id: q.id, category: 'service', label: sr.name, quantity: qDays, unit_price: qRate, currency: 'LE', sort: sort++ })
    }
  }
  if (d.guideTicket > 0) items.push({ quotation_id: q.id, category: 'service', label: 'Guide Ticket', quantity: 1, unit_price: d.guideTicket, currency: 'LE', sort: sort++ })
  if (d.guideAccommodation > 0) items.push({ quotation_id: q.id, category: 'service', label: 'Guide Accommodation', quantity: 1, unit_price: d.guideAccommodation, currency: 'LE', sort: sort++ })

  if (items.length) {
    const { error: e2 } = await supabase.from('q_quotation_items').insert(items)
    if (e2) throw e2
  }
}
