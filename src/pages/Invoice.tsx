import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { renderDocx, fmtDate, docName, docxBlobToPdf } from '../lib/docx'
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

const num = (x: unknown): number => (Number.isFinite(Number(x)) ? Number(x) : 0)

const rateItems = (x: unknown): RateItem[] =>
  Array.isArray(x)
    ? x.map((r: any) => ({ label: String(r?.label ?? ''), rate: num(r?.rate) }))
    : []

/**
 * Turn a stored row's `data` back into a complete `InvoiceData`.
 *
 * A saved invoice is only ever as complete as the build that wrote it, so every field is
 * defaulted rather than trusted — a row saved before a field existed would otherwise put
 * `undefined` into a controlled input and React would switch it to uncontrolled mid-edit.
 * The arrays are rebuilt, not aliased: the editor must never mutate the objects still
 * held by the Documents list behind it.
 */
export function hydrateInvoice(raw: Partial<InvoiceData> | null | undefined): InvoiceData {
  const base = emptyInvoice()
  const r = (raw ?? {}) as Partial<InvoiceData>
  const extras = rateItems(r.extras)
  return {
    issueDate: String(r.issueDate ?? base.issueDate),
    clientName: String(r.clientName ?? ''),
    clientDetails: String(r.clientDetails ?? ''),
    inclusions: String(r.inclusions ?? ''),
    singleCount: num(r.singleCount), singleRate: num(r.singleRate),
    doubleCount: num(r.doubleCount), doubleRate: num(r.doubleRate),
    tripleCount: num(r.tripleCount), tripleRate: num(r.tripleRate),
    // The extras table has no "add first row" affordance, so it must never open empty.
    extras: extras.length ? extras : [{ label: '', rate: 0 }],
    deductions: rateItems(r.deductions),
  }
}

/**
 * A copy of a saved invoice, ready to be issued as the next bill against the same file.
 *
 * Everything carries over — guests, rates, extras **and the deduction rows** — so TOTAL
 * is unchanged and Balance already reads the amount still outstanding. That is the point:
 * the second invoice in a file bills the remainder while still showing the client the
 * whole job and what they have already paid. Only the issue date moves to today; the
 * serial is deliberately left to be minted at save time from that date.
 */
export function duplicateInvoice(d: Partial<InvoiceData>): InvoiceData {
  return { ...hydrateInvoice(d), issueDate: todayISO() }
}

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

/**
 * The next running sequence for an issue date, so same-day serials stay distinct.
 *
 * Reads the highest sequence already minted for that date rather than counting rows:
 * deleting an invoice used to pull the count back down and hand the next save a serial
 * that was already in use, and `serial` carries no unique index so nothing would have
 * complained. Reopening an invoice makes a second row on the same day routine, which is
 * why this now matters.
 *
 * Known limit: RLS hides other agents' invoices, so two agents billing on the same day
 * can still land on the same sequence. Closing that needs a SECURITY DEFINER counter in
 * the database, not a client-side query.
 */
async function nextSeqForDate(issueDate: string): Promise<number> {
  if (!issueDate) return 1
  const { data } = await supabase
    .from('q_invoices')
    .select('serial')
    .eq('issue_date', issueDate)
  let max = 0
  for (const row of (data ?? []) as { serial?: string }[]) {
    const m = /-(\d+)$/.exec(String(row?.serial ?? ''))
    if (m) max = Math.max(max, Number(m[1]))
  }
  return max + 1
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

/** What the client's copy is called, on disk and in their inbox. The serial is part of it
 *  because two invoices against one file are routine — see duplicateInvoice above. */
export const invoiceFileName = (d: InvoiceData, serial: string, ext: 'pdf' | 'docx') =>
  docName([d.clientName, `Invoice${serial ? ' ' + serial : ''}`], ext)

/**
 * Invoice as a PDF — a photograph of the Word document, template and all.
 *
 * ConvertAPI is gone (trial over, and the proxy never existed under `npm run dev`), so this goes
 * through docxBlobToPdf, which lays the .docx out in the browser and captures it. The invoice
 * template happens to use only features docx-preview implements, so the result is the Word
 * document: letterhead, the cyan item table, TOTAL / Paid / Balance, bank block, on one page.
 */
export async function invoiceToPdf(d: InvoiceData, serial: string) {
  const blob = await generateInvoiceDocx(d, serial)
  await docxBlobToPdf(blob, invoiceFileName(d, serial, 'pdf'))
}

/** The columns mirrored out of `data` so the Documents list can show an invoice without
 *  parsing the JSON. Insert and update must agree on these or the list and the document
 *  drift apart — which is why they share one builder. */
function invoiceColumns(d: InvoiceData, serial: string) {
  return {
    serial,
    issue_date: d.issueDate || null,
    client_name: d.clientName,
    client_details: d.clientDetails,
    total: invoiceTotal(d),
    balance: invoiceBalance(d),
    data: d,
  }
}

/** Insert a brand-new invoice and hand back its id, so the editor can carry on editing
 *  the row it just created instead of silently minting another on the next save. */
export async function saveInvoice(d: InvoiceData, serial: string): Promise<number> {
  const { data: u } = await supabase.auth.getUser()
  if (!u.user) throw new Error('Not signed in')
  const { data, error } = await supabase
    .from('q_invoices')
    .insert({ ...invoiceColumns(d, serial), created_by: u.user.id })
    .select('id')
    .single()
  if (error) throw error
  return Number((data as { id: number }).id)
}

/**
 * Overwrite an existing invoice in place.
 *
 * The serial is passed through unchanged and `created_by` is never touched: an edit is
 * the same document, so its number must not move under a client who already has it, and
 * re-stamping the owner would hand the row to whichever admin opened it. `updated_at` is
 * written from here rather than by a trigger so the Documents list can show it — see the
 * handoff note about `q_package_docs`, where the absence of that column makes an
 * intentional edit indistinguishable from a corrupted row.
 */
export async function updateInvoice(id: number, d: InvoiceData, serial: string) {
  const { error } = await supabase
    .from('q_invoices')
    .update({ ...invoiceColumns(d, serial), updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

function up<T>(setter: (fn: (x: T) => T) => void, patch: Partial<T>) {
  setter((x) => ({ ...x, ...patch }))
}

export default function Invoice({ done, initial, savedId, savedSerial }: {
  done: () => void
  /** Prefill: a saved row's `data`, either to edit that row or as the basis for a new one. */
  initial?: InvoiceData
  /** Set only when editing a saved row. Absent = a new invoice, prefilled or not. */
  savedId?: number
  savedSerial?: string
}) {
  const [d, setD] = useState<InvoiceData>(() => (initial ? hydrateInvoice(initial) : emptyInvoice()))
  /** The row this editor is bound to, or null while the invoice is still unsaved. */
  const [rowId, setRowId] = useState<number | null>(savedId ?? null)
  /**
   * A saved invoice keeps the number it was issued under — changing the issue date on a
   * document the client already holds must not renumber it. So the serial is frozen for
   * as long as a row is bound, and only "Save as new invoice" mints another.
   */
  const [lockedSerial, setLockedSerial] = useState<string>(savedId ? savedSerial ?? '' : '')
  const [seq, setSeq] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const patch = (p: Partial<InvoiceData>) => up<InvoiceData>(setD, p)

  useEffect(() => {
    if (lockedSerial) return
    let cancelled = false
    nextSeqForDate(d.issueDate).then((n) => { if (!cancelled) setSeq(n) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.issueDate, lockedSerial])

  /** "Saved" stops being true the moment anything is typed, so the confirmation must go. */
  useEffect(() => { setNotice('') }, [d])

  const serial = lockedSerial || serialOf(d.issueDate, seq)
  const total = invoiceTotal(d)
  const balance = invoiceBalance(d)

  const setExtra = (i: number, p: Partial<RateItem>) =>
    setD((x) => ({ ...x, extras: x.extras.map((r, j) => (j === i ? { ...r, ...p } : r)) }))
  const setDeduction = (i: number, p: Partial<RateItem>) =>
    setD((x) => ({ ...x, deductions: x.deductions.map((r, j) => (j === i ? { ...r, ...p } : r)) }))

  /** Every action shares this shell so a failure can never leave the form stuck on "Working…". */
  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('')
    try { await fn() } catch (e: any) { setError(e.message ?? String(e)) }
    setBusy(false)
  }

  const generate = (save: boolean) => run(async () => {
    const blob = await generateInvoiceDocx(d, serial)
    if (save) {
      const id = await saveInvoice(d, serial)
      setRowId(id); setLockedSerial(serial)
    }
    downloadBlob(blob, invoiceFileName(d, serial, 'docx'))
    if (save) done()
  })

  const downloadWord = () => run(async () => {
    downloadBlob(await generateInvoiceDocx(d, serial), invoiceFileName(d, serial, 'docx'))
  })

  const downloadPdf = () => run(() => invoiceToPdf(d, serial))

  /** New invoice, no export — the only way to bank a draft before the figures are final. */
  const saveNew = () => run(async () => {
    const id = await saveInvoice(d, serial)
    setRowId(id); setLockedSerial(serial)
    setNotice(`Saved as invoice ${serial}. It is in Documents → Invoices.`)
  })

  const saveChanges = () => run(async () => {
    await updateInvoice(rowId as number, d, serial)
    setNotice(`Invoice ${serial} updated.`)
  })

  /**
   * Save the edits as a separate invoice and leave the original alone.
   *
   * The serial is minted here rather than reused — a new invoice is a new document and
   * gets its own number, derived from whatever issue date is on the form now. The
   * sequence is re-read at this moment instead of relying on the value fetched at mount,
   * which may be minutes stale by the time anyone clicks.
   */
  const saveAsNew = () => run(async () => {
    const nextSerial = serialOf(d.issueDate, await nextSeqForDate(d.issueDate))
    const id = await saveInvoice(d, nextSerial)
    setRowId(id); setLockedSerial(nextSerial)
    setNotice(`Saved as a new invoice, ${nextSerial}. You are editing that copy now — the original is untouched.`)
  })

  const editing = rowId !== null

  return (
    <div className="doc-form">
      <h2>Invoice</h2>
      {editing && (
        <p className="muted small">
          Editing saved invoice <b>{serial}</b>. “Save changes” overwrites it;
          “Save as new invoice” leaves it as it is and files a copy under a new number.
        </p>
      )}
      <div className="form-grid">
        <label>Issue date<input type="date" value={d.issueDate} onChange={(e) => patch({ issueDate: e.target.value })} /></label>
        <label>Serial number<input value={serial} disabled />
          {editing && <span className="muted small">Fixed once saved — a new number comes from “Save as new invoice”.</span>}
        </label>
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
      {notice && <div className="notice">{notice}</div>}
      <div className="doc-actions">
        {editing ? (
          <>
            <button className="primary" disabled={busy} onClick={saveChanges}>
              {busy ? 'Working…' : 'Save changes'}
            </button>
            <button disabled={busy} onClick={saveAsNew}>Save as new invoice</button>
            <button disabled={busy} onClick={downloadWord}>Download Word</button>
            <button disabled={busy} onClick={downloadPdf}>Download PDF</button>
            <button className="link" onClick={done}>Close</button>
          </>
        ) : (
          <>
            <button className="primary" disabled={busy} onClick={() => generate(true)}>
              {busy ? 'Working…' : 'Generate Word + Save'}
            </button>
            <button disabled={busy} onClick={saveNew}>Save without exporting</button>
            <button disabled={busy} onClick={downloadPdf}>Download PDF</button>
            <button className="link" onClick={done}>Cancel</button>
          </>
        )}
      </div>
    </div>
  )
}
