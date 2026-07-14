import { useEffect, useState } from 'react'
import { supabase, loadRefData } from '../lib/supabase'
import { generateQuotationXlsx, downloadBlob } from '../lib/excel'
import { generateLetterDocx, letterToPdf } from './Letter'
import type { LetterData } from './Letter'
import { generateVoucherDocx, voucherToPdf } from './Voucher'
import type { VoucherData } from './Voucher'
import PackageBuilder from './PackageBuilder'
import type { PackageState } from './PackageBuilder'
import type { QuotationDraft } from '../lib/types'

const TABS = ['Quotations', 'Packages', 'Letters', 'Vouchers'] as const
type Tab = (typeof TABS)[number]

export default function Documents({ openQuotation, isAdmin, uid }: { openQuotation: (d: QuotationDraft) => void; isAdmin: boolean; uid: string }) {
  const [tab, setTab] = useState<Tab>('Quotations')
  const [rows, setRows] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)
  const [pdfDraft, setPdfDraft] = useState<QuotationDraft | null>(null)
  const [savedPkg, setSavedPkg] = useState<PackageState | null>(null)
  const [agents, setAgents] = useState<{ id: string; full_name: string; email: string }[]>([])
  const [shareRow, setShareRow] = useState<any | null>(null)

  const table = tab === 'Quotations' ? 'q_quotations' : tab === 'Packages' ? 'q_package_docs' : tab === 'Letters' ? 'q_letters' : 'q_vouchers'

  async function load() {
    const { data, error } = await supabase.from(table).select('*').order('created_at', { ascending: false })
    if (error) setError(error.message)
    else { setError(''); setRows(data ?? []) }
  }
  useEffect(() => { load() }, [tab])

  useEffect(() => {
    if (!isAdmin) return
    supabase.from('q_profiles').select('id, full_name, email').neq('role', 'admin').order('email')
      .then(({ data }) => setAgents(data ?? []))
  }, [isAdmin])

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

  const docLabel = (r: any) => r.name || r.consignee || r.hotel_name || `#${r.id}`

  async function toggleShare(personId: string) {
    if (!shareRow) return
    const cur: string[] = shareRow.shared_with ?? []
    const next = cur.includes(personId) ? cur.filter((x) => x !== personId) : [...cur, personId]
    const { error } = await supabase.from(table).update({ shared_with: next }).eq('id', shareRow.id)
    if (error) { setError(error.message); return }
    const upd = { ...shareRow, shared_with: next }
    setShareRow(upd)
    setRows((rs) => rs.map((r) => (r.id === upd.id ? upd : r)))
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
                {tab === 'Packages' && <><th>Name</th><th>Ref</th><th>Pax</th><th>Arrival</th><th>Departure</th></>}
                {tab === 'Letters' && <><th>To</th><th>Arrival</th><th>Departure</th><th>Pax</th></>}
                {tab === 'Vouchers' && <><th>Hotel</th><th>Group</th><th>From</th><th>To</th><th>Rooms</th></>}
                <th>Created</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} className={busyId === r.id ? 'saving' : ''}>
                  {tab === 'Quotations' && <><td>{r.name}</td><td>{r.group_ref}</td><td>{r.pax}</td><td>{r.arrival_date}</td><td>{r.departure_date}</td></>}
                  {tab === 'Packages' && <><td>{r.name}</td><td>{r.group_ref}</td><td>{r.pax}</td><td>{r.arrival_date}</td><td>{r.departure_date}</td></>}
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
                    {tab === 'Packages' && r.data && (
                      <button className="link" onClick={() => setSavedPkg(r.data as PackageState)}>Open / Export</button>
                    )}
                    {(tab === 'Letters' || tab === 'Vouchers') && r.data && <>
                      <button className="link" onClick={() => word(r)}>Word</button>
                      <button className="link" onClick={() => (tab === 'Letters' ? letterToPdf(r.data) : voucherToPdf(r.data)).catch((e: any) => setError(e.message ?? String(e)))}>PDF</button>
                    </>}
                    {isAdmin && (
                      <button className="link" onClick={() => setShareRow(r)}>
                        {(r.shared_with?.length ?? 0) > 0 ? `Shared (${r.shared_with.length})` : 'Share…'}
                      </button>
                    )}
                    {!isAdmin && r.created_by !== uid && <span className="share-tag">Shared with you</span>}
                    {(isAdmin || r.created_by === uid) && (
                      <button className="link danger" onClick={() => del(r)}>Delete</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {shareRow && (
        <div className="picker-overlay" onClick={() => setShareRow(null)}>
          <div className="picker share-card" onClick={(e) => e.stopPropagation()}>
            <div className="picker-head"><b>Share “{docLabel(shareRow)}”</b><button onClick={() => setShareRow(null)}>×</button></div>
            <div className="share-body">
              <p className="muted small">Anyone selected can see, open and export this document. Only you can change or delete it.</p>
              {agents.length === 0 && <p className="muted">No non-admin users found.</p>}
              {agents.map((a) => {
                const on = ((shareRow.shared_with ?? []) as string[]).includes(a.id)
                return (
                  <label key={a.id} className={on ? 'share-person on' : 'share-person'}>
                    <input type="checkbox" checked={on} onChange={() => toggleShare(a.id)} />
                    <span className="share-name">{a.full_name || a.email}</span>
                    {a.full_name && <span className="muted small">{a.email}</span>}
                  </label>
                )
              })}
            </div>
          </div>
        </div>
      )}
      {pdfDraft && <PackageBuilder draft={pdfDraft} onClose={() => { setPdfDraft(null); load() }} />}
      {savedPkg && <PackageBuilder saved={savedPkg} onClose={() => { setSavedPkg(null); load() }} />}
    </div>
  )
}
