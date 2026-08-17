import { forwardRef, useCallback, useEffect, useRef, useState } from 'react'
import type { TextPage } from '../lib/textItinerary'

/**
 * The printable document for a pasted text block: one A4 page per day.
 *
 * Deliberately the same mechanics as ItineraryDoc — 794 × 1123 px blocks, no page-break
 * CSS, and the stylesheet injected into <head> rather than rendered inline — because the
 * exporter slices the captured canvas 1:1 and every one of those choices was paid for
 * once already. Read the handoff before changing any of them:
 *   · an inline <style> inside the root gives html2canvas a phantom box at the top
 *   · min-height + page-break-after double-breaks and yields a blank page per section
 *   · a flex child with overflow:visible cannot shrink below its content, so the fit test
 *     must measure the PAGE geometry, never the content wrapper
 */

export interface TextDocContact { phone: string; email: string; website: string; social: string }

export interface TextDocView {
  title: string
  /** 0 to 4, document-level: the same stack runs down the left column of every page. */
  photos: string[]
  pages: TextPage[]
  contact: TextDocContact
}

/* Column arithmetic, spelled out so it is obvious that it adds to 794. */
const PAD_X = 34, COL_PHOTO = 150, GAP = 22, COL_TEXT = 430, COL_MARK = 102

const CSS = `
.tdoc { width: 794px; background: #fffefa; color: #12243b; font-family: Inter, system-ui, sans-serif; }
.tdoc * { box-sizing: border-box; }
.tp { position: relative; width: 794px; height: 1123px; overflow: hidden; background: #fffefa;
  padding: 30px ${PAD_X}px 18px; display: flex; flex-direction: column; }
.tp + .tp { border-top: 0; }

/* brand pill */
.tp-pill { align-self: center; display: flex; align-items: baseline; gap: 8px;
  border: 1px solid #e3d7b6; background: #fff; border-radius: 999px; padding: 7px 20px 8px; }
.tp-pill b { font-family: Fraunces, Georgia, serif; font-size: 15px; letter-spacing: 2.4px; color: #0e2a47; font-weight: 600; }
.tp-pill span { font-size: 8.5px; letter-spacing: 4px; color: #c8960a; }

/* day heading */
.tp-head { margin: 22px 0 0; text-align: center; }
.tp-day { font-family: Fraunces, Georgia, serif; font-size: 27px; line-height: 1.15; color: #0e2a47; font-weight: 600; }
.tp-title { font-size: 13px; letter-spacing: 1.6px; text-transform: uppercase; color: #806000; margin-top: 7px; }
.tp-cont { font-size: 10.5px; letter-spacing: 2px; text-transform: uppercase; color: #8a95a6; margin-top: 6px; }
.tp-rule { width: 62px; height: 2px; background: #c8960a; margin: 13px auto 0; }

/* the three columns */
.tp-cols { flex: 1; min-height: 0; display: flex; gap: ${GAP}px; margin-top: 20px; }
.tp-photos { width: ${COL_PHOTO}px; flex: 0 0 ${COL_PHOTO}px; overflow: hidden; display: flex; flex-direction: column; gap: 12px; }
.tp-photos img { display: block; width: 100%; height: auto; border-radius: 3px; border: 1px solid #eadfc4; }
.tp-body { width: ${COL_TEXT}px; flex: 0 0 ${COL_TEXT}px; min-height: 0; display: flex; flex-direction: column; }
.tp-fit { flex: 0 0 auto; }
.tp-body p { margin: 0 0 9px; font-size: 15px; line-height: 1.62; text-align: justify; color: #22344c; }
.tp-body p:first-child::first-letter { font-family: Fraunces, Georgia, serif; font-size: 21px; color: #0e2a47; }
.tp-marks { width: ${COL_MARK}px; flex: 0 0 ${COL_MARK}px; display: flex; flex-direction: column; align-items: center; gap: 26px; padding-top: 4px; }
.tp-marks svg { display: block; }
.tp-dots { flex: 1; width: 1px; background-image: linear-gradient(#dcd0b2 40%, rgba(0,0,0,0) 0%); background-size: 1px 7px; background-repeat: repeat-y; }

/* meals & stay, its own area at the foot of the text column */
/* margin-top:auto pins the strip to the foot of the text column, so meals and stay always
   sit in the same place whether the day ran long or short. The fit test subtracts this
   block's measured height, so pinning it does not change the arithmetic. */
.tp-strip { flex: 0 0 auto; margin-top: auto; padding-top: 11px; border-top: 1px solid #eadfc4;
  display: flex; flex-wrap: wrap; gap: 7px 9px; align-items: center; }
.tp-chip { font-size: 10.5px; letter-spacing: 1.2px; text-transform: uppercase; color: #806000;
  border: 1px solid #e3d7b6; background: #faf5e9; border-radius: 999px; padding: 4px 10px; }
.tp-chip.stay { color: #0e2a47; background: #fff; }
.tp-chip b { font-weight: 600; letter-spacing: 1.6px; }

/* footer: contact, on every page */
.tp-foot { flex: 0 0 auto; margin-top: 14px; padding-top: 11px; border-top: 1px solid #eadfc4;
  display: flex; align-items: center; justify-content: center; gap: 16px; }
.tp-foot span { font-size: 10px; letter-spacing: 0.7px; color: #6a7789; }
.tp-foot i { font-style: normal; color: #c8960a; }
.tp-no { position: absolute; right: ${PAD_X}px; bottom: 16px; font-size: 9.5px; letter-spacing: 1.6px; color: #b3a98f; }
`

/* ---------- the predefined right-margin ornaments ---------- */

const G = '#c8960a', N = '#0e2a47'

const Stamp = () => (
  <svg width="58" height="66" viewBox="0 0 58 66" aria-hidden="true">
    <rect x="3" y="3" width="52" height="60" fill="#fff" stroke={G} strokeWidth="1"
      strokeDasharray="3 3" />
    <rect x="9" y="9" width="40" height="40" fill="none" stroke={N} strokeWidth="0.8" />
    <path d="M13 45 L24 22 L35 45 Z" fill="none" stroke={N} strokeWidth="0.9" />
    <path d="M28 45 L38 27 L46 45 Z" fill="none" stroke={G} strokeWidth="0.9" />
    <circle cx="42" cy="16" r="4" fill="none" stroke={G} strokeWidth="0.9" />
    <text x="29" y="59" fontSize="7" textAnchor="middle" fill={N} letterSpacing="1.4">EGYPT</text>
  </svg>
)

const Plane = () => (
  <svg width="62" height="52" viewBox="0 0 62 52" aria-hidden="true">
    <path d="M4 40 C18 30 34 18 56 8" fill="none" stroke={G} strokeWidth="0.9" strokeDasharray="4 3" />
    <path d="M52 4 L58 12 L46 16 L44 26 L39 19 L28 22 L34 13 L30 8 Z" fill="none" stroke={N} strokeWidth="0.9" />
  </svg>
)

const Palm = () => (
  <svg width="54" height="66" viewBox="0 0 54 66" aria-hidden="true">
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
  <svg width="58" height="56" viewBox="0 0 58 56" aria-hidden="true">
    <path d="M29 48 C29 34 29 22 29 8" fill="none" stroke={N} strokeWidth="1" />
    <path d="M29 30 C20 26 15 16 17 6 C25 10 29 20 29 30 Z" fill="none" stroke={G} strokeWidth="0.9" />
    <path d="M29 30 C38 26 43 16 41 6 C33 10 29 20 29 30 Z" fill="none" stroke={G} strokeWidth="0.9" />
    <path d="M29 32 C22 34 12 32 6 26 C14 22 25 25 29 32 Z" fill="none" stroke={N} strokeWidth="0.8" />
    <path d="M29 32 C36 34 46 32 52 26 C44 22 33 25 29 32 Z" fill="none" stroke={N} strokeWidth="0.8" />
    <path d="M18 50 H40" stroke={G} strokeWidth="0.9" />
  </svg>
)

const MARKS = [Stamp, Plane, Palm, Lotus]

/* ---------- the fit pass ---------- */

/**
 * Type scales tried in order. Nothing below 0.78 — past that the page stops looking like
 * a document and starts looking like a mistake, and the parser has already split anything
 * genuinely long onto a second page.
 */
const FIT_SCALES = [1, 0.96, 0.92, 0.88, 0.84, 0.8, 0.78]

/**
 * Shrink each page until its text fits, and report anything that still does not.
 *
 * Available height is derived from the PAGE and its own padding minus every sibling that
 * shares the column, never from the body wrapper: `.tp-body` is a flex child whose
 * automatic minimum size is its own content, so measuring it compares the content against
 * itself and passes on the first try. That exact mistake shipped once in this codebase and
 * made a whole fix a silent no-op.
 */
function fitPages(root: HTMLElement): number[] {
  const over: number[] = []
  const pages = Array.from(root.querySelectorAll<HTMLElement>('.tp'))
  pages.forEach((page, i) => {
    const cols = page.querySelector<HTMLElement>('.tp-cols')
    const body = page.querySelector<HTMLElement>('.tp-body')
    const fit = page.querySelector<HTMLElement>('.tp-fit')
    if (!cols || !body || !fit) return
    const strip = body.querySelector<HTMLElement>('.tp-strip')
    const ps = Array.from(fit.querySelectorAll<HTMLElement>('p'))

    const avail = () => cols.clientHeight - (strip ? strip.offsetHeight + 14 : 0)
    const apply = (k: number) => {
      ps.forEach((p) => {
        // Inline px only: no calc(), no var() — html2canvas clones the DOM and reads
        // computed values, and calc has bitten this project before.
        p.style.fontSize = `${(15 * k).toFixed(2)}px`
        p.style.marginBottom = `${Math.max(5, Math.round(9 * k))}px`
      })
      const first = ps[0]
      if (first) first.style.letterSpacing = k < 0.9 ? '-0.1px' : ''
    }

    let done = false
    for (const k of FIT_SCALES) {
      apply(k)
      if (fit.offsetHeight <= avail()) { done = true; break }
    }
    if (!done) over.push(i)
  })
  return over
}

const TextDoc = forwardRef<HTMLDivElement, { data: TextDocView; onOverflow?: (pages: number[]) => void }>(
  function TextDoc({ data, onOverflow }, ref) {
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
          // The shortest column wins, so one width works on every page: a two-line day
          // title costs ~40px of column and the stack must still clear the footer there.
          const room = Math.min(...cols.map((c) => c.clientHeight))
          const ims = Array.from(cols[0].querySelectorAll('img'))
          const full = cols[0].clientWidth - 2   // the 1px border either side
          // Heights come from the natural ratio, never from offsetHeight: this effect runs
          // again on every font and image load, and measuring already-shrunken images would
          // shrink them a second time on each pass.
          const stack = ims.reduce((s, im) => s + (im.naturalWidth ? (full * im.naturalHeight) / im.naturalWidth + 2 : 0), 0)
          const gaps = 12 * Math.max(0, ims.length - 1)
          // Only the images scale — the gaps do not — so the ratio is taken against image
          // height alone. Scaling `stack + gaps` undershoots and leaves the last photo
          // hanging over the bottom of the column.
          setPhotoW(stack > 0 && stack + gaps > room
            ? Math.max(50, Math.floor(((room - gaps) / stack) * 100))
            : 100)
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
          const hasStrip = p.meals.length > 0 || !!p.stay
          return (
            <div className="tp" key={i}>
              <div className="tp-pill"><b>EGYPT TOP LIGHT</b><span>TRAVEL</span></div>

              <div className="tp-head">
                <div className="tp-day fr">{p.label || data.title}</div>
                {p.title && <div className="tp-title">{p.title}</div>}
                {p.parts > 1 && <div className="tp-cont">continued — {p.part} of {p.parts}</div>}
                <div className="tp-rule" />
              </div>

              <div className="tp-cols">
                <div className="tp-photos">
                  {data.photos.slice(0, 4).map((src, j) => (
                    <img key={j} src={src} alt="" style={photoW < 100 ? { width: `${photoW}%` } : undefined} />
                  ))}
                </div>

                <div className="tp-body">
                  <div className="tp-fit">
                    {p.bullets.map((b, j) => <p key={j}>{b}</p>)}
                  </div>
                  {hasStrip && (
                    <div className="tp-strip">
                      {p.meals.map((m) => <span className="tp-chip" key={m}>{m}</span>)}
                      {p.stay && <span className="tp-chip stay"><b>Stay</b> · {p.stay}</span>}
                    </div>
                  )}
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

export default TextDoc
