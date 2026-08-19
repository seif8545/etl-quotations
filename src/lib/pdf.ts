/**
 * Runtime loader for html2pdf (html2canvas + jsPDF) from CDN — avoids a bundled
 * dependency (the build sandbox can't install packages). Renders a styled DOM
 * node to a downloadable PDF.
 */
let libP: Promise<any> | null = null

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Failed to load ' + src))
    document.head.appendChild(s)
  })
}

export function getHtml2Pdf(): Promise<any> {
  if (!libP) {
    libP = (async () => {
      const w = window as any
      if (!w.html2pdf) {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js')
      }
      return w.html2pdf
    })()
  }
  return libP
}

/**
 * html2canvas and jsPDF for the .docx → PDF capture in docx.ts.
 *
 * Both are real dependencies of this app — PackageBuilder and TextBuilder import them for their
 * own exports — so these come out of the bundle rather than off a CDN. The docx path used to
 * pull html2pdf from cdnjs at click time, which meant a client's invoice could fail to export
 * for no reason other than a blocked script. Dynamic import keeps them off the initial load.
 */
export async function getHtml2Canvas(): Promise<any> {
  return (await import('html2canvas')).default
}

export async function getJsPdf(): Promise<any> {
  return (await import('jspdf')).jsPDF
}

/* ---------- DOM → PDF, the way the package and itinerary exports already do it ---------- */

const A4_W_PT = 595.28, A4_H_PT = 841.89

/** Is anything drawn here? Every tenth pixel is enough to find a line of text, and scanning
 *  all of a 1600×2200 band on every export is not. */
function hasInk(cx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const { data } = cx.getImageData(0, 0, w, h)
  for (let i = 0; i < data.length; i += 40) {
    if (data[i] < 245 || data[i + 1] < 245 || data[i + 2] < 245) return true
  }
  return false
}

/**
 * Capture one element and add it to the PDF as one or more A4 pages.
 *
 * The element is cut into A4-proportioned bands rather than squeezed to fit — squeezing is what
 * made the old .docx export unreadable — and a band with no ink on it is dropped, because the
 * whitespace under the last line of a document is a real page in Word and a blank sheet in the
 * client's inbox. The band height comes from the canvas's own width, so the ratio is exact at
 * any device pixel ratio.
 *
 * @returns how many pages were added
 */
export async function addElementPages(pdf: any, el: HTMLElement, pagesSoFar: number): Promise<number> {
  const html2canvas = await getHtml2Canvas()
  const canvas: HTMLCanvasElement = await html2canvas(el, {
    scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false,
  })
  const bandH = Math.round(canvas.width * (A4_H_PT / A4_W_PT))

  /**
   * A sheet that runs a little past one page gets scaled onto one page instead of spilling.
   *
   * An invoice whose inclusions push it 33px past A4 used to produce a second sheet holding
   * nothing but the footer strip, which is worse than a 3% reduction nobody can see. The
   * aspect ratio is kept and the image is centred, so the only visible effect is slightly
   * wider side margins. Past 15% over, the content is genuinely a second page and is sliced.
   */
  if (canvas.height > bandH && canvas.height <= bandH * 1.15) {
    const f = bandH / canvas.height
    const w = A4_W_PT * f
    if (pagesSoFar > 0) pdf.addPage('a4', 'portrait')
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', (A4_W_PT - w) / 2, 0, w, A4_H_PT)
    return 1
  }

  const bands = Math.max(1, Math.ceil(canvas.height / bandH))
  let added = 0
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
    if (pagesSoFar + added > 0) pdf.addPage('a4', 'portrait')
    pdf.addImage(cut.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, A4_W_PT, (h / canvas.width) * A4_W_PT)
    added++
  }
  return added
}

/**
 * A DOM node to a downloaded A4 PDF.
 *
 * This is the pipeline the package PDF and the Text → Pages PDF have always used, and the
 * reason those two are the only exports in the app that never went wrong: the document is a
 * styled DOM node we control, captured page by page. Everything that went through a Word
 * renderer instead — invoice, voucher, guarantee letter — came out clipped, because
 * docx-preview lays those templates out differently from Word and html2pdf then paginated the
 * result at the wrong offsets.
 *
 * `node` holds one child per sheet (class `.sheet`), or is a single sheet itself.
 */
export async function pdfFromNode(node: HTMLElement, filename: string): Promise<void> {
  const jsPDFCtor = await getJsPdf()
  await waitForAssets(node)
  const sheets = Array.from(node.querySelectorAll<HTMLElement>('.sheet'))
  const targets = sheets.length ? sheets : [node]
  const pdf = new jsPDFCtor({ unit: 'pt', format: 'a4', orientation: 'portrait' })
  let pages = 0
  for (const el of targets) pages += await addElementPages(pdf, el, pages)
  if (!pages) throw new Error('The document rendered blank, so no PDF was produced.')
  pdf.save(filename)
}

/** Wait for web fonts and all <img> inside a node to finish loading. */
export async function waitForAssets(node: HTMLElement): Promise<void> {
  try { await (document as any).fonts?.ready } catch { /* ignore */ }
  const imgs = Array.from(node.querySelectorAll('img'))
  await Promise.all(imgs.map((img) =>
    img.complete && img.naturalWidth > 0
      ? Promise.resolve()
      : new Promise<void>((res) => {
          img.addEventListener('load', () => res(), { once: true })
          img.addEventListener('error', () => res(), { once: true })
        })
  ))
  const bgPromises: Promise<void>[] = []
  node.querySelectorAll('[style*="background-image"]').forEach((el) => {
    const raw = (el as HTMLElement).style.backgroundImage
    if (!raw) return
    const s2 = raw.indexOf('(')
    const e2 = raw.lastIndexOf(')')
    if (s2 < 0 || e2 <= s2) return
    let url = raw.slice(s2 + 1, e2).trim()
    if (url.charAt(0) === '"' || url.charAt(0) === "'") url = url.slice(1, -1)
    if (!url) return
    bgPromises.push(new Promise<void>((res) => {
      const im = new Image()
      im.onload = () => res()
      im.onerror = () => res()
      im.src = url
    }))
  })
  await Promise.all(bgPromises)
  await new Promise((r) => setTimeout(r, 200))
}
