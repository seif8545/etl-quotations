import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'

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
