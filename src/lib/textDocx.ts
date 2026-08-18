import PizZip from 'pizzip'
import type { Item, TextPage } from './textItinerary'

/**
 * "Text → Pages" as an editable Word document.
 *
 * WHY THIS IS HAND-WRITTEN OOXML and not the docxtemplater path the invoice and the voucher
 * use: those documents are forms — fixed furniture with a handful of holes to fill, so a
 * .docx template with tags is exactly right. An itinerary is not a form. It is an arbitrary
 * stream of days, paragraphs, chip strips, a two-column list and a rate table, in whatever
 * order the pasted text happened to be, and a template cannot grow furniture it does not
 * already have. So the paragraphs are emitted directly.
 *
 * WHAT THE FILE IS SUPPOSED TO BE: the same document, in Word's terms. Not a screenshot of
 * the PDF. Days flow, headings are real headings, the lists are real lists, and the page
 * breaks are Word's — so an agent can retype a line or a client can put it on letterhead.
 * Chasing the PDF's exact line endings here would mean one text box per page and a file
 * nobody can edit, which is the opposite of the point.
 *
 * DELIBERATELY NOT REUSED FROM THE RENDERERS: the item → block mapping is written out again
 * rather than shared with TextDoc.tsx. They target different engines (CSS boxes vs
 * WordprocessingML), and the one thing that must not drift — how the text was PARSED into
 * items — is upstream of both in textItinerary.ts.
 */

/* ---------- brand ---------- */

const NAVY = '0E2A47'
const GOLD = 'C8960A'
const BODY = '22344C'
const MUTED = '806000'
const RULE = 'EADFC4'
const FOOT = '6A7789'

/** Georgia stands in for Fraunces and Calibri for Inter: both are on every machine that has
 *  Word, which matters more here than an exact match — a missing font is substituted per
 *  reader and the document stops looking like ours at all. */
const SERIF = 'Georgia'
const SANS = 'Calibri'

/* A4, and margins that leave room for the logo header and the contact footer. Twips. */
const PAGE_W = 11906, PAGE_H = 16838
const MARGIN_X = 1080, MARGIN_TOP = 1560, MARGIN_BOTTOM = 1300
const HEADER_DIST = 640, FOOTER_DIST = 560
/** Usable text width — every centred or shortened rule below is measured off this. */
const TEXT_W = PAGE_W - MARGIN_X * 2

const esc = (s: unknown) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
  // Word rejects the C0 range outright; a stray one out of a pasted PDF kills the whole file.
  // eslint-disable-next-line no-control-regex
  .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')

interface RunOpts {
  b?: boolean
  i?: boolean
  /** Half-points, i.e. 21 = 10.5pt. */
  sz?: number
  color?: string
  font?: string
  caps?: boolean
  /** Character spacing in twentieths of a point — the tracked-out small labels. */
  track?: number
}

function run(text: string, o: RunOpts = {}): string {
  const p: string[] = []
  if (o.font) p.push(`<w:rFonts w:ascii="${o.font}" w:hAnsi="${o.font}" w:cs="${o.font}"/>`)
  if (o.b) p.push('<w:b/>')
  if (o.i) p.push('<w:i/>')
  if (o.caps) p.push('<w:caps/>')
  if (o.track) p.push(`<w:spacing w:val="${o.track}"/>`)
  if (o.sz) p.push(`<w:sz w:val="${o.sz}"/><w:szCs w:val="${o.sz}"/>`)
  if (o.color) p.push(`<w:color w:val="${o.color}"/>`)
  const rPr = p.length ? `<w:rPr>${p.join('')}</w:rPr>` : ''
  // xml:space is not optional: the separators between chips are single spaces and Word
  // collapses them away without it.
  return `<w:r>${rPr}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`
}

interface ParaOpts {
  align?: 'left' | 'center' | 'right' | 'both'
  /** Twips. */
  before?: number
  after?: number
  /** 240 = single. 276 is the 1.15 the body prose is set at. */
  line?: number
  indLeft?: number
  indRight?: number
  indHanging?: number
  /** Keep this paragraph with the one after it — day labels must not orphan. */
  keepNext?: boolean
  /** A gold or grey hairline under the paragraph, used for the rules. */
  border?: { color: string; sz: number }
  sz?: number
}

function para(runs: string, o: ParaOpts = {}): string {
  const p: string[] = []
  if (o.keepNext) p.push('<w:keepNext/>')
  if (o.border) p.push(`<w:pBdr><w:bottom w:val="single" w:sz="${o.border.sz}" w:space="1" w:color="${o.border.color}"/></w:pBdr>`)
  const sp: string[] = []
  if (o.before != null) sp.push(`w:before="${o.before}"`)
  if (o.after != null) sp.push(`w:after="${o.after}"`)
  if (o.line != null) sp.push(`w:line="${o.line}" w:lineRule="auto"`)
  if (sp.length) p.push(`<w:spacing ${sp.join(' ')}/>`)
  const ind: string[] = []
  if (o.indLeft != null) ind.push(`w:left="${o.indLeft}"`)
  if (o.indRight != null) ind.push(`w:right="${o.indRight}"`)
  if (o.indHanging != null) ind.push(`w:hanging="${o.indHanging}"`)
  if (ind.length) p.push(`<w:ind ${ind.join(' ')}/>`)
  if (o.align) p.push(`<w:jc w:val="${o.align === 'both' ? 'both' : o.align}"/>`)
  if (o.sz) p.push(`<w:rPr><w:sz w:val="${o.sz}"/><w:szCs w:val="${o.sz}"/></w:rPr>`)
  return `<w:p>${p.length ? `<w:pPr>${p.join('')}</w:pPr>` : ''}${runs}</w:p>`
}

/**
 * A short gold hairline, the document's one repeated ornament.
 *
 * It is an empty paragraph carrying a bottom border, shortened by indenting the side it is
 * not anchored to — Word has no "rule of width N", and a 1pt run size keeps the empty
 * paragraph from adding a line of leading where the CSS version adds none.
 */
function rule(widthTwips: number, align: 'left' | 'center' = 'left', after = 120): string {
  const slack = Math.max(0, TEXT_W - widthTwips)
  const o: ParaOpts = { after, sz: 2, border: { color: GOLD, sz: 8 } }
  if (align === 'center') { o.indLeft = Math.round(slack / 2); o.indRight = Math.round(slack / 2) }
  else o.indRight = slack
  return para('', o)
}

/* ---------- tables ---------- */

const CELL_MARGIN = '<w:tcMar><w:top w:w="60" w:type="dxa"/><w:left w:w="0" w:type="dxa"/>' +
  '<w:bottom w:w="60" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tcMar>'

function cell(widthPct: number, content: string, opts: { fill?: string; bottom?: { color: string; sz: number } } = {}): string {
  const borders = opts.bottom
    ? `<w:tcBorders><w:bottom w:val="single" w:sz="${opts.bottom.sz}" w:space="0" w:color="${opts.bottom.color}"/></w:tcBorders>`
    : ''
  const shd = opts.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${opts.fill}"/>` : ''
  return `<w:tc><w:tcPr><w:tcW w:w="${Math.round(widthPct * 50)}" w:type="pct"/>${borders}${shd}${CELL_MARGIN}</w:tcPr>` +
    `${content || para('')}</w:tc>`
}

/** No visible grid: every line this document draws is drawn per cell, in brand colours. */
function table(rows: string[]): string {
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>` +
    `<w:tblBorders><w:top w:val="none" w:sz="0" w:space="0" w:color="auto"/>` +
    `<w:left w:val="none" w:sz="0" w:space="0" w:color="auto"/>` +
    `<w:bottom w:val="none" w:sz="0" w:space="0" w:color="auto"/>` +
    `<w:right w:val="none" w:sz="0" w:space="0" w:color="auto"/>` +
    `<w:insideH w:val="none" w:sz="0" w:space="0" w:color="auto"/>` +
    `<w:insideV w:val="none" w:sz="0" w:space="0" w:color="auto"/></w:tblBorders>` +
    `<w:tblLayout w:type="fixed"/></w:tblPr>${rows.join('')}</w:tbl>`
}

/**
 * `noSplit` keeps a rate row whole: split across a sheet, the tail of its hotel list is
 * stranded at the top of the next page under nothing at all — which is how the first build of
 * this export came out. `header` repeats the column titles over such a break.
 *
 * Neither is set on the two-column included/excluded row, and must not be: that row is as tall
 * as the longest list, so forbidding the split would push the entire block to the next sheet
 * and leave the hole this feature exists to avoid.
 */
const trow = (cells: string, opts: { header?: boolean; noSplit?: boolean } = {}) => {
  const pr = `${opts.noSplit ? '<w:cantSplit/>' : ''}${opts.header ? '<w:tblHeader/>' : ''}`
  return `<w:tr>${pr ? `<w:trPr>${pr}</w:trPr>` : ''}${cells}</w:tr>`
}

/** One bullet, drawn with a literal mark and a hanging indent rather than a numbering
 *  definition: numbering.xml is a second file, a second relationship and an abstract/instance
 *  pair, all so Word can draw the same dot. */
function bullet(text: string): string {
  return para(
    run('•\t', { sz: 20, color: GOLD, font: SANS }) + run(text, { sz: 20, color: BODY, font: SANS }),
    { after: 40, line: 264, indLeft: 227, indHanging: 227 },
  )
}

/* ---------- the item stream ---------- */

function itemBlocks(it: Item): string {
  switch (it.t) {
    case 'day':
      return para(run(it.label, { font: SERIF, b: true, sz: 30, color: NAVY }), { before: 260, after: 40, keepNext: true })
        + (it.title
          ? para(run(it.title, { font: SANS, sz: 17, color: MUTED, caps: true, track: 16 }), { after: 60, keepNext: true })
          : '')
        + rule(510, 'left', 100)
    case 'p':
      return para(run(it.text, { font: SANS, sz: 21, color: BODY }), { align: 'both', after: 100, line: 276 })
    case 'chips': {
      const bits: string[] = []
      it.meals.forEach((m, i) => {
        if (i) bits.push(run('  ·  ', { font: SANS, sz: 16, color: RULE }))
        bits.push(run(m, { font: SANS, sz: 16, color: MUTED, caps: true, track: 14 }))
      })
      if (it.stay) {
        if (bits.length) bits.push(run('  ·  ', { font: SANS, sz: 16, color: RULE }))
        bits.push(run('Stay', { font: SANS, sz: 16, color: NAVY, b: true, caps: true, track: 20 }))
        bits.push(run('  ' + it.stay, { font: SANS, sz: 16, color: NAVY }))
      }
      if (!bits.length) return ''
      return para(bits.join(''), { before: 60, after: 140 })
    }
    case 'h':
      return para(run(it.text, { font: SERIF, b: true, sz: 28, color: NAVY }), { align: 'center', before: 320, after: 60, keepNext: true })
        + rule(690, 'center', 160)
    case 'two': {
      const side = (title: string, items: string[]) => (items.length
        ? para(run(title, { font: SANS, b: true, sz: 17, color: MUTED, caps: true, track: 18 }), { after: 80 })
          + items.map(bullet).join('')
        : '')
      const left = side(it.leftTitle, it.left)
      const right = side(it.rightTitle, it.right)
      if (!left && !right) return ''
      // Even when one side is empty the row keeps both cells, so the included list stays in
      // its own column instead of spreading to full measure and reading as body prose.
      return table([trow(cell(50, left) + cell(50, right))]) + para('', { after: 0, sz: 8 })
    }
    case 'table': {
      if (!it.rows.length) return ''
      const head = trow(
        cell(26, para(run('Package', { font: SANS, b: true, sz: 16, color: 'FFFFFF', caps: true, track: 16 }), { after: 0 }), { fill: NAVY })
        + cell(24, para(run('Per person, double', { font: SANS, b: true, sz: 16, color: 'FFFFFF', caps: true, track: 16 }), { after: 0 }), { fill: NAVY })
        + cell(50, para(run('Offered hotels', { font: SANS, b: true, sz: 16, color: 'FFFFFF', caps: true, track: 16 }), { after: 0 }), { fill: NAVY }),
        { header: true, noSplit: true },
      )
      const body = it.rows.map((r) => trow(
        cell(26, para(run(r.category, { font: SERIF, sz: 21, color: NAVY }), { after: 0 }), { bottom: { color: RULE, sz: 6 } })
        + cell(24, para(run(r.rate, { font: SANS, b: true, sz: 19, color: NAVY }), { after: 0 }), { bottom: { color: RULE, sz: 6 } })
        + cell(50, (r.hotels.length ? r.hotels : ['']).map((h) => para(run(h, { font: SANS, sz: 19, color: BODY }), { after: 20 })).join(''),
          { bottom: { color: RULE, sz: 6 } }),
        { noSplit: true },
      ))
      return table([head, ...body]) + para('', { after: 0, sz: 8 })
    }
    default:
      return ''
  }
}

/* ---------- the package parts ---------- */

const CT = (hasLogo: boolean) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="png" ContentType="image/png"/>
<Default Extension="jpeg" ContentType="image/jpeg"/>
<Default Extension="jpg" ContentType="image/jpeg"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
${hasLogo ? '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' : ''}
<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`

const DOC_RELS = (hasLogo: boolean) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
${hasLogo ? '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>' : ''}
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>`

const HEADER_RELS = (ext: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.${ext}"/>
</Relationships>`

/** Nothing here is optional to Word: no docDefaults means the reader's own Normal style wins
 *  and the document arrives in Times New Roman. */
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr>
<w:rFonts w:ascii="${SANS}" w:hAnsi="${SANS}" w:cs="${SANS}"/><w:sz w:val="21"/><w:szCs w:val="21"/>
<w:color w:val="${BODY}"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="100" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
</w:styles>`

const CORE = (title: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
 xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:title>${esc(title)}</dc:title><dc:creator>Egypt Top Light Travel</dc:creator>
<cp:lastModifiedBy>Egypt Top Light Travel</cp:lastModifiedBy></cp:coreProperties>`

/**
 * The logo, in the page header so it repeats on every sheet exactly as the pill does.
 *
 * The drawing is anchored inline and sized in EMUs (914400 to the inch) from the image's own
 * pixel ratio, so a swapped logo file cannot come out stretched.
 */
function headerXml(widthEmu: number, heightEmu: number): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
 xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
 xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
 xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="0"/></w:pPr><w:r><w:drawing>
<wp:inline distT="0" distB="0" distL="0" distR="0">
<wp:extent cx="${widthEmu}" cy="${heightEmu}"/><wp:docPr id="1" name="Egypt Top Light Travel"/>
<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
<pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="logo"/><pic:cNvPicPr/></pic:nvPicPr>
<pic:blipFill><a:blip r:embed="rIdLogo"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${widthEmu}" cy="${heightEmu}"/></a:xfrm>
<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>
</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p></w:hdr>`
}

export interface TextDocxContact { phone: string; email: string; website: string; social: string }

/** PAGE / NUMPAGES, spelled out the long way because that is the only way Word takes them. */
function field(instr: string, opts: RunOpts): string {
  const rPr = `<w:rPr><w:rFonts w:ascii="${opts.font ?? SANS}" w:hAnsi="${opts.font ?? SANS}"/>` +
    `<w:sz w:val="${opts.sz ?? 15}"/><w:szCs w:val="${opts.sz ?? 15}"/><w:color w:val="${opts.color ?? FOOT}"/></w:rPr>`
  return `<w:r>${rPr}<w:fldChar w:fldCharType="begin"/></w:r>` +
    `<w:r>${rPr}<w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r>` +
    `<w:r>${rPr}<w:fldChar w:fldCharType="separate"/></w:r>` +
    `<w:r>${rPr}<w:t>1</w:t></w:r>` +
    `<w:r>${rPr}<w:fldChar w:fldCharType="end"/></w:r>`
}

function footerXml(c: TextDocxContact): string {
  const label = (t: string) => run(t + ' ', { font: SANS, sz: 15, color: GOLD, caps: false })
  const value = (t: string) => run(t, { font: SANS, sz: 15, color: FOOT })
  const gap = run('    ', { sz: 15 })
  const line = [
    label('WhatsApp'), value(c.phone), gap,
    label('Email'), value(c.email), gap,
    label('Web'), value(c.website), gap,
    label('Social'), value(c.social),
  ].join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
${para(line, { align: 'center', after: 0, border: undefined })}
${para(field('PAGE', { sz: 14 }) + run(' / ', { sz: 14, color: FOOT }) + field('NUMPAGES', { sz: 14 }), { align: 'center', after: 0 })}
</w:ftr>`
}

/* ---------- the entry point ---------- */

export interface TextDocxInput {
  title: string
  pages: TextPage[]
  contact: TextDocxContact
  /** The wordmark as a data URL, same value the on-screen pill uses. Optional. */
  logoDataUrl?: string
}

/** Bytes and extension out of a data URL, or null for anything that is not one. */
function decodeDataUrl(u: string | undefined): { bytes: Uint8Array; ext: string } | null {
  const m = /^data:image\/(png|jpe?g);base64,([A-Za-z0-9+/=]+)$/.exec(String(u || '').trim())
  if (!m) return null
  const bin = atob(m[2])
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return { bytes, ext: m[1] === 'png' ? 'png' : 'jpeg' }
}

/** PNG carries its size in the IHDR at a fixed offset; anything else falls back to the shape
 *  of the wordmark we ship, which is the only image this ever gets. */
function pixelSize(bytes: Uint8Array, ext: string): { w: number; h: number } {
  if (ext === 'png' && bytes.length > 24) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const w = dv.getUint32(16), h = dv.getUint32(20)
    if (w > 0 && h > 0) return { w, h }
  }
  return { w: 1600, h: 298 }
}

/**
 * Build the .docx. Every page's columns are concatenated in reading order: the stored page
 * breaks are a property of the A4 sheet the PDF prints, and forcing them into Word would
 * leave half-empty pages the moment anyone changes a word.
 */
export function buildTextDocx(input: TextDocxInput): Blob {
  const stream: Item[] = input.pages.flatMap((p) => (p.cols || []).flatMap((c) => c || []))
  const logo = decodeDataUrl(input.logoDataUrl)

  const titleBlock = input.title
    ? para(run(input.title, { font: SERIF, b: true, sz: 44, color: NAVY }), { align: 'center', after: 120 })
      + rule(870, 'center', 260)
    : ''

  const body = titleBlock + stream.map(itemBlocks).join('')

  const sect = `<w:sectPr>` +
    (logo ? '<w:headerReference w:type="default" r:id="rId2"/>' : '') +
    '<w:footerReference w:type="default" r:id="rId3"/>' +
    `<w:pgSz w:w="${PAGE_W}" w:h="${PAGE_H}"/>` +
    `<w:pgMar w:top="${MARGIN_TOP}" w:right="${MARGIN_X}" w:bottom="${MARGIN_BOTTOM}" w:left="${MARGIN_X}" ` +
    `w:header="${HEADER_DIST}" w:footer="${FOOTER_DIST}" w:gutter="0"/></w:sectPr>`

  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
 xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
 xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
 xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
<w:body>${body}${sect}</w:body></w:document>`

  const zip = new PizZip()
  zip.file('[Content_Types].xml', CT(!!logo))
  zip.folder('_rels')?.file('.rels', ROOT_RELS)
  zip.folder('docProps')?.file('core.xml', CORE(input.title))
  const word = zip.folder('word')
  word?.file('document.xml', document)
  word?.file('styles.xml', STYLES)
  word?.file('footer1.xml', footerXml(input.contact))
  word?.folder('_rels')?.file('document.xml.rels', DOC_RELS(!!logo))
  if (logo) {
    const { w, h } = pixelSize(logo.bytes, logo.ext)
    // 1.6in wide is the pill's own width on the page; the height follows the file's ratio.
    const widthEmu = Math.round(1.6 * 914400)
    word?.file('header1.xml', headerXml(widthEmu, Math.round((widthEmu * h) / w)))
    word?.folder('_rels')?.file('header1.xml.rels', HEADER_RELS(logo.ext))
    word?.folder('media')?.file('logo.' + logo.ext, logo.bytes)
  }
  return zip.generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }) as Blob
}

export default buildTextDocx
