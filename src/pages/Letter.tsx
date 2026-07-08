import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { renderDocx, printHtml, fmtDate, docxBlobToPdf } from '../lib/docx'
import { downloadBlob } from '../lib/excel'

export interface Guest {
  name: string; dob: string; passport: string; expiry: string; booking: string
}
export interface LetterData {
  to: string
  arrivalDate: string; arrivalFlight: string; arrivalTime: string
  departureDate: string; departureFlight: string; departureTime: string
  guests: Guest[]
}

const emptyGuest = (): Guest => ({ name: '', dob: '', passport: '', expiry: '', booking: '' })

export const emptyLetter = (): LetterData => ({
  to: '', arrivalDate: '', arrivalFlight: '', arrivalTime: '',
  departureDate: '', departureFlight: '', departureTime: '',
  guests: [emptyGuest()],
})

export function letterTemplateData(d: LetterData) {
  return {
    to: d.to,
    today: new Date().toLocaleDateString('en-GB'),
    pax: String(d.guests.length).padStart(2, '0'),
    arr_date: fmtDate(d.arrivalDate), dep_date: fmtDate(d.departureDate),
    arr_flight: d.arrivalFlight, dep_flight: d.departureFlight,
    arr_time: d.arrivalTime, dep_time: d.departureTime,
    guests: d.guests.map((g, i) => ({
      num: i + 1, name: g.name, dob: g.dob, passport: g.passport,
      expiry: g.expiry, booking: g.booking,
    })),
  }
}

export async function generateLetterDocx(d: LetterData): Promise<Blob> {
  return renderDocx('/templates/guarantee_letter_tpl.docx', letterTemplateData(d))
}

/** Guarantee letter as a PDF that mirrors the Word document. */
export async function letterToPdf(d: LetterData) {
  const docxBlob = await generateLetterDocx(d)
  const formData = new FormData()
  formData.append('File', docxBlob, 'GuaranteeLetter.docx')
  // Conversion runs through our serverless proxy so the ConvertAPI secret stays
  // server-side (Cloudflare Pages Function -> functions/api/convert.js).
  const response = await fetch('/api/convert', { method: 'POST', body: formData })
  if (!response.ok) throw new Error('PDF conversion failed. Please try again.')
  const pdfBlob = await response.blob()
  downloadBlob(pdfBlob, 'GuaranteeLetter.pdf')
}

export function printLetter(d: LetterData) {
  const rows = d.guests.map((g, i) =>
    `<tr><td>${i + 1}</td><td>${g.name}</td><td>${g.dob}</td><td>${g.passport}</td><td>${g.expiry}</td><td>${g.booking}</td></tr>`).join('')
  printHtml('Guarantee Letter', `
    <h1>GUARANTEE LETTER</h1>
    <p>To: ${d.to}</p>
    <p>From: Egypt Top Light Travel</p>
    <p>Date: ${new Date().toLocaleDateString('en-GB')}</p>
    <p>We Egypt Top Light Travel guarantee that our agent is fully responsible for all arrangements and
       expenses related to the ${String(d.guests.length).padStart(2, '0')} Client (as per below name list)
       and we bear full responsibility for them during their stay in Egypt.</p>
    <div class="cols"><span>Arrival Date: ${fmtDate(d.arrivalDate)}</span><span>Departure Date: ${fmtDate(d.departureDate)}</span></div>
    <div class="cols"><span>Arrival Flight Number: ${d.arrivalFlight}</span><span>Departure Flight Number: ${d.departureFlight}</span></div>
    <div class="cols"><span>Arrival Flight Time: ${d.arrivalTime}</span><span>Departure Flight Time: ${d.departureTime}</span></div>
    <table><tr><th>Guest Number</th><th>Name</th><th>Date of Birth</th><th>Passport Number</th><th>Passport Expiry</th><th>Booking Reference</th></tr>${rows}</table>
    <p>And this is a certification from our company To Whom It May Concern</p>
    <p>Best Regards<br/><br/>General Manager<br/>Omar Aly</p>`)
}

export async function saveLetter(d: LetterData) {
  const { data: u } = await supabase.auth.getUser()
  if (!u.user) throw new Error('Not signed in')
  const { data: row, error } = await supabase.from('q_letters').insert({
    consignee: d.to,
    arrival_date: d.arrivalDate || null,
    arrival_flight_no: d.arrivalFlight, arrival_flight_time: d.arrivalTime,
    departure_date: d.departureDate || null,
    departure_flight_no: d.departureFlight, departure_flight_time: d.departureTime,
    pax: d.guests.length,
    created_by: u.user.id,
    data: d,
  }).select('id').single()
  if (error) throw error
  const guests = d.guests.map((g, i) => ({
    letter_id: row.id, name: g.name, dob: g.dob, passport_no: g.passport,
    passport_expiry: g.expiry, booking_ref: g.booking, sort: i,
  }))
  if (guests.length) {
    const { error: e2 } = await supabase.from('q_letter_guests').insert(guests)
    if (e2) throw e2
  }
}

export default function Letter({ done, initial }: { done: () => void; initial?: LetterData }) {
  const [d, setD] = useState<LetterData>(initial ?? emptyLetter())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const up = (p: Partial<LetterData>) => setD((x) => ({ ...x, ...p }))
  const setGuest = (i: number, p: Partial<Guest>) =>
    setD((x) => ({ ...x, guests: x.guests.map((g, j) => (j === i ? { ...g, ...p } : g)) }))

  async function generate(save: boolean) {
    setBusy(true); setError('')
    try {
      const blob = await generateLetterDocx(d)
      if (save) await saveLetter(d)
      downloadBlob(blob, 'GuaranteeLetter.docx')
      if (save) done()
    } catch (e: any) { setError(e.message ?? String(e)) }
    setBusy(false)
  }

  return (
    <div className="doc-form">
      <h2>Guarantee Letter</h2>
      <div className="form-grid">
        <label>To (consignee)<input value={d.to} onChange={(e) => up({ to: e.target.value })} /></label>
        <span />
        <label>Arrival date<input type="date" value={d.arrivalDate} onChange={(e) => up({ arrivalDate: e.target.value })} /></label>
        <label>Departure date<input type="date" value={d.departureDate} onChange={(e) => up({ departureDate: e.target.value })} /></label>
        <label>Arrival flight no.<input value={d.arrivalFlight} onChange={(e) => up({ arrivalFlight: e.target.value })} /></label>
        <label>Departure flight no.<input value={d.departureFlight} onChange={(e) => up({ departureFlight: e.target.value })} /></label>
        <label>Arrival flight time<input value={d.arrivalTime} onChange={(e) => up({ arrivalTime: e.target.value })} /></label>
        <label>Departure flight time<input value={d.departureTime} onChange={(e) => up({ departureTime: e.target.value })} /></label>
      </div>

      <h4>Guests ({d.guests.length})</h4>
      <div className="table-scroll">
        <table className="grid-table wide">
          <thead><tr><th>#</th><th>Name</th><th>Date of birth</th><th>Passport no.</th><th>Passport expiry</th><th>Booking ref</th><th /></tr></thead>
          <tbody>
            {d.guests.map((g, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td><input value={g.name} onChange={(e) => setGuest(i, { name: e.target.value })} /></td>
                <td><input value={g.dob} onChange={(e) => setGuest(i, { dob: e.target.value })} placeholder="dd/mm/yyyy" /></td>
                <td><input value={g.passport} onChange={(e) => setGuest(i, { passport: e.target.value })} /></td>
                <td><input value={g.expiry} onChange={(e) => setGuest(i, { expiry: e.target.value })} placeholder="dd/mm/yyyy" /></td>
                <td><input value={g.booking} onChange={(e) => setGuest(i, { booking: e.target.value })} /></td>
                <td>{d.guests.length > 1 && (
                  <button className="link" onClick={() => setD((x) => ({ ...x, guests: x.guests.filter((_, j) => j !== i) }))}>remove</button>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={() => setD((x) => ({ ...x, guests: [...x.guests, emptyGuest()] }))}>+ Add guest</button>

      {error && <div className="error">{error}</div>}
      <div className="doc-actions">
        <button className="primary" disabled={busy} onClick={() => generate(true)}>
          {busy ? 'Working…' : 'Generate Word + Save'}
        </button>
        <button disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await letterToPdf(d) } catch (e: any) { setError(e.message ?? String(e)) } setBusy(false) }}>Download PDF</button>
        <button className="link" onClick={done}>Cancel</button>
      </div>
    </div>
  )
}
