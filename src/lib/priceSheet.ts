/**
 * Branded one-page price sheet (2026-10-20)
 * =========================================
 * The "levels down the side, traveller options across the top" sheet that was first made by
 * hand for the Classic Egypt tour, now generated from a package's own price table so it can be
 * sent as a PNG (WhatsApp) or a PDF (email).
 *
 * Rows    = the package's price rows (category + offered hotels).
 * Columns = the columns picked in the builder, in that order, with the builder's labels. The
 *           first column is the headline one: it is highlighted, and the optional children
 *           table is worked out from it.
 *
 * Laid out at a fixed 1200 px and photographed with html2canvas at 2x, so the output is sharp
 * on a phone. Self-contained styles; the fonts fall back to Georgia / system UI when the
 * Google fonts are not reachable.
 */
import { getHtml2Canvas, getJsPdf } from './pdf'

export type SheetColKey = 'dbl' | 'single' | 'triple' | 'quad' | 'solo'

export interface SheetRow { category: string; hotels: string; dbl: number; single: number; triple: number; quad: number; solo?: number }
export interface SheetChildBand { label: string; off: number }
export interface PriceSheetInput {
  title: string
  subtitle?: string
  rows: SheetRow[]
  cols: { key: SheetColKey; label: string }[]
  /** Which column is a supplement ("+$432") rather than a price. */
  plusKeys?: SheetColKey[]
  children?: SheetChildBand[]
  included?: string[]
  excluded?: string[]
  note?: string
  footer?: string
  currency?: string
}

const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const money = (n: number, cur = '$') => cur + Math.round(n).toLocaleString('en-US')
const lines = (t: string) => String(t || '').split('\n').map((s) => s.trim()).filter(Boolean)

const CSS = `
.ps{--lapis:#0e2a47;--gold:#c8960a;--sand:#fdf9f2;--ink:#1a1208;--mid:#5b6472;--line:#e7dfcf;width:1200px;background:var(--sand);font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink)}
.ps *{box-sizing:border-box;margin:0;padding:0}
.ps .top{background:var(--lapis);color:#fff;padding:44px 56px 40px;border-bottom:6px solid var(--gold)}
.ps .brand{letter-spacing:.32em;font-size:15px;color:#e9c570;font-weight:600}
.ps h1{font-family:Fraunces,Lora,Georgia,serif;font-size:44px;font-weight:600;margin:14px 0 10px;line-height:1.15}
.ps .sub{font-size:18px;color:#d5dbe3}
.ps .wrap{padding:34px 56px 40px}
.ps h2{font-family:Fraunces,Lora,Georgia,serif;font-size:24px;color:var(--lapis);margin:0 0 14px;display:flex;justify-content:space-between;align-items:baseline;font-weight:600}
.ps h2 span{font-family:Inter,system-ui,sans-serif;font-size:14px;color:var(--mid);font-weight:400}
.ps table{width:100%;border-collapse:separate;border-spacing:0;background:#fff;border-radius:14px;overflow:hidden;margin-bottom:30px;table-layout:fixed}
.ps th{background:#fbf8f2;font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--mid);font-weight:600;padding:16px 20px;text-align:right;border-bottom:1px solid var(--line);vertical-align:bottom}
.ps th:first-child{text-align:left;width:38%}
.ps th b{display:block;font-family:Fraunces,Lora,Georgia,serif;text-transform:none;letter-spacing:0;font-size:19px;color:var(--lapis);margin-top:2px;font-weight:600}
.ps td{padding:17px 20px;font-size:20px;text-align:right;border-bottom:1px solid var(--line);font-weight:600;vertical-align:middle}
.ps td:first-child{text-align:left;font-weight:400}
.ps td.lv b{display:block;font-family:Fraunces,Lora,Georgia,serif;font-size:21px;color:var(--lapis);font-weight:600}
.ps td.lv small{display:block;color:var(--mid);font-size:13.5px;line-height:1.45;margin-top:3px}
.ps tr:last-child td{border-bottom:0}
.ps .hl{background:#fdf6e7;color:var(--lapis)}
.ps th.hl{background:#f7ecd4;color:var(--lapis)}
.ps .notes{display:grid;grid-template-columns:1fr 1fr;gap:28px;font-size:14.5px;line-height:1.6;color:#3b4552}
.ps .notes h3{font-family:Fraunces,Lora,Georgia,serif;font-size:17px;color:var(--lapis);margin-bottom:6px;font-weight:600}
.ps .foot{margin-top:26px;padding-top:18px;border-top:1px solid var(--line);display:flex;justify-content:space-between;gap:20px;font-size:13.5px;color:var(--mid)}
`

/** The sheet as an HTML fragment (no <html>/<body>), ready to drop into a host node. */
export function priceSheetHtml(s: PriceSheetInput): string {
  const cur = s.currency || '$'
  const cols = s.cols.length ? s.cols : [{ key: 'dbl' as SheetColKey, label: 'Per person' }]
  const rows = s.rows.filter((r) => r.category || cols.some((c) => Number(r[c.key]) > 0))
  const plus = new Set(s.plusKeys || [])
  const head = (c: { label: string }, i: number) => {
    const words = c.label.trim().split(/\s+/)
    const small = words.length > 1 ? words.slice(0, -1).join(' ') : ''
    const big = words.length > 1 ? words[words.length - 1] : c.label
    return `<th class="${i === 0 ? 'hl' : ''}">${esc(small)}<b>${esc(big)}</b></th>`
  }
  const lvl = (r: SheetRow) => {
    const h = lines(r.hotels)
    return `<td class="lv"><b>${esc(r.category)}</b>${h.length ? `<small>${h.map(esc).join('<br>')}</small>` : ''}</td>`
  }
  const cell = (r: SheetRow, k: SheetColKey, i: number) => {
    const v = Number(r[k]) || 0
    return `<td class="${i === 0 ? 'hl' : ''}">${v > 0 ? (plus.has(k) ? '+' : '') + esc(money(v, cur)) : '—'}</td>`
  }
  const main = `<table><tr><th>Level</th>${cols.map(head).join('')}</tr>${rows
    .map((r) => `<tr>${lvl(r)}${cols.map((c, i) => cell(r, c.key, i)).join('')}</tr>`).join('')}</table>`

  const kids = (s.children || []).filter((b) => b.label && b.off >= 0 && b.off <= 100)
  const base = cols[0].key
  const kidsTable = kids.length
    ? `<h2>Children <span>per child, sharing with 2 adults · from the ${esc(cols[0].label.toLowerCase())} price</span></h2>
       <table><tr><th>Level</th>${kids.map((b) => `<th>${esc(b.label)}<b>${esc(b.off)}% off</b></th>`).join('')}</tr>${rows
        .map((r) => `<tr>${lvl(r)}${kids.map((b) => {
          const v = (Number(r[base]) || 0) * (1 - b.off / 100)
          return `<td>${v > 0 ? esc(money(v, cur)) : '—'}</td>`
        }).join('')}</tr>`).join('')}</table>`
    : ''

  const inc = (s.included || []).filter(Boolean)
  const exc = (s.excluded || []).filter(Boolean)
  const notes = inc.length || exc.length
    ? `<div class="notes">${inc.length ? `<div><h3>Included</h3>${inc.map(esc).join(' · ')}</div>` : '<div></div>'}${
        exc.length ? `<div><h3>Not included</h3>${exc.map(esc).join(' · ')}</div>` : '<div></div>'}</div>`
    : ''

  return `<div class="ps"><style>${CSS}</style>
<div class="top"><div class="brand">EGYPT TOP LIGHT TRAVEL</div><h1>${esc(s.title)}</h1>${s.subtitle ? `<div class="sub">${esc(s.subtitle)}</div>` : ''}</div>
<div class="wrap">
<h2>Prices <span>${esc(s.note || 'US dollars')}</span></h2>
${main}${kidsTable}${notes}
<div class="foot"><span>egypttoplight.net</span><span>${esc(s.footer || 'Subject to availability at the time of booking')}</span></div>
</div></div>`
}

let fontsAdded = false
function ensureFonts() {
  if (fontsAdded) return
  fontsAdded = true
  const l = document.createElement('link')
  l.rel = 'stylesheet'
  l.href = 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=Inter:wght@400;600&display=swap'
  document.head.appendChild(l)
}

async function capture(s: PriceSheetInput): Promise<HTMLCanvasElement> {
  ensureFonts()
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:0;top:0;z-index:-1;pointer-events:none;opacity:1'
  host.innerHTML = priceSheetHtml(s)
  document.body.appendChild(host)
  try {
    try { await (document as any).fonts?.ready } catch { /* fallback fonts are fine */ }
    await new Promise((r) => setTimeout(r, 250))
    const html2canvas = await getHtml2Canvas()
    const node = host.firstElementChild as HTMLElement
    return await html2canvas(node, { scale: 2, backgroundColor: '#fdf9f2', useCORS: true, logging: false })
  } finally {
    host.remove()
  }
}

function fileBase(title: string) {
  return (title || 'price-sheet').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 80) || 'price-sheet'
}

export async function downloadPriceSheetPng(s: PriceSheetInput) {
  const canvas = await capture(s)
  const a = document.createElement('a')
  a.href = canvas.toDataURL('image/png')
  a.download = fileBase(s.title) + '-prices.png'
  a.click()
}

/** One tall page sized to the sheet, so nothing is split across pages. */
export async function downloadPriceSheetPdf(s: PriceSheetInput) {
  const canvas = await capture(s)
  const JsPdf = await getJsPdf()
  const w = 900, h = Math.round((canvas.height / canvas.width) * w)
  const pdf = new JsPdf({ unit: 'pt', format: [w, h], orientation: h > w ? 'portrait' : 'landscape' })
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, w, h)
  pdf.save(fileBase(s.title) + '-prices.pdf')
}
