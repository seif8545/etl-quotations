import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import { getHtml2Pdf, waitForAssets } from './pdf'

/** Fill a docx template (placeholder tags) and return a Blob. */
export async function renderDocx(templateUrl: string, data: Record<string, unknown>): Promise<Blob> {
  const res = await fetch(templateUrl)
  if (!res.ok) throw new Error(`Template not found: ${templateUrl}`)
  const buf = await res.arrayBuffer()
  const zip = new PizZip(buf)
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true })
  doc.render(data)
  return doc.getZip().generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }) as Blob
}

/** Open a print window (user prints to PDF from the browser). */
export function printHtml(title: string, bodyHtml: string) {
  const w = window.open('', '_blank', 'width=800,height=900')
  if (!w) return
  w.document.write(`<!doctype html><html><head><title>${title}</title>
<style>
  body { font-family: 'Times New Roman', serif; margin: 40px; color: #000; }
  h1 { text-align: center; font-size: 20px; }
  .letterhead { text-align: center; font-size: 12px; margin-bottom: 16px; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; }
  th, td { border: 1px solid #000; padding: 5px 8px; font-size: 13px; text-align: left; }
  p { font-size: 14px; }
  .cols { display: flex; justify-content: space-between; max-width: 560px; }
  .small { font-size: 11px; }
  .inv-head { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #000; margin-bottom: 10px; }
  .inv-brand { font-weight: bold; font-size: 16px; }
  .inv-head h1 { font-size: 20px; margin: 0; }
  .inv-top td { vertical-align: top; width: 50%; }
  .inv-meta { display: flex; justify-content: space-between; font-size: 13px; margin: 10px 0; }
  .inv-items td.inv-inc { width: 40%; }
  .inv-items td.inv-amt, .inv-items th:last-child { text-align: right; white-space: nowrap; }
  .inv-total-row, .inv-balance-row { font-weight: bold; }
  .inv-total-row td, .inv-balance-row td { border-top: 2px solid #000; }
  .inv-bank { font-size: 12px; margin-top: 18px; }
</style></head><body>${bodyHtml}</body></html>`)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 300)
}

export const fmtDate = (d: string) => {
  if (!d) return ''
  const dt = new Date(d + 'T00:00:00')
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

/* ---- Render a filled .docx to a PDF that mirrors the Word layout ---- */
function loadScriptOnce(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Failed to load ' + src))
    document.head.appendChild(s)
  })
}

let docxPreviewP: Promise<any> | null = null
function getDocxPreview(): Promise<any> {
  if (!docxPreviewP) {
    docxPreviewP = (async () => {
      const w = window as any
      if (!w.JSZip) await loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js')
      if (!(w.docx && w.docx.renderAsync)) await loadScriptOnce('https://cdn.jsdelivr.net/npm/docx-preview@0.3.5/dist/docx-preview.min.js')
      return w.docx
    })()
  }
  return docxPreviewP
}

/** Render a filled .docx blob to a PDF that looks like the Word document, and download it. */
export async function docxBlobToPdf(blob: Blob, filename: string): Promise<void> {
  const [docx, html2pdf] = await Promise.all([getDocxPreview(), getHtml2Pdf()])
  // Off-screen absolute WRAPPER (font-size:0 kills baseline whitespace) with a
  // STATIC inner holder. html2canvas must capture a static node, not the
  // -99999px wrapper, or the captured region is offset and comes out blank.
  const wrap = document.createElement('div')
  wrap.style.position = 'absolute'
  wrap.style.left = '-99999px'
  wrap.style.top = '0'
  wrap.style.fontSize = '0'
  wrap.style.lineHeight = '0'
  const holder = document.createElement('div')
  holder.style.background = '#ffffff'
  holder.style.display = 'inline-block'
  wrap.appendChild(holder)
  document.body.appendChild(wrap)
  try {
    await docx.renderAsync(blob, holder, null, {
      className: 'docx', inWrapper: false, ignoreWidth: false, ignoreHeight: false,
      breakPages: true, experimental: true, useBase64URL: true,
      renderHeaders: true, renderFooters: true,
    })
    if (!holder.firstChild || holder.offsetHeight < 10) {
      throw new Error('The Word document did not render for PDF export.')
    }
    // Multi-section templates render a blank final page — drop trailing empties.
    const pages = Array.from(holder.querySelectorAll('.docx')) as HTMLElement[]
    for (let i = pages.length - 1; i > 0; i--) {
      const el = pages[i]
      const hasContent = (el.textContent || '').trim().length > 0 || !!el.querySelector('img')
      if (!hasContent) el.remove(); else break
    }
    // Wait for embedded images (stamp, letterhead) to decode before capture.
    await waitForAssets(holder)
    // Capture the single remaining page element exactly (no extra spill page).
    const remaining = holder.querySelectorAll('.docx')
    const target: HTMLElement = remaining.length === 1 ? (remaining[0] as HTMLElement) : holder
    await html2pdf().set({
      margin: 0,
      filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false, windowWidth: holder.scrollWidth },
      jsPDF: { unit: 'pt', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'] },
    }).from(target).save()
  } finally {
    document.body.removeChild(wrap)
  }
}
