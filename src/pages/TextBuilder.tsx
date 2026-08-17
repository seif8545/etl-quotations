import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { waitForAssets } from '../lib/pdf'
import { slugify } from './PackageBuilder'
import TextDoc, { ItemView } from './TextDoc'
import type { TextDocView } from './TextDoc'
import {
  BASE_FS, DEFAULT_MAX_PAGES, buildPages, guessTitle, packMeasured, parseDoc, streamOf,
} from '../lib/textItinerary'
import type { TextDocData, TextPage } from '../lib/textItinerary'

/**
 * Paste a block of text, get a paginated A4 document and a shareable link.
 *
 * This is NOT the package builder. There is no itinerary model here, no days table, no
 * pricing — the text block IS the document, and the day breaks are read out of it. Keep
 * the two apart: the moment this starts growing structured fields it becomes a worse
 * PackageBuilder, and the whole point is that an agent can paste and send.
 */

const CONTACT = { phone: '+20 105 537 6633', email: 'info@egypttoplight.net', website: 'egypttoplight.net', social: '@egypttoplighttravel' }

const PHOTO_BUCKET = 'tour-photos'
const MAX_PHOTOS = 4

/** Relative library paths resolve under /images/tours/; uploads are already absolute. */
const photoSrc = (p: string) => (/^(https?:|data:)/.test(p) ? p : '/images/tours/' + p)

export interface TextDocRow {
  id: number
  name: string
  slug: string | null
  published: boolean
  data: TextDocData
}

export default function TextBuilder({ saved, onClose }: { saved?: TextDocRow; onClose: () => void }) {
  const [title, setTitle] = useState(saved?.data?.title ?? '')
  const [text, setText] = useState(saved?.data?.text ?? '')
  const [photos, setPhotos] = useState<string[]>(saved?.data?.photos ?? [])
  const [rowId, setRowId] = useState<number | null>(saved?.id ?? null)
  const [slug, setSlug] = useState(saved?.slug ?? '')
  const [published, setPublished] = useState(!!saved?.published)
  const [library, setLibrary] = useState<Record<string, string[]>>({})
  const [uploads, setUploads] = useState<Record<string, { name: string; url: string }[]>>({})
  const [pickerOpen, setPickerOpen] = useState(false)
  const [urlDraft, setUrlDraft] = useState('')
  const [maxPages, setMaxPages] = useState<number>(saved?.data?.maxPages ?? DEFAULT_MAX_PAGES)
  const [zoom, setZoom] = useState(0.58)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [overflow, setOverflow] = useState<number[]>([])
  /** Measured here, stored in the row: the website renderer has no way to size an image. */
  const [photoWidthPct, setPhotoWidthPct] = useState<number>(saved?.data?.photoWidthPct ?? 100)

  const docRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const measureRef = useRef<HTMLDivElement | null>(null)

  const stream = useMemo(() => streamOf(parseDoc(text)), [text])
  /**
   * Pages start from the pure estimate and are replaced by the measured pack as soon as the
   * rig below has laid the stream out. The estimate cannot be trusted on its own: a ten
   * percent error in characters-per-line is the difference between three pages and four.
   */
  const [pages, setPages] = useState<TextPage[]>(() => buildPages(saved?.data?.text ?? '', saved?.data?.maxPages ?? DEFAULT_MAX_PAGES))

  useEffect(() => {
    const host = measureRef.current
    const flow = host?.querySelector<HTMLElement>('.tp-flow')
    if (!host || !flow) { setPages(buildPages(text, maxPages)); return }
    const run = () => {
      const measure = (k: number) => {
        flow.style.fontSize = `${BASE_FS * k}px`
        const kids = Array.from(flow.children) as HTMLElement[]
        const tops = kids.map((c) => c.offsetTop)
        const total = flow.offsetHeight
        // offsetTop deltas rather than offsetHeight: they include the margins between items
        // and the collapsing between them, which is what the real flow will do.
        return kids.map((c, i) => (i + 1 < kids.length ? tops[i + 1] - tops[i] : total - tops[i]))
      }
      setPages(stream.length ? packMeasured(stream, measure, maxPages) : [])
    }
    run()
    const t = setTimeout(run, 0)
    // The webfonts change every wrapped line count, so a pass against the fallback font
    // would choose the wrong scale.
    document.fonts?.ready.then(run).catch(() => {})
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream, maxPages])

  const shownTitle = title.trim() || guessTitle(text)

  const view: TextDocView = useMemo(() => ({
    title: shownTitle,
    photos: photos.slice(0, MAX_PHOTOS).map(photoSrc),
    pages,
    contact: CONTACT,
  }), [shownTitle, photos, pages])

  useEffect(() => {
    fetch('/images/tours/manifest.json').then((r) => r.json()).then(setLibrary).catch(() => {})
    ;(async () => {
      try {
        const root = await supabase.storage.from(PHOTO_BUCKET).list('', { limit: 200 })
        const out: Record<string, { name: string; url: string }[]> = {}
        for (const entry of root.data ?? []) {
          if (entry.id) continue // a file at the root, not a collection folder
          const { data: inner } = await supabase.storage.from(PHOTO_BUCKET).list(entry.name, { limit: 500, sortBy: { column: 'name', order: 'asc' } })
          const imgs = (inner ?? []).filter((f) => /\.(jpe?g|png|webp|gif)$/i.test(f.name))
          if (imgs.length) {
            out[entry.name] = imgs.map((f) => ({
              name: f.name,
              url: supabase.storage.from(PHOTO_BUCKET).getPublicUrl(entry.name + '/' + f.name).data.publicUrl,
            }))
          }
        }
        setUploads(out)
      } catch { /* the picker just shows the local library — loadUploads must never break the page */ }
    })()
  }, [])

  const pretty = (k: string) => k.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

  /** Toggle, capped at four. Clicking a chosen photo removes it, so the cap is never a dead end. */
  function togglePhoto(p: string) {
    setPhotos((cur) => cur.includes(p)
      ? cur.filter((x) => x !== p)
      : cur.length >= MAX_PHOTOS ? cur : [...cur, p])
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('')
    try { await fn() } catch (e: any) { setError(e?.message ?? String(e)) }
    setBusy(false)
  }

  function payload(): TextDocData {
    // `pages` is stored, not just the text: the public renderer prints it verbatim so the
    // parser is never duplicated in the website repo. Re-save after a parser change.
    return { title: shownTitle, text, photos: photos.slice(0, MAX_PHOTOS), maxPages, photoWidthPct, pages }
  }

  /** Unique-ish slug on insert: suffix rather than fail, exactly as packages do. */
  async function freeSlug(base: string): Promise<string> {
    const root = slugify(base) || 'itinerary'
    for (let i = 0; i < 25; i++) {
      const cand = i === 0 ? root : `${root}-${i + 1}`.slice(0, 60).replace(/-+$/, '')
      const { data } = await supabase.from('q_text_docs').select('id').eq('slug', cand).limit(1)
      if (!data || data.length === 0) return cand
    }
    return `${root}-${Math.floor(Math.random() * 9000 + 1000)}`.slice(0, 60)
  }

  const save = () => run(async () => {
    if (!pages.length) throw new Error('Nothing to save yet — paste the itinerary text first.')
    if (rowId) {
      const { error: e } = await supabase.from('q_text_docs')
        .update({ name: shownTitle, data: payload(), updated_at: new Date().toISOString() })
        .eq('id', rowId)
      if (e) throw e
      setNotice(`Saved. ${pages.length} page${pages.length === 1 ? '' : 's'}.`)
      return
    }
    const { data: u } = await supabase.auth.getUser()
    if (!u.user) throw new Error('Not signed in')
    const s = await freeSlug(shownTitle)
    const { data, error: e } = await supabase.from('q_text_docs')
      .insert({ name: shownTitle, slug: s, data: payload(), created_by: u.user.id })
      .select('id, slug').single()
    if (e) throw e
    setRowId(Number((data as any).id))
    setSlug(String((data as any).slug))
    setNotice(`Saved as a new document, ${pages.length} page${pages.length === 1 ? '' : 's'}.`)
  })

  const saveSlug = () => run(async () => {
    if (!rowId) throw new Error('Save the document first.')
    const clean = slugify(slug)
    if (!clean) throw new Error('That link name is empty once cleaned up.')
    const { error: e } = await supabase.from('q_text_docs').update({ slug: clean }).eq('id', rowId)
    if (e) throw (e as any).code === '23505' ? new Error('That link is already used by another document.') : e
    setSlug(clean)
    setNotice('Link name saved.')
  })

  const togglePublish = () => run(async () => {
    if (!rowId) throw new Error('Save the document before publishing.')
    const next = !published
    const patch: Record<string, unknown> = { published: next }
    // Stamped on the FIRST publish only, so it records when the link actually went live.
    if (next) patch.published_at = new Date().toISOString()
    const { error: e } = await supabase.from('q_text_docs').update(patch).eq('id', rowId)
    if (e) throw e
    setPublished(next)
    setNotice(next ? 'Live. Anyone with the link can read it.' : 'Unpublished — the link now returns 404.')
  })

  const link = slug ? `https://egypttoplight.net/pages/${slug}` : ''

  /**
   * Per-page capture, the same pipeline PackageBuilder settled on: one html2canvas per
   * A4 block rather than one tall canvas sliced by html2pdf. It sidesteps the
   * scroll-offset bug entirely (handoff §8-I) because each page is captured on its own.
   * The preview transform is dropped to 1 for the duration — html2canvas reads layout,
   * and capturing a scaled ancestor produces a scaled, misplaced page.
   */
  const exportPdf = () => run(async () => {
    const node = docRef.current
    const stage = stageRef.current
    if (!node || !pages.length) throw new Error('Nothing to export yet.')
    const prevZoom = zoom
    if (stage) stage.style.transform = 'scale(1)'
    try {
      await waitForAssets(node)
      const scrolled: Array<[HTMLElement, number, number]> = []
      for (let el: HTMLElement | null = node.parentElement; el; el = el.parentElement) {
        if (el.scrollTop || el.scrollLeft) { scrolled.push([el, el.scrollTop, el.scrollLeft]); el.scrollTop = 0; el.scrollLeft = 0 }
      }
      const winX = window.scrollX, winY = window.scrollY
      window.scrollTo(0, 0)
      try {
        const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])
        const W = 794, H = 1123, SCALE = 2, CUT = 18
        const crop = (src: HTMLCanvasElement) => {
          const out = document.createElement('canvas')
          out.width = src.width; out.height = src.height
          const ctx = out.getContext('2d')
          if (!ctx) return src
          ctx.fillStyle = '#fffefa'
          ctx.fillRect(0, 0, out.width, out.height)
          // Removes html2canvas's left/right capture seam; horizontal only, so the 1123px
          // page geometry is untouched.
          ctx.drawImage(src, CUT, 0, src.width - CUT * 2, src.height, 0, 0, out.width, out.height)
          return out
        }
        const blocks = Array.from(node.children) as HTMLElement[]
        const pdf = new jsPDF({ unit: 'px', format: [W, H], orientation: 'portrait', hotfixes: ['px_scaling'] })
        for (let i = 0; i < blocks.length; i++) {
          const raw = await html2canvas(blocks[i], { scale: SCALE, useCORS: true, backgroundColor: '#fffefa', logging: false })
          if (i > 0) pdf.addPage([W, H], 'portrait')
          pdf.addImage(crop(raw).toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, W, H)
        }
        pdf.save((shownTitle || 'itinerary').replace(/[^\w\-]+/g, '_') + '.pdf')
      } finally {
        scrolled.forEach(([el, t, l]) => { el.scrollTop = t; el.scrollLeft = l })
        window.scrollTo(winX, winY)
      }
    } finally {
      if (stage) stage.style.transform = `scale(${prevZoom})`
    }
  })

  return (
    <div className="builder-overlay">
      <div className="tb">
        <div className="tb-bar">
          <b className="fr">Text → Pages</b>
          <span className="muted small">
            {pages.length} page{pages.length === 1 ? '' : 's'}
            {pages[0] ? ` · ${(BASE_FS * pages[0].scale).toFixed(1)}px type` : ''}
          </span>
          <label className="tb-max">Fit into
            <input type="number" min={1} max={12} value={maxPages}
              onChange={(e) => setMaxPages(Math.max(1, Math.min(12, +e.target.value || DEFAULT_MAX_PAGES)))} />
            pages
          </label>
          {pages.length > maxPages && (
            <span className="tb-warn" title="7px is the smallest type this will print at — raise the page target, or cut some text">
              will not fit in {maxPages} — at the smallest readable type it needs {pages.length}
            </span>
          )}
          {overflow.length > 0 && (
            <span className="tb-warn" title="Add a paragraph break, or shorten a day in the text">
              page{overflow.length === 1 ? '' : 's'} {overflow.map((i) => i + 1).join(', ')} still too full
            </span>
          )}
          <span className="spacer" />
          <label className="tb-zoom">Zoom
            <input type="range" min={30} max={100} value={Math.round(zoom * 100)}
              onChange={(e) => setZoom(+e.target.value / 100)} />
          </label>
          <button className="primary" disabled={busy} onClick={save}>{busy ? 'Working…' : rowId ? 'Save changes' : 'Save'}</button>
          <button disabled={busy} onClick={exportPdf}>Download PDF</button>
          <button className="link" onClick={onClose}>Close</button>
        </div>

        {rowId && (
          <div className="tb-publish">
            <span className={published ? 'tb-live on' : 'tb-live'}>{published ? 'Live' : 'Draft'}</span>
            <span className="muted small">egypttoplight.net/pages/</span>
            <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="link-name" />
            <button onClick={() => setSlug(slugify(shownTitle))}>Generate</button>
            <button disabled={busy} onClick={saveSlug}>Save link</button>
            <button disabled={busy} onClick={togglePublish}>{published ? 'Unpublish' : 'Publish'}</button>
            {link && published && (
              <button className="link" onClick={() => navigator.clipboard?.writeText(link)}>Copy link</button>
            )}
          </div>
        )}

        {error && <div className="error">{error}</div>}
        {notice && <div className="notice">{notice}</div>}

        <div className="tb-body">
          <div className="tb-edit">
            <label>Document title <span className="muted small">(optional — the first line is used otherwise)</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={guessTitle(text)} />
            </label>

            <label>Itinerary text
              <textarea className="tb-text" value={text} onChange={(e) => setText(e.target.value)}
                placeholder={'Paste the whole itinerary here.\n\nDay 1 — Arrival in Cairo\nMet at the airport and transferred to the hotel.\nMeals: Dinner\nOvernight in Cairo\n\nDay 02: Giza & the Grand Egyptian Museum\n…'} />
            </label>
            <p className="muted small tb-hint">
              Days are read from the text — <b>Day 1</b>, <b>DAY 01</b>, <b>DAY 04 | GIZA II Welcome</b>, with or
              without dates — and run one after another down the page; they do not each get a sheet.
              A <b>Meals:</b> line and a <b>Hotel:</b> / <b>Stay:</b> / <b>Overnight…</b> line become the chips under
              each day. <b>Included services</b> / <b>Inclusions</b> and <b>Not included</b> / <b>Exclusions</b> become
              the two-column list, and <b>OFFERED 4 Star package:</b> blocks become the rate table at the end.
              Type is sized automatically to land inside the page target.
            </p>

            <div className="tb-photos-head">
              <b>Photos <span className="muted small">({photos.length}/{MAX_PHOTOS}, left column)</span></b>
              <button className="link" onClick={() => setPickerOpen(true)}>Choose photos…</button>
            </div>
            <div className="tb-chosen">
              {photos.length === 0 && <span className="muted small">None — the left column stays empty.</span>}
              {photos.map((p) => (
                <span className="tb-thumb" key={p}>
                  <img src={photoSrc(p)} alt="" />
                  <button onClick={() => togglePhoto(p)} title="Remove">×</button>
                </span>
              ))}
            </div>
          </div>

          {/* The measuring rig — off-screen, never printed, never exported. */}
          <div className="tdoc tdoc-measure" ref={measureRef} aria-hidden="true">
            <div className="tp-flow" style={{ fontSize: `${BASE_FS}px` }}>
              {stream.map((it, i) => <ItemView it={it} key={i} />)}
            </div>
          </div>

          <div className="tb-preview">
            <div className="tb-stage" ref={stageRef} style={{ transform: `scale(${zoom})` }}>
              <TextDoc ref={docRef} data={view} onOverflow={setOverflow} onPhotoWidth={setPhotoWidthPct} />
            </div>
          </div>
        </div>
      </div>

      {pickerOpen && (
        <div className="picker-overlay" onClick={() => setPickerOpen(false)}>
          <div className="picker" onClick={(e) => e.stopPropagation()}>
            <div className="picker-head">
              <b>Photos — pick up to {MAX_PHOTOS}</b>
              <button onClick={() => setPickerOpen(false)}>×</button>
            </div>
            {/* Reuses the package picker's own classes so the two look identical. */}
            <div className="picker-grid">
              <div className="tb-url">
                <input value={urlDraft} onChange={(e) => setUrlDraft(e.target.value)} placeholder="…or paste an image URL" />
                <button onClick={() => { if (urlDraft.trim()) { togglePhoto(urlDraft.trim()); setUrlDraft('') } }}>Add</button>
              </div>
              {Object.entries(uploads).map(([area, files]) => (
                <div className="picker-area" key={'u-' + area}>
                  <h5>{pretty(area)} — Uploaded</h5>
                  <div className="picker-thumbs">
                    {files.map((f) => (
                      <img key={f.url} src={f.url} alt="" className={photos.includes(f.url) ? 'on' : ''}
                        onClick={() => togglePhoto(f.url)} />
                    ))}
                  </div>
                </div>
              ))}
              {Object.entries(library).map(([area, files]) => (
                <div className="picker-area" key={area}>
                  <h5>{pretty(area)}</h5>
                  <div className="picker-thumbs">
                    {files.map((f) => {
                      const rel = area + '/' + f
                      return <img key={rel} src={photoSrc(rel)} alt="" className={photos.includes(rel) ? 'on' : ''}
                        onClick={() => togglePhoto(rel)} />
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
