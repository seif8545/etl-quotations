import { useEffect, useState } from 'react'
import { supabase, loadRefData } from '../lib/supabase'
import { generateQuotationXlsx, downloadBlob } from '../lib/excel'
import { generateLetterDocx, printLetter } from './Letter'
import type { LetterData } from './Letter'
import { generateVoucherDocx, printVoucher } from './Voucher'
import type { VoucherData } from './Voucher'
import PackageBuilder from './PackageBuilder'
import type { QuotationDraft } from '../lib/types'

const TABS = ['Quotations', 'Letters', 'Vouchers'] as const
type Tab = (typeof TABS)[number]

export default function Documents({ openQuotation }: { openQuotation: (d: QuotationDraft) => void }) {
  const [tab, setTab] = useState<Tab>('Quotations')
  const [rows, setRows] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)
  const [pdfDraft, setPdfDraft] = useState<QuotationDraft | null>(null)

  const table = tab === 'Quotations' ? 'q_quotations' : tab === 'Letters' ? 'q_letters' : 'q_vouchers'

  async function load() {
    const { data, error } = await supabase.from(table).select('*').order('created_at', { ascending: false })
    if (error) setError(error.message)
    else { setError(''); setRows(data ?? []) }
  }
  useEffect(() => { load() }, [tab])

  const visible = search
    ? rows.filter((r) => JSON.stringify(r).toLowerCase().includes(search.toLowerCase()))
    : rows

  async function excel(row: any) {
    if (!row.draft) { alert('This quotation was saved before drafts existed and cannot be re-exported.'); return }
    setBusyId(row.id)
    try {
      const ref = await loadRefData()
      const blob = await generateQuotationXlsx(row.draft, ref)
      downloadBlob(blob, `${row.name}.xlsx`)
    } catch (e: any) { setError(e.message ?? String(e)) }
    setBusyId(null)
  }

  async function saveAsPackage(row: any) {
    if (!row.draft) { alert('No draft stored for this quotation.'); return }
    const name = prompt('Package name:', row.name)
    if (!name) return
    const { data: u } = await supabase.auth.getUser()
    const draft = { ...row.draft, name: '', groupRef: '', arrivalDate: '', departureDate: '' }
    const { error } = await supabase.from('q_packages').insert({ name, draft, created_by: u.user!.id })
    if (error) setError(error.message)
    else alert(`Package "${name}" saved.`)
  }

  async function word(row: any) {
    setBusyId(row.id)
    try {
      const blob = tab === 'Letters'
        ? await generateLetterDocx(row.data as LetterData)
        : await generateVoucherDocx(row.data as VoucherData)
      downloadBlob(blob, tab === 'Letters' ? 'GuaranteeLetter.docx' : 'HotelVoucher.docx')
    } catch (e: any) { setError(e.message ?? String(e)) }
    setBusyId(null)
  }

  async function del(row: any) {
    if (!confirm('Delete this record?')) return
    const { error } = await supabase.from(table).delete().eq('id', row.id)
    if (error) setError(error.message)
    else load()
  }

  return (
    <div className="admin">
      <nav className="steps">
        {TABS.map((t) => (
          <button key={t} className={t === tab ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>
        ))}
      </nav>
      <div className="card admin-table">
        <div className="table-head">
          <h3>{tab} <span className="muted small">({rows.length})</span></h3>
          <input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {error && <div className="error">{error}</div>}
        <div className="table-scroll">
          <table className="grid-table">
            <thead>
              <tr>
                {tab === 'Quotations' && <><th>Name</th><th>Ref</th><th>Pax</th><th>Arrival</th><th>Departure</th></>}
                {tab === 'Letters' && <><th>To</th><th>Arrival</th><th>Departure</th><th>Pax</th></>}
                {tab === 'Vouchers' && <><th>Hotel</th><th>Group</th><th>From</th><th>To</th><th>Rooms</th></>}
                <th>Created</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} className={busyId === r.id ? 'saving' : ''}>
                  {tab === 'Quotations' && <><td>{r.name}</td><td>{r.group_ref}</td><td>{r.pax}</td><td>{r.arrival_date}</td><td>{r.departure_date}</td></>}
                  {tab === 'Letters' && <><td>{r.consignee}</td><td>{r.arrival_date}</td><td>{r.departure_date}</td><td>{r.pax}</td></>}
                  {tab === 'Vouchers' && <><td>{r.hotel_name}</td><td>{r.guest_or_group_name}</td><td>{r.from_date}</td><td>{r.to_date}</td><td>{r.singles + r.doubles + r.twins + r.triples}</td></>}
                  <td>{new Date(r.created_at).toLocaleDateString('en-GB')}</td>
                  <td className="actions">
                    {tab === 'Quotations' && <>
                      <button className="link" onClick={() => excel(r)}>Excel</button>
                      {r.draft && <button className="link" onClick={() => setPdfDraft(r.draft)}>Package PDF</button>}
                      {r.draft && <button className="link" onClick={() => openQuotation(r.draft)}>Open / Duplicate</button>}
                      {r.draft && <button className="link" onClick={() => saveAsPackage(r)}>Save as package</button>}
                    </>}
                    {tab !== 'Quotations' && r.data && <>
                      <button className="link" onClick={() => word(r)}>Word</button>
                      <button className="link" onClick={() => tab === 'Letters' ? printLetter(r.data) : printVoucher(r.data)}>Print/PDF</button>
                    </>}
                    <button className="link danger" onClick={() => del(r)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {pdfDraft && <PackageBuilder draft={pdfDraft} onClose={() => setPdfDraft(null)} />}
    </div>
  )
}
