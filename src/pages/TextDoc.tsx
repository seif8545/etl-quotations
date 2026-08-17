import { forwardRef, useCallback, useEffect, useRef, useState } from 'react'
import type { Item, TextPage } from '../lib/textItinerary'
import { AVAIL, AVAIL_FIRST, BASE_FS } from '../lib/textItinerary'

/**
 * The printable document for a pasted text block.
 *
 * Days FLOW: one after another down the page, a new day does not start a new page, and a
 * fifteen-day programme is two or three sheets. The packer in textItinerary.ts decides where
 * the breaks fall and at what type scale; this file only prints what it is given.
 *
 * Mechanics are shared with ItineraryDoc — 794 × 1123 px blocks, no page-break CSS, and the
 * stylesheet injected into <head> rather than rendered inline — because the exporter slices
 * each block 1:1 and every one of those choices was paid for once already:
 *   · an inline <style> inside the root gives html2canvas a phantom box at the top
 *   · min-height + page-break-after double-breaks and yields a blank page per section
 *   · a flex child with overflow:visible cannot shrink below its content, so a fit test must
 *     measure the PAGE geometry and never the content wrapper
 */

export interface TextDocContact { phone: string; email: string; website: string; social: string }

export interface TextDocView {
  title: string
  /** 0 to 4, document-level: the same stack runs down the left column of every page. */
  photos: string[]
  pages: TextPage[]
  contact: TextDocContact
}

/* Column arithmetic, spelled out so it is obvious that it adds to 794. Wider text column
   than the first version: the whole point is density, and 496px of justified prose is what
   makes a fifteen-day programme land in three pages instead of five. */
const PAD_X = 34, COL_PHOTO = 132, GAP = 18, COL_TEXT = 496, COL_MARK = 62

const CSS = `
.tdoc { width: 794px; background: #fffefa; color: #12243b; font-family: Inter, system-ui, sans-serif; }
.tdoc * { box-sizing: border-box; }
.tp { position: relative; width: 794px; height: 1123px; overflow: hidden; background: #fffefa;
  padding: 30px ${PAD_X}px 18px; display: flex; flex-direction: column; }

/* The measuring rig. The builder renders the WHOLE item stream in here at one candidate
   type scale, reads back each item's real height, and packs pages from that — so the page
   count is decided by the actual wrapped text in the actual webfonts, not by an estimate.
   Off-screen rather than display:none, because a hidden box has no layout to measure. */
.tdoc-measure { position: absolute; left: -12000px; top: 0; width: ${COL_TEXT}px; visibility: hidden;
  pointer-events: none; height: auto; overflow: visible; }

.tp-pill { align-self: center; display: flex; align-items: baseline; gap: 8px;
  border: 1px solid #e3d7b6; background: #fff; border-radius: 999px; padding: 6px 18px 7px; }
.tp-pill b { font-family: Fraunces, Georgia, serif; font-size: 14px; letter-spacing: 2.2px; color: #0e2a47; font-weight: 600; }
.tp-pill span { font-size: 8px; letter-spacing: 3.6px; color: #c8960a; }

/* The document title, page 1 only. AVAIL_FIRST in the packer is AVAIL minus this block. */
.tp-doctitle { text-align: center; margin: 16px 0 0; }
.tp-doctitle h1 { font-family: Fraunces, Georgia, serif; font-size: 25px; line-height: 1.18; color: #0e2a47; font-weight: 600; margin: 0; }
.tp-doctitle .tp-rule { width: 58px; height: 2px; background: #c8960a; margin: 11px auto 0; }

.tp-cols { flex: 1; min-height: 0; display: flex; gap: ${GAP}px; margin-top: 16px; }
.tp-photos { width: ${COL_PHOTO}px; flex: 0 0 ${COL_PHOTO}px; overflow: hidden; display: flex; flex-direction: column; gap: 10px; }
.tp-photos img { display: block; width: 100%; height: auto; border-radius: 3px; border: 1px solid #eadfc4; }
.tp-body { width: ${COL_TEXT}px; flex: 0 0 ${COL_TEXT}px; min-height: 0; }
.tp-flow { flex: 0 0 auto; }
.tp-marks { width: ${COL_MARK}px; flex: 0 0 ${COL_MARK}px; display: flex; flex-direction: column; align-items: center; gap: 22px; padding-top: 2px; }
.tp-marks svg { display: block; }
.tp-dots { flex: 1; width: 1px; background-image: linear-gradient(#dcd0b2 40%, rgba(0,0,0,0) 0%); background-size: 1px 7px; background-repeat: repeat-y; }

/* Everything below sizes in em off .tp-flow's inline font-size, so one number sets the
   density of a whole page. em resolves to px in the html2canvas clone; calc() and var()
   are the ones that misbehave (see the handoff on the collapsed cover). */
.ti-day { margin: 0.9em 0 0.45em; }
.tp-flow > .ti-day:first-child { margin-top: 0; }
.ti-day b { display: block; font-family: Fraunces, Georgia, serif; font-size: 1.75em; line-height: 1.15; color: #0e2a47; font-weight: 600; }
.ti-day span { display: block; font-size: 0.92em; line-height: 1.35; letter-spacing: 0.09em; text-transform: uppercase; color: #806000; margin-top: 0.28em; }
.ti-day i { display: block; width: 34px; height: 1.5px; background: #c8960a; margin-top: 0.5em; font-style: normal; }
.ti-p { margin: 0 0 0.42em; font-size: 1em; line-height: 1.5; text-align: justify; color: #22344c; }
.ti-chips { display: flex; flex-wrap: wrap; gap: 0.32em 0.4em; align-items: center; margin: 0.55em 0 0.2em; }
.ti-chip { font-size: 0.82em; letter-spacing: 0.1em; text-transform: uppercase; color: #806000;
  border: 1px solid #e3d7b6; background: #faf5e9; border-radius: 999px; padding: 0.22em 0.7em; }
.ti-chip.stay { color: #0e2a47; background: #fff; }
.ti-chip b { font-weight: 600; letter-spacing: 0.13em; }

.ti-h { text-align: center; margin: 1.2em 0 0.7em; }
.ti-h b { font-family: Fraunces, Georgia, serif; font-size: 1.5em; color: #0e2a47; font-weight: 600; }
.ti-h i { display: block; width: 46px; height: 1.5px; background: #c8960a; margin: 0.45em auto 0; font-style: normal; }

.ti-two { display: flex; gap: 18px; align-items: flex-start; }
.ti-two > div { flex: 1 1 0; min-width: 0; }
.ti-two h6 { margin: 0 0 0.4em; font-size: 0.86em; letter-spacing: 0.14em; text-transform: uppercase; color: #806000; font-weight: 600; }
.ti-two ul { margin: 0; padding: 0; list-style: none; }
.ti-two li { position: relative; font-size: 0.94em; line-height: 1.42; padding-left: 0.85em; margin-bottom: 0.2em; color: #22344c; }
.ti-two li::before { content: ""; position: absolute; left: 0; top: 0.55em; width: 3px; height: 3px; border-radius: 50%; background: #c8960a; }
.ti-two .exc li::before { background: #b9c0ca; }

.ti-table { width: 100%; border-collapse: collapse; }
.ti-table th { font-size: 0.8em; letter-spacing: 0.12em; text-transform: uppercase; color: #806000; text-align: left;
  padding: 0 0.7em 0.4em; border-bottom: 1.5px solid #c8960a; font-weight: 600; }
.ti-table td { font-size: 0.94em; line-height: 1.4; padding: 0.55em 0.7em; border-bottom: 1px solid #eadfc4; vertical-align: top; color: #22344c; }
.ti-table td.cat { font-family: Fraunces, Georgia, serif; font-size: 1.05em; color: #0e2a47; white-space: nowrap; }
.ti-table td.rate { color: #0e2a47; font-weight: 600; white-space: nowrap; }
.ti-table td.hotels div { margin-bottom: 0.12em; }

.tp-foot { flex: 0 0 auto; margin-top: 12px; padding-top: 9px; border-top: 1px solid #eadfc4;
  display: flex; align-items: center; justify-content: center; gap: 15px; }
.tp-foot span { font-size: 9.5px; letter-spacing: 0.6px; color: #6a7789; }
.tp-foot i { font-style: normal; color: #c8960a; }
.tp-no { position: absolute; right: ${PAD_X}px; bottom: 15px; font-size: 9px; letter-spacing: 1.5px; color: #b3a98f; }
`

/* ---------- the predefined right-margin ornaments ---------- */

const G = '#c8960a', N = '#0e2a47'

const Stamp = () => (
  <svg width="52" height="60" viewBox="0 0 58 66" aria-hidden="true">
    <rect x="3" y="3" width="52" height="60" fill="#fff" stroke={G} strokeWidth="1" strokeDasharray="3 3" />
    <rect x="9" y="9" width="40" height="40" fill="none" stroke={N} strokeWidth="0.8" />
    <path d="M13 45 L24 22 L35 45 Z" fill="none" stroke={N} strokeWidth="0.9" />
    <path d="M28 45 L38 27 L46 45 Z" fill="none" stroke={G} strokeWidth="0.9" />
    <circle cx="42" cy="16" r="4" fill="none" stroke={G} strokeWidth="0.9" />
    <text x="29" y="59" fontSize="7" textAnchor="middle" fill={N} letterSpacing="1.4">EGYPT</text>
  </svg>
)

const Plane = () => (
  <svg width="56" height="47" viewBox="0 0 62 52" aria-hidden="true">
    <path d="M4 40 C18 30 34 18 56 8" fill="none" stroke={G} strokeWidth="0.9" strokeDasharray="4 3" />
    <path d="M52 4 L58 12 L46 16 L44 26 L39 19 L28 22 L34 13 L30 8 Z" fill="none" stroke={N} strokeWidth="0.9" />
  </svg>
)

const Palm = () => (
  <svg width="50" height="61" viewBox="0 0 54 66" aria-hidden="true">
    <path d="M27 62 C25 46 26 34 28 24" fill="none" stroke={N} strokeWidth="1" />
    <path d="M28 24 C18 18 10 19 5 25" fill="none" stroke={G} strokeWidth="0.9" />
    <path d="M28 24 C38 17 47 19 51 26" fill="none" stroke={G} strokeWidth="0.9" />
    <path d="M28 24 C22 12 14 8 8 9" fill="none" stroke={G} strokeWidth="0.9" />
    <path d="M28 24 C34 12 42 9 48 11" fill="none" stroke={G} strokeWidth="0.9" />
    <path d="M28 23 C27 12 29 6 31 3" fill="none" stroke={G} strokeWidth="0.9" />
    <path d="M17 62 H37" stroke={N} strokeWidth="0.8" />
  </svg>
)

const Lotus = () => (
  <svg width="52" height="50" viewBox="0 0 58 56" aria-hidden="true">
    <path d="M29 48 C29 34 29 22 29 8" fill="none" stroke={N} strokeWidth="1" />
    <path d="M29 30 C20 26 15 16 17 6 C25 10 29 20 29 30 Z" fill="none" stroke={G} strokeWidth="0.9" />
    <path d="M29 30 C38 26 43 16 41 6 C33 10 29 20 29 30 Z" fill="none" stroke={G} strokeWidth="0.9" />
    <path d="M29 32 C22 34 12 32 6 26 C14 22 25 25 29 32 Z" fill="none" stroke={N} strokeWidth="0.8" />
    <path d="M29 32 C36 34 46 32 52 26 C44 22 33 25 29 32 Z" fill="none" stroke={N} strokeWidth="0.8" />
    <path d="M18 50 H40" stroke={G} strokeWidth="0.9" />
  </svg>
)

const MARKS = [Stamp, Plane, Palm, Lotus]

/**
 * The browser-side backstop.
 *
 * The packer already chose a scale from its own estimate; this only trims the residual when
 * the real wrapped line count runs a little longer than predicted — four percent at a time,
 * five steps at most. Anything still over is reported so the builder can say so out loud
 * rather than let the bottom of a page vanish.
 *
 * `avail` comes from the page's own column geometry, never from `.tp-body`: a flex child's
 * automatic minimum size is its own content, so measuring the wrapper compares the content
 * against itself and passes on the first try. That exact mistake shipped once already.
 */
function fitPages(root: HTMLElement): number[] {
  const over: number[] = []
  Array.from(root.querySelectorAll<HTMLElement>('.tp')).forEach((page, i) => {
    const cols = page.querySelector<HTMLElement>('.tp-cols')
    const flow = page.querySelector<HTMLElement>('.tp-flow')
    if (!cols || !flow) return
    const base = Number(flow.dataset.fs) || BASE_FS
    const room = cols.clientHeight
    for (let step = 0; step <= 5; step++) {
      flow.style.fontSize = `${(base * Math.pow(0.96, step)).toFixed(3)}px`
      if (flow.offsetHeight <= room) return
    }
    over.push(i)
  })
  return over
}

export function ItemView({ it }: { it: Item }) {
  switch (it.t) {
    case 'day':
      return (
        <div className="ti-day">
          <b>{it.label}</b>
          {it.title && <span>{it.title}</span>}
          <i />
        </div>
      )
    case 'p':
      return <p className="ti-p">{it.text}</p>
    case 'chips':
      return (
        <div className="ti-chips">
          {it.meals.map((m) => <span className="ti-chip" key={m}>{m}</span>)}
          {it.stay && <span className="ti-chip stay"><b>Stay</b> · {it.stay}</span>}
        </div>
      )
    case 'h':
      return <div className="ti-h"><b>{it.text}</b><i /></div>
    case 'two':
      return (
        <div className="ti-two">
          {it.left.length > 0 && (
            <div>
              <h6>{it.leftTitle}</h6>
              <ul>{it.left.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          )}
          {it.right.length > 0 && (
            <div>
              <h6>{it.rightTitle}</h6>
              <ul className="exc">{it.right.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          )}
        </div>
      )
    case 'table':
      return (
        <table className="ti-table">
          <thead>
            <tr><th>Package</th><th>Per person, double</th><th>Offered hotels</th></tr>
          </thead>
          <tbody>
            {it.rows.map((r, i) => (
              <tr key={i}>
                <td className="cat">{r.category}</td>
                <td className="rate">{r.rate}</td>
                <td className="hotels">{r.hotels.map((h, j) => <div key={j}>{h}</div>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )
  }
}

const TextDoc = forwardRef<HTMLDivElement, {
  data: TextDocView
  onOverflow?: (pages: number[]) => void
  /** Reported so the builder can store it: the public renderer cannot measure an image. */
  onPhotoWidth?: (pct: number) => void
}>(
  function TextDoc({ data, onOverflow, onPhotoWidth }, ref) {
    const rootRef = useRef<HTMLDivElement | null>(null)
    /** Photos shrink together when the stack is taller than the column: ratio kept, no crop. */
    const [photoW, setPhotoW] = useState(100)

    const setRoot = useCallback((el: HTMLDivElement | null) => {
      rootRef.current = el
      if (typeof ref === 'function') ref(el)
      else if (ref) (ref as { current: HTMLDivElement | null }).current = el
    }, [ref])

    useEffect(() => {
      let el = document.getElementById('tdoc-css')
      if (!el) {
        el = document.createElement('style')
        el.id = 'tdoc-css'
        document.head.appendChild(el)
      }
      el.textContent = CSS
    })

    useEffect(() => {
      const root = rootRef.current
      if (!root) return
      const run = () => {
        const cols = Array.from(root.querySelectorAll<HTMLElement>('.tp-photos'))
        if (cols.length && data.photos.length) {
          // The shortest column wins, so one width works on every page: page 1 carries the
          // document title and has less room than the rest.
          const room = Math.min(...cols.map((c) => c.clientHeight))
          const ims = Array.from(cols[0].querySelectorAll('img'))
          const full = cols[0].clientWidth - 2   // the 1px border either side
          // Heights come from the natural ratio, never offsetHeight: this effect reruns on
          // every font and image load, and measuring already-shrunken images shrinks them again.
          const stack = ims.reduce((s, im) => s + (im.naturalWidth ? (full * im.naturalHeight) / im.naturalWidth + 2 : 0), 0)
          const gaps = 10 * Math.max(0, ims.length - 1)
          // Only the images scale — the gaps do not — so the ratio is taken against image
          // height alone. Scaling `stack + gaps` undershoots and leaves the last photo over the edge.
          const pct = stack > 0 && stack + gaps > room ? Math.max(45, Math.floor(((room - gaps) / stack) * 100)) : 100
          setPhotoW(pct)
          onPhotoWidth?.(pct)
        }
        onOverflow?.(fitPages(root))
      }
      run()
      const t = setTimeout(run, 0)
      // Fraunces and Inter change the wrapped line count, so a pass against the fallback
      // font leaves the wrong scale applied.
      document.fonts?.ready.then(run).catch(() => {})
      const imgs = Array.from(root.querySelectorAll('img'))
      imgs.forEach((im) => im.addEventListener('load', run))
      return () => { clearTimeout(t); imgs.forEach((im) => im.removeEventListener('load', run)) }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data])

    const c = data.contact
    return (
      <div className="tdoc" ref={setRoot}>
        {data.pages.map((p, i) => {
          const Mark = MARKS[i % MARKS.length]
          const fs = BASE_FS * (p.scale || 1)
          return (
            <div className="tp" key={i}>
              <div className="tp-pill"><b>EGYPT TOP LIGHT</b><span>TRAVEL</span></div>
              {i === 0 && (
                <div className="tp-doctitle">
                  <h1>{data.title}</h1>
                  <div className="tp-rule" />
                </div>
              )}
              <div className="tp-cols">
                <div className="tp-photos">
                  {data.photos.slice(0, 4).map((src, j) => (
                    <img key={j} src={src} alt="" style={photoW < 100 ? { width: `${photoW}%` } : undefined} />
                  ))}
                </div>
                <div className="tp-body">
                  {/* One inline px value sets the whole page's density; the fit pass nudges
                      this and only this. data-fs keeps the packer's choice for a re-run. */}
                  <div className="tp-flow" data-fs={fs} style={{ fontSize: `${fs}px` }}>
                    {p.items.map((it, j) => <ItemView it={it} key={j} />)}
                  </div>
                </div>
                <div className="tp-marks">
                  <Mark />
                  <div className="tp-dots" />
                </div>
              </div>
              <div className="tp-foot">
                <span><i>WhatsApp</i> {c.phone}</span>
                <span><i>Email</i> {c.email}</span>
                <span><i>Web</i> {c.website}</span>
                <span><i>Social</i> {c.social}</span>
              </div>
              <div className="tp-no">{i + 1} / {data.pages.length}</div>
            </div>
          )
        })}
      </div>
    )
  },
)

export { AVAIL, AVAIL_FIRST }
export default TextDoc
