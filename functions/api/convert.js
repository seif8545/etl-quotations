/**
 * Cloudflare Pages Function — POST /api/convert
 * Proxies a .docx (multipart field "File") to ConvertAPI and returns a PDF.
 * The ConvertAPI secret stays server-side via the CONVERTAPI_SECRET env var,
 * so it never ships in the browser bundle.
 *
 * Set it once in Cloudflare Pages → Settings → Environment variables:
 *   CONVERTAPI_SECRET = <your ConvertAPI secret>
 */
export async function onRequestPost(context) {
  const { request, env } = context
  const secret = env.CONVERTAPI_SECRET
  if (!secret) return new Response('Server not configured (CONVERTAPI_SECRET missing).', { status: 500 })

  const inForm = await request.formData()
  const file = inForm.get('File')
  if (!file) return new Response('No file provided.', { status: 400 })

  const outForm = new FormData()
  outForm.append('File', file, 'document.docx')

  const resp = await fetch(`https://v2.convertapi.com/convert/docx/to/pdf?Secret=${secret}`, {
    method: 'POST',
    body: outForm,
  })
  if (!resp.ok) return new Response('Conversion service failed.', { status: 502 })

  const json = await resp.json()
  const b64 = json?.Files?.[0]?.FileData
  if (!b64) return new Response('Conversion returned no file.', { status: 502 })

  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  return new Response(bytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="document.pdf"',
    },
  })
}
