import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { renderDocx, printHtml, fmtDate } from '../lib/docx'
import { downloadBlob } from '../lib/excel'

export interface VoucherData {
  hotelId: number | null
  hotelName: string; hotelAddress: string; hotelTel: string; hotelFax: string
  groupName: string; nationality: string
  fromDate: string; toDate: string
  singles: number; doubles: number; twins: number; triples: number
  guestNames: string[] // sequential: singles first, then doubles (2 each), twins (2), triples (3)
}

export const emptyVoucher = (): VoucherData => ({
  hotelId: null, hotelName: '', hotelAddress: '', hotelTel: '', hotelFax: '',
  groupName: '', nationality: '', fromDate: '', toDate: '',
  singles: 0, doubles: 0, twins: 0, triples: 0, guestNames: [],
})

interface Room { no: string; type: 'Single' | 'Double' | 'Twin' | 'Triple'; capacity: number; guests: string[] }

export function buildRooms(d: VoucherData): Room[] {
  const rooms: Room[] = []
  const kinds: ['Single' | 'Double' | 'Twin' | 'Triple', number, number][] = [
    ['Single', d.singles, 1], ['Double', d.doubles, 2], ['Twin', d.twins, 2], ['Triple', d.triples, 3],
  ]
  let n = 1, gi = 0
  for (const [type, count, cap] of kinds) {
    for (let i = 0; i < count; i++) {
      const guests: string[] = []
      for (let k = 0; k < cap; k++) guests.push(d.guestNames[gi++] ?? '')
      rooms.push({ no: `EGTO${n++}`, type, capacity: cap, guests })
    }
  }
  return rooms
}

export function nightsOf(d: VoucherData): number {
  if (!d.fromDate || !d.toDate) return 0
  return Math.max(0, Math.round((new Date(d.toDate).getTime() - new Date(d.fromDate).getTime()) / 86400000))
}

export async function generateVoucherDocx(d: VoucherData): Promise<Blob> {
  const rooms = buildRooms(d)
  return renderDocx('/templates/hotel_voucher_tpl.docx', {
    hotel_name: d.hotelName, hotel_address: d.hotelAddress,
    hotel_tel: d.hotelTel, hotel_fax: d.hotelFax,
    group_name: d.groupName, nationality: d.nationality,
    from_date: fmtDate(d.fromDate), to_date: fmtDate(d.toDate),
    nights: nightsOf(d),
    sgl: d.singles, dbl_twin: d.doubles + d.twins, tpl: d.triples,
    total_rooms: d.singles + d.doubles + d.twins + d.triples,
    rooms: rooms.map((r) => ({
      room_no: r.no, names: r.guests.filter(Boolean).join('\n'), type: r.type,
    })),
  })
}

export function printVoucher(d: VoucherData) {
  const rooms = buildRooms(d)
  const rows = rooms.map((r) =>
    `<tr><td>${r.no}</td><td>${r.guests.filter(Boolean).join('<br/>')}</td><td>${r.type}</td></tr>`).join('')
  printHtml('Hotel Voucher', `
    <div class="letterhead"><b>EGYPT TOP LIGHT TRAVEL</b><br/>
      20 B. El shams Buildings, behind LE MERIDIEN PYRAMIDS hotel Haram Street, Giza Egypt<br/>
      Tel : +20233778015, Fax : +20233778016<br/>
      E-Mail : Roqya@egypttoplight.net Website : www.egypttoplight.net</div>
    <h1>HOTEL VOUCHER</h1>
    <p>Hotel Name: ${d.hotelName}<br/>Hotel Address: ${d.hotelAddress}<br/>
       Tel: ${d.hotelTel}<br/>Fax: ${d.hotelFax}<br/>
       GUEST OR GROUP NAMES: ${d.groupName}<br/>NATIONALITY: ${d.nationality}</p>
    <table><tr><th>From Date</th><th>To Date</th><th>Night(s)</th><th>SGL(s)</th><th>TWIN(s)</th><th>TPL (s)</th><th>Total rooms</th></tr>
      <tr><td>${fmtDate(d.fromDate)}</td><td>${fmtDate(d.toDate)}</td><td>${nightsOf(d)}</td>
      <td>${d.singles}</td><td>${d.doubles + d.twins}</td><td>${d.triples}</td>
      <td>${d.singles + d.doubles + d.twins + d.triples}</td></tr></table>
    <table><tr><th>Room Number</th><th>Name of Guests in Room</th><th>Room Type</th></tr>${rows}</table>`)
}

export async function saveVoucher(d: VoucherData) {
  const { data: u } = await supabase.auth.getUser()
  if (!u.user) throw new Error('Not signed in')
  const { data: row, error } = await supabase.from('q_vouchers').insert({
    hotel_id: d.hotelId, hotel_name: d.hotelName, hotel_address: d.hotelAddress,
    hotel_tel: d.hotelTel, hotel_fax: d.hotelFax,
    guest_or_group_name: d.groupName, nationality: d.nationality,
    from_date: d.fromDate || null, to_date: d.toDate || null,
    singles: d.singles, doubles: d.doubles, twins: d.twins, triples: d.triples,
    created_by: u.user.id, data: d,
  }).select('id').single()
  if (error) throw error
  const rooms = buildRooms(d)
  const guests = rooms.flatMap((r, ri) =>
    r.guests.filter(Boolean).map((name, gi) => ({
      voucher_id: row.id, name, room_no: ri + 1, room_type: r.type, sort: ri * 10 + gi,
    })))
  if (guests.length) {
    const { error: e2 } = await supabase.from('q_voucher_guests').insert(guests)
    if (e2) throw e2
  }
}

interface Hotel { id: number; name: string; address: string; tel: string; fax: string }

export default function Voucher({ done, initial }: { done: () => void; initial?: VoucherData }) {
  const [d, setD] = useState<VoucherData>(initial ?? emptyVoucher())
  const [hotels, setHotels] = useState<Hotel[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const up = (p: Partial<VoucherData>) => setD((x) => ({ ...x, ...p }))

  useEffect(() => {
    supabase.from('q_hotels').select('*').order('name').then(({ data }) => setHotels(data ?? []))
  }, [])

  const rooms = useMemo(() => buildRooms(d), [d])
  const slots = rooms.reduce((s, r) => s + r.capacity, 0)

  function pickHotel(idStr: string) {
    if (!idStr) { up({ hotelId: null }); return }
    const h = hotels.find((x) => x.id === +idStr)
    if (h) up({ hotelId: h.id, hotelName: h.name, hotelAddress: h.address, hotelTel: h.tel, hotelFax: h.fax })
  }

  async function saveHotelToDirectory() {
    if (!d.hotelName.trim()) return
    const { data, error } = await supabase.from('q_hotels').insert({
      name: d.hotelName, address: d.hotelAddress, tel: d.hotelTel, fax: d.hotelFax,
    }).select('*').single()
    if (!error && data) { setHotels((h) => [...h, data]); up({ hotelId: data.id }) }
  }

  function setGuestName(index: number, name: string) {
    const names = [...d.guestNames]
    while (names.length < slots) names.push('')
    names[index] = name
    up({ guestNames: names })
  }

  async function generate(save: boolean) {
    setBusy(true); setError('')
    try {
      const blob = await generateVoucherDocx(d)
      if (save) await saveVoucher(d)
      downloadBlob(blob, 'HotelVoucher.docx')
      if (save) done()
    } catch (e: any) { setError(e.message ?? String(e)) }
    setBusy(false)
  }

  let slotIndex = 0

  return (
    <div className="doc-form">
      <h2>Hotel Voucher</h2>
      <div className="form-grid">
        <label>Hotel (directory)
          <select value={d.hotelId ?? ''} onChange={(e) => pickHotel(e.target.value)}>
            <option value="">— type manually —</option>
            {hotels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </label>
        <span />
        <label>Hotel name<input value={d.hotelName} onChange={(e) => up({ hotelName: e.target.value, hotelId: null })} /></label>
        <label>Hotel address<input value={d.hotelAddress} onChange={(e) => up({ hotelAddress: e.target.value })} /></label>
        <label>Hotel tel<input value={d.hotelTel} onChange={(e) => up({ hotelTel: e.target.value })} /></label>
        <label>Hotel fax<input value={d.hotelFax} onChange={(e) => up({ hotelFax: e.target.value })} /></label>
        <label>Guest / group name<input value={d.groupName} onChange={(e) => up({ groupName: e.target.value })} /></label>
        <label>Nationality<input value={d.nationality} onChange={(e) => up({ nationality: e.target.value })} /></label>
        <label>From date<input type="date" value={d.fromDate} onChange={(e) => up({ fromDate: e.target.value })} /></label>
        <label>To date<input type="date" value={d.toDate} onChange={(e) => up({ toDate: e.target.value })} /></label>
        <label>Single rooms<input type="number" min={0} value={d.singles} onChange={(e) => up({ singles: +e.target.value })} /></label>
        <label>Double rooms<input type="number" min={0} value={d.doubles} onChange={(e) => up({ doubles: +e.target.value })} /></label>
        <label>Twin rooms<input type="number" min={0} value={d.twins} onChange={(e) => up({ twins: +e.target.value })} /></label>
        <label>Triple rooms<input type="number" min={0} value={d.triples} onChange={(e) => up({ triples: +e.target.value })} /></label>
      </div>
      {!d.hotelId && d.hotelName.trim() && (
        <button className="link" onClick={saveHotelToDirectory}>Save "{d.hotelName}" to hotel directory</button>
      )}

      {rooms.length > 0 && (
        <>
          <h4>Guests per room ({nightsOf(d)} night(s), {rooms.length} rooms)</h4>
          <div className="table-scroll">
            <table className="grid-table wide">
              <thead><tr><th>Room</th><th>Type</th><th>Guest name(s)</th></tr></thead>
              <tbody>
                {rooms.map((r) => (
                  <tr key={r.no}>
                    <td>{r.no}</td>
                    <td>{r.type}</td>
                    <td>
                      {Array.from({ length: r.capacity }).map(() => {
                        const idx = slotIndex++
                        return (
                          <input key={idx} value={d.guestNames[idx] ?? ''} placeholder={`Guest ${idx + 1}`}
                            onChange={(e) => setGuestName(idx, e.target.value)} style={{ marginBottom: 4 }} />
                        )
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {error && <div className="error">{error}</div>}
      <div className="doc-actions">
        <button className="primary" disabled={busy} onClick={() => generate(true)}>
          {busy ? 'Working…' : 'Generate Word + Save'}
        </button>
        <button disabled={busy} onClick={() => printVoucher(d)}>Print / PDF</button>
        <button className="link" onClick={done}>Cancel</button>
      </div>
    </div>
  )
}
