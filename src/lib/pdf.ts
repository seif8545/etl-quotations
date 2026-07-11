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
