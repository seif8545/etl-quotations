import { useEffect, useState } from 'react'
import { loadRefData } from '../lib/supabase'
import { computeTotals } from '../lib/pricing'
import { getPdfMake, imageToDataURL } from '../lib/pdf'
import type { QuotationDraft, RefData } from '../lib/types'

interface EditableDay { uid: string; title: string; description: string; photo: string; sites: string[] }

/**
 * Client-facing package PDF builder. Opens an editable preview of a quotation's
 * itinerary (cover + day cards + price), lets the user reorder days, swap photos
 * and edit text, then exports a branded one-click PDF via pdfmake.
 */
export default function PackageBuilder({ draft, onClose }: { draft: QuotationDraft; onClose: () => void }) {
  const [ref, setRef] = useState<RefData | null>(null)
  const [title, setTitle] = useState(draft.name || 'Egypt Travel Package')
  const [intro, setIntro] = useState('We are delighted to present the following tailor-made programme for your journey through Egypt.')
  const [hero, setHero] = useState('cairo-giza/gem-pyramids.jpeg')
  const [days, setDays] = useState<EditableDay[]>([])
  const [pp, setPp] = useState(0)
  const [sgl, setSgl] = useState(0)
  const [showPrice, setShowPrice] = useState(true)
  const [manifest, setManifest] = useState<Record<string, string[]>>({})
  const [picker, setPicker] = useState<{ target: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadRefData().then((r) => {
      setRef(r)
      const nameOf = (id: number) => r.sites.find((s) => s.id === id)?.name ?? ''
      setDays(draft.days.map((d) => ({
        uid: d.uid, title: d.label, description: d.description, photo: d.photo,
        sites: d.siteIds.map(nameOf).filter(Boolean),
      })))
      if (draft.days[0]?.photo) setHero(draft.days[0].photo)
      const t = computeTotals(draft, r)
      setPp(Math.round(t.perPersonDBL))
      setSgl(Math.round(t.sglSupplementUSD))
    }).catch((e) => setError(e.message ?? String(e)))
    fetch('/images/tours/manifest.json').then((r) => r.json()).then(setManifest).catch(() => {})
  }, [])

  const hotels = draft.accommodation.filter((a) => a.nights > 0)

  function move(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= days.length) return
    const copy = days.slice()
    const tmp = copy[i]; copy[i] = copy[j]; copy[j] = tmp
    setDays(copy)
  }
  const updateDay = (uid: string, patch: Partial<EditableDay>) =>
    setDays((ds) => ds.map((d) => (d.uid === uid ? { ...d, ...patch } : d)))
  const removeDay = (uid: string) => setDays((ds) => ds.filter((d) => d.uid !== uid))

  function pickPhoto(photo: string) {
    if (!picker) return
    if (picker.target === 'hero') setHero(photo)
    else updateDay(picker.target, { photo })
    setPicker(null)
  }

  async function exportPdf() {
    setBusy(true); setError('')
    try {
      const pdfMake = await getPdfMake()
      const images: Record<string, string> = {}
      const reg = async (path: string, key: string) => {
        if (!path) return
        try { images[key] = await imageToDataURL(path) } catch { /* skip missing */ }
      }
      await reg('/images/logo.png', 'logo')
      await reg('/images/tours/' + hero, 'hero')
      for (let i = 0; i < days.length; i++) {
        if (days[i].photo) await reg('/images/tours/' + days[i].photo, 'day' + i)
      }

      const content: any[] = []
      if (images.logo) content.push({ image: 'logo', width: 130, alignment: 'center', margin: [0, 0, 0, 10] })
      if (images.hero) content.push({ image: 'hero', width: 515, margin: [0, 0, 0, 12] })
      content.push({ text: title, style: 'title' })
      const info: string[] = []
      if (draft.groupRef) info.push('Ref: ' + draft.groupRef)
      info.push(draft.pax + ' pax')
      if (draft.arrivalDate) info.push(draft.arrivalDate + (draft.departureDate ? '  →  ' + draft.departureDate : ''))
      content.push({ text: info.join('   ·   '), style: 'sub', margin: [0, 0, 0, 10] })
      if (intro) content.push({ text: intro, margin: [0, 0, 0, 4] })

      days.forEach((d, i) => {
        content.push({ text: `Day ${i + 1}: ${d.title}`, style: 'dayTitle', margin: [0, 16, 0, 6] })
        if (images['day' + i]) content.push({ image: 'day' + i, width: 515, margin: [0, 0, 0, 6] })
        if (d.description) content.push({ text: d.description, margin: [0, 0, 0, 4] })
        if (d.sites.length) content.push({ text: [{ text: 'Highlights: ', bold: true }, d.sites.join(', ')] })
      })

      if (hotels.length) {
        content.push({ text: 'Accommodation', style: 'dayTitle', margin: [0, 16, 0, 6] })
        content.push({ ul: hotels.map((h) => `${h.nights} night${h.nights > 1 ? 's' : ''} — ${h.destination}`) })
      }
      if (showPrice) {
        content.push({ text: 'Package Price', style: 'dayTitle', margin: [0, 16, 0, 6] })
        content.push({ text: `Per person (sharing double room): $${pp.toLocaleString()}`, fontSize: 13 })
        if (sgl > 0) content.push({ text: `Single room supplement: $${sgl.toLocaleString()}`, margin: [0, 2, 0, 0] })
      }

      const docDefinition = {
        content,
        images,
        defaultStyle: { fontSize: 11, color: '#222222', lineHeight: 1.25 },
        styles: {
          title: { fontSize: 24, bold: true, color: '#1a3c5e', margin: [0, 0, 0, 2] },
          sub: { fontSize: 11, color: '#666666' },
          dayTitle: { fontSize: 15, bold: true, color: '#1a3c5e' },
        },
        pageMargins: [40, 40, 40, 55],
        footer: (cur: number, total: number) => ({
          columns: [
            { text: 'Egypt Top Light Travel', margin: [40, 0, 0, 0], fontSize: 9, color: '#999999' },
            { text: `${cur} / ${total}`, alignment: 'right', margin: [0, 0, 40, 0], fontSize: 9, color: '#999999' },
          ],
        }),
      }
      const safe = (title || 'package').replace(/[^\w\-]+/g, '_')
      pdfMake.createPdf(docDefinition).download(`${safe}.pdf`)
    } catch (e: any) {
      setError(e.message ?? String(e))
    }
    setBusy(false)
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

          {days.map((d, i) => (
            <section key={d.uid} className="b-day">
              <div className="b-day-head">
                <b>Day {i + 1}</b>
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
          {days.length === 0 && <p className="muted">This quotation has no tour days yet. Add tour-day presets when building the quotation to get a day-by-day itinerary — you can still export the cover and price.</p>}

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
