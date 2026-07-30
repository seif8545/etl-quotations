import { useEffect, useState } from 'react'
import { supabase, loadRefData } from '../lib/supabase'
import { generateQuotationXlsx, downloadBlob } from '../lib/excel'
import { generateLetterDocx, letterToPdf } from './Letter'
import type { LetterData } from './Letter'
import { generateVoucherDocx, voucherToPdf } from './Voucher'
import type { VoucherData } from './Voucher'
import { generateInvoiceDocx, invoiceToPdf } from './Invoice'
import type { InvoiceData } from './Invoice'
import PackageBuilder from './PackageBuilder'
import type { PackageState } from './PackageBuilder'
import type { QuotationDraft } from '../lib/types'


/**
 * "10 days · 9 nights" for a package row.
 *
 * Prefers the stored overview, but a package saved before that was recomputed can
 * carry a stale or missing value — so fall back to the arrival/departure dates,
 * which are columns on the row and always current.
 */
function pkgDuration(r: any): string {
  const ov = r?.data?.overview
  let days = Number(ov?.days) || 0
  let nights = Number(ov?.nights) || 0
  if (!days && r?.arrival_date && r?.departure_date) {
    const a = Date.parse(r.arrival_date), b = Date.parse(r.departure_date)
    if (!isNaN(a) && !isNaN(b) && b >= a) {
      nights = Math.round((b - a) / 86400000)
      days = nights + 1
    }
  }
  if (!days && !nights) return '—'
  return `${days || nights + 1} days · ${nights || Math.max(0, days - 1)} nights`
}

/**
 * The headline price, so the list answers "how much is this one?" without opening it.
 *
 * Reads the tier table when there is one, honouring the package's own column choice —
 * a solo package priced on single occupancy would otherwise look free here. Falls back
 * to the single per-person figure.
 */
function pkgPrice(r: any): string {
  const d = r?.data
  if (!d) return '—'
  const rows: any[] = Array.isArray(d.priceRows) ? d.priceRows : []
  const keys: string[] = d.priceColumns && d.priceColumns !== 'all'
    ? [d.priceColumns]
    : ['dbl', 'triple', 'quad']
  const tiers = rows
    .flatMap((x) => keys.map((k) => Number(x?.[k])))
    .filter((n) => Number.isFinite(n) && n > 0)
  if (d.priceTableOn && tiers.length) {
    const low = Math.min(...tiers)
    return tiers.length > 1 ? `from $${low.toLocaleString()}` : `$${low.toLocaleString()}`
  }
  const pp = Number(d.pp)
  return Number.isFinite(pp) && pp > 0 ? `$${pp.toLocaleString()}` : '—'
}

const TABS = ['Quotations', 'Packages', 'Letters', 'Vouchers', 'Invoices'] as const
type Tab = (typeof TABS)[number]

export default function Documents({ openQuotation, isAdmin, uid }: { openQuotation: (d: QuotationDraft) => void; isAdmin: boolean; uid: string }) {
  const [tab, setTab] = useState<Tab>('Quotations')
  const [rows, setRows] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)
  const [pdfDraft, setPdfDraft] = useState<QuotationDraft | null>(null)
  const [savedPkg, setSavedPkg] = useState<PackageState | null>(null)
  const [savedPkgId, setSavedPkgId] = useState<number | null>(null)
  const [agents, setAgents] = useState<{ id: string; full_name: string; email: string }[]>([])
  const [shareRow, setShareRow] = useState<any | null>(null)

  const table = tab === 'Quotations' ? 'q_quotations' : tab === 'Packages' ? 'q_package_docs' : tab === 'Letters' ? 'q_letters' : tab === 'Vouchers' ? 'q_vouchers' : 'q_invoices'

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
        : tab === 'Vouchers'
        ? await generateVoucherDocx(row.data as VoucherData)
        : await generateInvoiceDocx(row.data as InvoiceData, row.serial)
      downloadBlob(blob, tab === 'Letters' ? 'GuaranteeLetter.docx' : tab === 'Vouchers' ? 'HotelVoucher.docx' : 'Invoice.docx')
    } catch (e: any) { setError(e.message ?? String(e)) }
    setBusyId(null)
  }

  const docLabel = (r: any) => r.name || r.consignee || r.hotel_name || r.client_name || r.serial || `#${r.id}`

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
                {tab === 'Packages' && <><th>Name</th><th>Duration</th><th>Price</th><th>Ref</th><th>Pax</th><th>Arrival</th><th>Departure</th></>}
                {tab === 'Letters' && <><th>To</th><th>Arrival</th><th>Departure</th><th>Pax</th></>}
                {tab === 'Vouchers' && <><th>Hotel</th><th>Group</th><th>From</th><th>To</th><th>Rooms</th></>}
                {tab === 'Invoices' && <><th>Serial</th><th>Client</th><th>Issue date</th><th>Total</th><th>Balance</th></>}
                <th>Created</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} className={busyId === r.id ? 'saving' : ''}>
                  {tab === 'Quotations' && <><td>{r.name}</td><td>{r.group_ref}</td><td>{r.pax}</td><td>{r.arrival_date}</td><td>{r.departure_date}</td></>}
                  {tab === 'Packages' && <><td>{r.name}</td><td className="pkg-dur">{pkgDuration(r)}</td><td className="pkg-price">{pkgPrice(r)}</td><td>{r.group_ref}</td><td>{r.pax}</td><td>{r.arrival_date}</td><td>{r.departure_date}</td></>}
                  {tab === 'Letters' && <><td>{r.consignee}</td><td>{r.arrival_date}</td><td>{r.departure_date}</td><td>{r.pax}</td></>}
                  {tab === 'Vouchers' && <><td>{r.hotel_name}</td><td>{r.guest_or_group_name}</td><td>{r.from_date}</td><td>{r.to_date}</td><td>{r.singles + r.doubles + r.twins + r.triples}</td></>}
                  {tab === 'Invoices' && <><td>{r.serial}</td><td>{r.client_name}</td><td>{r.issue_date}</td><td>{r.total}</td><td>{r.balance ?? '—'}</td></>}
                  <td>{new Date(r.created_at).toLocaleDateString('en-GB')}</td>
                  <td className="actions">
                    {tab === 'Quotations' && <>
                      <button className="link" onClick={() => excel(r)}>Excel</button>
                      {r.draft && <button className="link" onClick={() => setPdfDraft(r.draft)}>Package PDF</button>}
                      {r.draft && <button className="link" onClick={() => openQuotation(r.draft)}>Open / Duplicate</button>}
                      {r.draft && <button className="link" onClick={() => saveAsPackage(r)}>Save as package</button>}
                    </>}
                    {tab === 'Packages' && r.data && (
                      <button className="link" onClick={() => { setSavedPkg(r.data as PackageState); setSavedPkgId(r.id) }}>Open / Export</button>
                    )}
                    {(tab === 'Letters' || tab === 'Vouchers' || tab === 'Invoices') && r.data && <>
                      <button className="link" onClick={() => word(r)}>Word</button>
                      <button className="link" onClick={() => (
                        tab === 'Letters' ? letterToPdf(r.data) : tab === 'Vouchers' ? voucherToPdf(r.data) : invoiceToPdf(r.data, r.serial)
                      ).catch((e: any) => setError(e.message ?? String(e)))}>PDF</button>
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
      {savedPkg && <PackageBuilder saved={savedPkg} savedId={savedPkgId ?? undefined} onClose={() => { setSavedPkg(null); setSavedPkgId(null); load() }} />}
    </div>
  )
}
