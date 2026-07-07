import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import { getHtml2Pdf } from './pdf'

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
  // Off-screen absolute WRAPPER with a STATIC, content-sized inner holder.
  // html2canvas must capture the static holder (not the -99999px wrapper), or
  // the captured region is offset and the PDF comes out blank.
  const wrap = document.createElement('div')
  wrap.style.position = 'absolute'
  wrap.style.left = '-99999px'
  wrap.style.top = '0'
  const holder = document.createElement('div')
  holder.style.background = '#ffffff'
  holder.style.display = 'inline-block'
  wrap.appendChild(holder)
  document.body.appendChild(wrap)
  try {
    await docx.renderAsync(blob, holder, null, {
      className: 'docx', inWrapper: false, ignoreWidth: false, ignoreHeight: false,
      breakPages: true, experimental: true,
    })
    if (!holder.firstChild || holder.offsetHeight < 10) {
      throw new Error('The Word document did not render for PDF export.')
    }
    try { await (document as any).fonts?.ready } catch { /* ignore */ }
    await new Promise((r) => setTimeout(r, 350))
    await html2pdf().set({
      margin: 0,
      filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false, windowWidth: holder.scrollWidth },
      jsPDF: { unit: 'pt', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'] },
    }).from(holder).save()
  } finally {
    document.body.removeChild(wrap)
  }
}
