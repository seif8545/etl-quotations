/**
 * Runtime loader for pdfmake from CDN (avoids bundling a dependency, since the
 * build sandbox can't install packages) plus a helper to embed local images.
 */
let pdfMakeP: Promise<any> | null = null

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Failed to load ' + src))
    document.head.appendChild(s)
  })
}

export function getPdfMake(): Promise<any> {
  if (!pdfMakeP) {
    pdfMakeP = (async () => {
      const w = window as any
      if (!w.pdfMake) {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/pdfmake.min.js')
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/vfs_fonts.js')
      }
      return w.pdfMake
    })()
  }
  return pdfMakeP
}

/** Fetch a same-origin image and return a base64 data URL (pdfmake needs this). */
export async function imageToDataURL(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Image not found: ' + url)
  const blob = await res.blob()
  return await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(new Error('Failed to read ' + url))
    r.readAsDataURL(blob)
  })
}
