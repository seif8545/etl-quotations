import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import { getHtml2Canvas, getJsPdf, waitForAssets } from './pdf'

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

/**
 * A download filename built out of the document's own facts.
 *
 * Everything used to arrive as `Invoice.docx` or `HotelVoucher.docx`, so the second download
 * of the day overwrote the first and nothing in the folder said whose it was. Parts are joined
 * with an em dash and blanks are dropped, so a client-less invoice is still
 * `Invoice 20260819-001.docx` rather than `— Invoice 20260819-001.docx`.
 *
 * Only the characters Windows and macOS actually reject are replaced — "Mr. Nicolas Josson —
 * Sheraton Cairo Hotel & Casino Voucher.docx" is what belongs in an inbox, ampersand and all.
 * Trailing dots and spaces go last: Windows refuses to create a file whose name ends in
 * either, and it surfaces as a download that simply never appears.
 */
export function docName(parts: Array<string | number | null | undefined>, ext: 'pdf' | 'docx'): string {
  const clean = parts
    .map((p) => String(p ?? '').replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim())
    .filter(Boolean)
  const stem = (clean.join(' — ') || 'document').slice(0, 120).replace(/[ .]+$/, '')
  return `${stem || 'document'}.${ext}`
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

/**
 * Render a filled .docx to a PDF and download it — a photograph of the Word document.
 *
 * The document is laid out by docx-preview and captured with html2canvas, then assembled by
 * jsPDF at the TEMPLATE's own page size (these templates are US Letter, not A4). Four things had
 * to be corrected before this produced anything sendable, each proven against the real files:
 *
 * 1. `breakPages: false`. Left on, docx-preview starts a fresh page per Word SECTION. The hotel
 *    voucher has three continuous sections, so a one-page document arrived as three, with the
 *    letterhead alone on page 1 and the tables on page 3.
 * 2. The section boxes are collapsed. Each one reserves a full page of height plus its own top
 *    and bottom margins, which puts a page of whitespace between every section.
 * 3. The column gap is clamped. docx-preview writes the SECTION's `w:space` as the CSS column
 *    gap; the voucher's second section carries `w:space="8352"` — 5.8 inches — beside real
 *    per-column widths that Word uses instead. A 556px gap in a 676px box left sixty pixels a
 *    column, which is why that block came out one word per line.
 * 4. Text is lifted above images. Word draws an anchored stamp BEHIND the text; docx-preview
 *    leaves it in normal flow, so the stamp's white background painted over whatever it covered
 *    — which is why the guarantee letter's Name, Date of birth and Passport cells looked empty.
 *    They were never empty: the values were in the DOM, laid out, black, and hidden under a
 *    picture. `mix-blend-mode: multiply` on top of that lets the stamp show through the text
 *    rather than the other way round.
 * 5. Floating tables are unfloated. A Word floating table (tblpPr) becomes float:left, and the
 *    next table then wraps beside it — the voucher's rooms table was squeezed to 184px in the
 *    right margin. Word stacks them.
 * 6. `overflow: visible` on the sections. docx-preview clips each one, and once the box is
 *    collapsed to its content that crops anything sitting past the flow, the stamp included.
 * 7. A sheet a little past one page is scaled onto one page rather than spilling a footer strip.
 *
 * Every one of those is a correction applied to the RENDERED DOM. Not one line of the templates
 * changed, so what Word prints is exactly what it printed before — which was the requirement.
 *
 * If a future template comes out wrong, diff it against these seven: the cause has each time
 * been docx-preview implementing a Word feature differently, never the capture.
 */
export async function docxBlobToPdf(blob: Blob, filename: string, opts?: { firstPageOnly?: boolean }): Promise<void> {
  const [docx, html2canvas, jsPDFCtor] = await Promise.all([getDocxPreview(), getHtml2Canvas(), getJsPdf()])
  const host = document.createElement('div')
  // On-screen but behind the app: html2canvas has to lay the node out to photograph it.
  host.style.position = 'fixed'
  host.style.left = '0'
  host.style.top = '0'
  host.style.zIndex = '-1'
  host.style.pointerEvents = 'none'
  host.style.background = '#ffffff'
  host.style.display = 'inline-block'
  document.body.appendChild(host)
  try {
    await docx.renderAsync(blob, host, null, {
      className: 'docx', inWrapper: false, ignoreWidth: false, ignoreHeight: false,
      breakPages: false, experimental: true, useBase64URL: true,
      renderHeaders: true, renderFooters: true,
    })
    const sections = Array.from(host.querySelectorAll<HTMLElement>('.docx'))
    if (!sections.length || host.offsetHeight < 10) {
      throw new Error('The Word document did not render for PDF export.')
    }

    // The template's own page size, read off the first section before it is collapsed.
    const cs = getComputedStyle(sections[0])
    const pageW = (parseFloat(cs.width) || 794) * 0.75
    const pageH = (parseFloat(cs.minHeight) || 1123) * 0.75

    // Text above pictures, and pictures multiplied so a white-boxed stamp cannot hide anything.
    const fixes = document.createElement('style')
    fixes.textContent =
      '.docx p, .docx table, .docx tr, .docx td { position: relative; z-index: 2; }' +
      '.docx img { position: relative; z-index: 1; mix-blend-mode: multiply; }' +
      // The app's own stylesheet reaches this host — it is a div in the app's document, not an
      // iframe. `img { max-width: 100% }` in styles.css is the sensible rule for every picture in
      // the UI and it DESTROYS an anchored Word image: docx-preview wraps the stamp in a
      // shrink-to-fit box, so "100% of the container" resolves to ZERO and the stamp is laid out
      // 0px wide by 161px tall. Measured: 265.66pt wide without the stylesheet, 0px with it. That
      // is why the guarantee letter came out of the app with no stamp while it rendered correctly
      // in every isolated test. Word's own sizing is already on the element as an inline style, so
      // any app-side clamp on a picture in here is wrong by definition.
      '.docx img, .docx svg { max-width: none !important; max-height: none !important; min-width: 0 !important; }' +
      // html2canvas re-measures every run in whatever font the machine actually has, and where
      // its measurement disagrees with the layout it will break INSIDE a word: a real letter to
      // Air Arabia came out reading "the visa arrangem / ent upon arrival". Words are not
      // breakable in any of these documents.
      '.docx, .docx * { word-break: normal; overflow-wrap: normal; hyphens: none; }'
    host.appendChild(fixes)

    for (const t of Array.from(host.querySelectorAll<HTMLElement>('table'))) {
      const f = getComputedStyle(t).float
      if (f === 'left' || f === 'right') t.style.float = 'none'
    }

    for (const el of Array.from(host.querySelectorAll<HTMLElement>('*'))) {
      const s2 = getComputedStyle(el)
      if (parseInt(s2.columnCount) > 1) {
        const w = parseFloat(s2.width) || 0
        const gap = parseFloat(s2.columnGap) || 0
        if (w > 0 && gap > w * 0.12) el.style.columnGap = `${Math.round(w * 0.06)}px`
      }
    }
    sections.forEach((el, i) => {
      el.style.minHeight = '0'
      el.style.overflow = 'visible'
      if (i > 0) el.style.paddingTop = '0'
      if (i < sections.length - 1) el.style.paddingBottom = '0'
    })
    if (opts?.firstPageOnly) sections.slice(1).forEach((el) => el.remove())

    await waitForAssets(host)
    await new Promise((r) => setTimeout(r, 30))

    const canvas: HTMLCanvasElement = await html2canvas(host, {
      scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false,
    })
    const pdf = new jsPDFCtor({ unit: 'pt', format: [pageW, pageH], orientation: 'portrait' })
    const bandH = Math.round(canvas.width * (pageH / pageW))
    let placed = 0

    if (canvas.height > bandH && canvas.height <= bandH * 1.15) {
      const f = bandH / canvas.height
      const w = pageW * f
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', (pageW - w) / 2, 0, w, pageH)
      placed = 1
    } else {
      const bands = Math.max(1, Math.ceil(canvas.height / bandH))
      for (let i = 0; i < bands; i++) {
        const y = i * bandH
        const h = Math.min(bandH, canvas.height - y)
        if (h <= 0) continue
        const cut = document.createElement('canvas')
        cut.width = canvas.width
        cut.height = h
        const cx = cut.getContext('2d')
        if (!cx) continue
        cx.fillStyle = '#ffffff'
        cx.fillRect(0, 0, cut.width, cut.height)
        cx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h)
        if (!hasInk(cx, cut.width, cut.height)) continue
        if (placed > 0) pdf.addPage([pageW, pageH], 'portrait')
        pdf.addImage(cut.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pageW, (h / canvas.width) * pageW)
        placed++
      }
    }
    if (!placed) throw new Error('The Word document rendered blank, so no PDF was produced.')
    pdf.save(filename)
  } finally {
    host.remove()
  }
}

/** Is anything drawn on this canvas? Every tenth pixel finds a line of text; scanning all of a
 *  1600×2200 band on every export does not. */
function hasInk(cx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const { data } = cx.getImageData(0, 0, w, h)
  for (let i = 0; i < data.length; i += 40) {
    if (data[i] < 245 || data[i + 1] < 245 || data[i + 2] < 245) return true
  }
  return false
}
