import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { renderDocx, fmtDate, docxBlobToPdf } from '../lib/docx'
import { downloadBlob } from '../lib/excel'

/** One priced line item: a free-text label + a number rate (Extra Details / Deductions). */
export interface RateItem { label: string; rate: number }

export interface InvoiceData {
  issueDate: string // yyyy-mm-dd, defaults to date of creation
  clientName: string      // optional
  clientDetails: string   // optional
  inclusions: string      // optional, big text block
  singleCount: number; singleRate: number
  doubleCount: number; doubleRate: number
  tripleCount: number; tripleRate: number
  extras: RateItem[]      // "Extra Details" — starts with one row, + to add more
  deductions: RateItem[]  // optional rows below TOTAL, subtract from the total
}

const todayISO = () => new Date().toISOString().slice(0, 10)

export const emptyInvoice = (): InvoiceData => ({
  issueDate: todayISO(),
  clientName: '',
  clientDetails: '',
  inclusions: '',
  singleCount: 0, singleRate: 0,
  doubleCount: 0, doubleRate: 0,
  tripleCount: 0, tripleRate: 0,
  extras: [{ label: '', rate: 0 }],
  deductions: [],
})

/** yyyymmdd from an ISO (yyyy-mm-dd) date string. */
function yyyymmdd(iso: string): string {
  if (!iso) return ''
  return iso.split('-').join('')
}

/**
 * Serial Number.
 * Spec: yyyymmdd + number-of-guests + last 3 digits of the hotel number.
 * The guest-count and hotel-number segments are deferred (no hotel field
 * exists on this form yet, and "number of guests" was flagged "(later)" —
 * see project handoff). For now the date is followed by a running,
 * per-day sequence number so serials stay unique and sortable; once the
 * guest-count / hotel-number sources are defined, splice their segments in
 * between `datePart` and `seq` below.
 */
export function serialOf(issueDate: string, seq: number): string {
  const datePart = yyyymmdd(issueDate) || '00000000'
  // TODO(serial): insert number-of-guests segment here
  // TODO(serial): insert last-3-digits-of-hotel-number segment here
  return `${datePart}-${String(seq).padStart(3, '0')}`
}

export function extrasTotal(items: RateItem[]): number {
  return items.reduce((s, x) => s + (Number(x.rate) || 0), 0)
}

export function invoiceTotal(d: InvoiceData): number {
  return (
    d.singleCount * d.singleRate +
    d.doubleCount * d.doubleRate +
    d.tripleCount * d.tripleRate +
    extrasTotal(d.extras)
  )
}

export function deductionsTotal(d: InvoiceData): number {
  return extrasTotal(d.deductions)
}

/** Balance only exists (and is only shown) once at least one deduction row is present. */
export function invoiceBalance(d: InvoiceData): number | null {
  if (d.deductions.length === 0) return null
  return invoiceTotal(d) - deductionsTotal(d)
}

const usd = (n: number) => `${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} USD`

/** How many invoices already carry this issue date, so the serial's running
 *  sequence keeps incrementing per day rather than colliding. */
async function nextSeqForDate(issueDate: string): Promise<number> {
  if (!issueDate) return 1
  const { count } = await supabase
    .from('q_invoices')
    .select('id', { count: 'exact', head: true })
    .eq('issue_date', issueDate)
  return (count ?? 0) + 1
}

function guestRows(d: InvoiceData) {
  const rows: { label: string; count: number; rate: number; amount: number }[] = []
  if (d.singleCount > 0) rows.push({ label: 'Guests in Single Occupancy', count: d.singleCount, rate: d.singleRate, amount: d.singleCount * d.singleRate })
  if (d.doubleCount > 0) rows.push({ label: 'Guests in Double/Twin Sharing', count: d.doubleCount, rate: d.doubleRate, amount: d.doubleCount * d.doubleRate })
  if (d.tripleCount > 0) rows.push({ label: 'Guests in Triple Sharing', count: d.tripleCount, rate: d.tripleRate, amount: d.tripleCount * d.tripleRate })
  return rows
}

/** Build the docxtemplater data for /templates/invoice_tpl.docx — a real copy of
 *  "Invoice example.docx" (logo, brand colors, bank block, footer all preserved)
 *  with the editable fields swapped for template tags. See handoff notes for the
 *  tag map: header has {issue_date}/{serial}; client card has {client_name}/
 *  {client_details}; the item table is a docxtemplater row-loop over `items`
 *  (guests + extras, each with an optional per-row {inclusions} line); `deductions`
 *  is a second row-loop; `balance` is a 0-or-1-item array so the Balance row only
 *  renders once a deduction exists. */
export function invoiceTemplateData(d: InvoiceData, serial: string) {
  const items = [
    ...guestRows(d).map((r) => ({
      label: `${String(r.count).padStart(2, '0')} ${r.label} * ${r.rate.toLocaleString()} USD`,
      amount: usd(r.amount),
      inclusions: d.inclusions.trim(),
      hasInclusions: !!d.inclusions.trim(),
    })),
    ...d.extras
      .filter((x) => x.label.trim() || x.rate)
      .map((x) => ({
        label: x.label,
        amount: usd(x.rate),
        inclusions: d.inclusions.trim(),
        hasInclusions: !!d.inclusions.trim(),
      })),
  ]
  const deductions = d.deductions
    .filter((x) => x.label.trim() || x.rate)
    .map((x) => ({ label: x.label, amount: usd(x.rate) }))
  const balance = invoiceBalance(d)

  return {
    issue_date: fmtDate(d.issueDate),
    serial,
    client_name: d.clientName,
    client_details: d.clientDetails,
    items,
    total: usd(invoiceTotal(d)),
    deductions,
    balance: balance !== null ? [{ amount: usd(balance) }] : [],
  }
}

export async function generateInvoiceDocx(d: InvoiceData, serial: string): Promise<Blob> {
  return renderDocx('/templates/invoice_tpl.docx', invoiceTemplateData(d, serial))
}

/** Invoice as a PDF that mirrors the Word document. */
export async function invoiceToPdf(d: InvoiceData, serial: string) {
  const blob = await generateInvoiceDocx(d, serial)
  await docxBlobToPdf(blob, 'Invoice.pdf')
}

export async function saveInvoice(d: InvoiceData, serial: string) {
  const { data: u } = await supabase.auth.getUser()
  if (!u.user) throw new Error('Not signed in')
  const { error } = await supabase.from('q_invoices').insert({
    serial,
    issue_date: d.issueDate || null,
    client_name: d.clientName,
    client_details: d.clientDetails,
    total: invoiceTotal(d),
    balance: invoiceBalance(d),
    created_by: u.user.id,
    data: d,
  })
  if (error) throw error
}

function up<T>(setter: (fn: (x: T) => T) => void, patch: Partial<T>) {
  setter((x) => ({ ...x, ...patch }))
}

export default function Invoice({ done, initial }: { done: () => void; initial?: InvoiceData }) {
  const [d, setD] = useState<InvoiceData>(initial ?? emptyInvoice())
  const [seq, setSeq] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const patch = (p: Partial<InvoiceData>) => up<InvoiceData>(setD, p)

  useEffect(() => {
    let cancelled = false
    nextSeqForDate(d.issueDate).then((n) => { if (!cancelled) setSeq(n) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.issueDate])

  const serial = serialOf(d.issueDate, seq)
  const total = invoiceTotal(d)
  const balance = invoiceBalance(d)

  const setExtra = (i: number, p: Partial<RateItem>) =>
    setD((x) => ({ ...x, extras: x.extras.map((r, j) => (j === i ? { ...r, ...p } : r)) }))
  const setDeduction = (i: number, p: Partial<RateItem>) =>
    setD((x) => ({ ...x, deductions: x.deductions.map((r, j) => (j === i ? { ...r, ...p } : r)) }))

  async function generate(save: boolean) {
    setBusy(true); setError('')
    try {
      const blob = await generateInvoiceDocx(d, serial)
      if (save) await saveInvoice(d, serial)
      downloadBlob(blob, 'Invoice.docx')
      if (save) done()
    } catch (e: any) { setError(e.message ?? String(e)) }
    setBusy(false)
  }

  async function downloadPdf() {
    setBusy(true); setError('')
    try { await invoiceToPdf(d, serial) } catch (e: any) { setError(e.message ?? String(e)) }
    setBusy(false)
  }

  return (
    <div className="doc-form">
      <h2>Invoice</h2>
      <div className="form-grid">
        <label>Issue date<input type="date" value={d.issueDate} onChange={(e) => patch({ issueDate: e.target.value })} /></label>
        <label>Serial number<input value={serial} disabled /></label>
        <label>Client name <span className="muted small">(optional)</span>
          <input value={d.clientName} onChange={(e) => patch({ clientName: e.target.value })} /></label>
        <span />
        <label style={{ gridColumn: '1 / -1' }}>Client details <span className="muted small">(optional)</span>
          <textarea rows={2} value={d.clientDetails} onChange={(e) => patch({ clientDetails: e.target.value })} /></label>
        <label style={{ gridColumn: '1 / -1' }}>Inclusions <span className="muted small">(optional)</span>
          <textarea rows={4} value={d.inclusions} onChange={(e) => patch({ inclusions: e.target.value })} /></label>
      </div>

      <h4>Guests</h4>
      <div className="table-scroll">
        <table className="grid-table wide">
          <thead><tr><th>Category</th><th>Number of guests</th><th>Rate per guest (USD)</th><th>Subtotal</th></tr></thead>
          <tbody>
            <tr>
              <td>Single</td>
              <td><input type="number" min={0} value={d.singleCount} onChange={(e) => patch({ singleCount: +e.target.value })} /></td>
              <td><input type="number" min={0} value={d.singleRate} onChange={(e) => patch({ singleRate: +e.target.value })} /></td>
              <td>{usd(d.singleCount * d.singleRate)}</td>
            </tr>
            <tr>
              <td>Double</td>
              <td><input type="number" min={0} value={d.doubleCount} onChange={(e) => patch({ doubleCount: +e.target.value })} /></td>
              <td><input type="number" min={0} value={d.doubleRate} onChange={(e) => patch({ doubleRate: +e.target.value })} /></td>
              <td>{usd(d.doubleCount * d.doubleRate)}</td>
            </tr>
            <tr>
              <td>Triple</td>
              <td><input type="number" min={0} value={d.tripleCount} onChange={(e) => patch({ tripleCount: +e.target.value })} /></td>
              <td><input type="number" min={0} value={d.tripleRate} onChange={(e) => patch({ tripleRate: +e.target.value })} /></td>
              <td>{usd(d.tripleCount * d.tripleRate)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h4>Extra details</h4>
      <div className="table-scroll">
        <table className="grid-table wide">
          <thead><tr><th>Description</th><th>Rate (USD)</th><th /></tr></thead>
          <tbody>
            {d.extras.map((x, i) => (
              <tr key={i}>
                <td><input value={x.label} placeholder="e.g. Extra bed" onChange={(e) => setExtra(i, { label: e.target.value })} /></td>
                <td><input type="number" value={x.rate} onChange={(e) => setExtra(i, { rate: +e.target.value })} /></td>
                <td>{d.extras.length > 1 && (
                  <button className="link" onClick={() => setD((s) => ({ ...s, extras: s.extras.filter((_, j) => j !== i) }))}>remove</button>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={() => setD((s) => ({ ...s, extras: [...s.extras, { label: '', rate: 0 }] }))}>+ Add extra detail</button>

      <div className="totals" style={{ maxWidth: 420 }}>
        <div className="grand"><span>TOTAL</span><b>{usd(total)}</b></div>
      </div>

      <h4>Deductions <span className="muted small">(optional — e.g. deposits already paid)</span></h4>
      <div className="table-scroll">
        <table className="grid-table wide">
          <thead><tr><th>Description</th><th>Amount (USD)</th><th /></tr></thead>
          <tbody>
            {d.deductions.map((x, i) => (
              <tr key={i}>
                <td><input value={x.label} placeholder="e.g. Paid deposit" onChange={(e) => setDeduction(i, { label: e.target.value })} /></td>
                <td><input type="number" value={x.rate} onChange={(e) => setDeduction(i, { rate: +e.target.value })} /></td>
                <td><button className="link" onClick={() => setD((s) => ({ ...s, deductions: s.deductions.filter((_, j) => j !== i) }))}>remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={() => setD((s) => ({ ...s, deductions: [...s.deductions, { label: '', rate: 0 }] }))}>+ Add deduction</button>

      {balance !== null && (
        <div className="totals" style={{ maxWidth: 420 }}>
          <div className="grand"><span>Balance</span><b>{usd(balance)}</b></div>
        </div>
      )}

      {error && <div className="error">{error}</div>}
      <div className="doc-actions">
        <button className="primary" disabled={busy} onClick={() => generate(true)}>
          {busy ? 'Working…' : 'Generate Word + Save'}
        </button>
        <button disabled={busy} onClick={downloadPdf}>Download PDF</button>
        <button className="link" onClick={done}>Cancel</button>
      </div>
    </div>
  )
}
