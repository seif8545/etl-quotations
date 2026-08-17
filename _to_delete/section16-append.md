
---

## 16. TEXT → PAGES  (new, 2026-08-17)

A second, separate document type: paste a block of itinerary text, get A4 pages and a public
link. **It is not the package builder and must not grow into one.** There is no itinerary
model, no days table, no pricing — the text block *is* the document. The whole value is that
an agent pastes what a supplier sent and presses save.

Home → **Text → Pages**, or Documents → **Pages** tab → Open. New table, new route, new slug
namespace, so nothing here can reshape a package.

### Files

| file | what |
|---|---|
| `src/lib/textItinerary.ts` | parser + pagination. Pure, no DOM, unit-tested in node. |
| `src/pages/TextDoc.tsx` | the printable document (794×1123 blocks, CSS injected into `<head>`). |
| `src/pages/TextBuilder.tsx` | paste box, photo picker, save, slug/publish strip, per-page PDF. |
| `q_text_docs` | new table. `data = {title, text, photos[], pages[]}`. |
| **website repo** `functions/_lib/textDocHtml.js` | the public renderer. |
| **website repo** `functions/pages/[slug].js` | `egypttoplight.net/pages/<slug>`. |

Plus the Pages tab in `Documents.tsx`, the route in `App.tsx`, the tile in `Home.tsx`, and a
`.tb-*` block at the end of `styles.css`.

### Day headings come out of the text

`DAY_RE` in `textItinerary.ts` matches at line start, case-insensitive, through a leading
bullet or `**`: `Day 1`, `DAY 01`, `Day1`, `day 3:`, `Day 2 – Cairo`, `Day 04 (28 July) Luxor`.
The number is the only required part; the rest of the line becomes the page's subtitle, dates
included. `Day 1-2` reads as Day 1 with "-2" in the title — it prints correctly, which beats
refusing to split. Text before the first heading becomes an opening page.

`Meals:` / `Meal –` and `Stay:` / `Hotel:` / `Accommodation:` / bare `Overnight in X` are
lifted out of the prose into the chip strip at the foot of the text column. `B/L/D`,
`half board`, `full board` and `all-inclusive` normalise to chips; anything unrecognised is
printed as written rather than dropped, because a wrong-but-visible meal line can be fixed and
a silently missing one cannot.

### Why `pages[]` is stored and not recomputed

**The public renderer prints; it does not parse.** The app saves the finished `pages` array
into the row and `textDocHtml.js` walks it. That is the direct lesson of §12: the price-column
list existed in both repos, drifted, and published a solo quote as "Price on request" to a
client. There is no day-heading regex in the website repo and there must never be one.

Consequence: **change the parser and existing documents keep their old pagination until they
are re-saved.** Reopen and save each affected doc.

### Pagination, and the clipping trap this codebase keeps paying for

`paginate()` estimates from character counts (`CPL ≈ 57` at 15px in the 430px column,
measured in Chromium: 888 chars → 16 lines) and budgets `BODY_H = 806` against a real ~890px,
i.e. deliberately ~10% conservative. One day = one page where it fits; otherwise a
"continued — 2 of 3" page. `splitToFit()` breaks a paragraph taller than a page at sentence
boundaries — without it a Word paste arrives as one 3,000-character paragraph, the smallest
unit the packer can move, and half of it falls off the bottom.

`fitPages()` in `TextDoc.tsx` is the browser-side net: steps type 1 → 0.78 and reports any
page still over, which the builder shows as "page 4 still too full". **It derives available
height from `.tp-cols` geometry, never from `.tp-body`** — §11 documents why measuring the
content wrapper compares content against itself and passes on the first try, a mistake that
shipped once as a silent no-op.

The web page differs from the PDF on purpose: `min-height` instead of a fixed height, so a
page that would have been shrunk is simply taller online. Text that flows, never text that is
cut off.

### Photos

Document-level, 0–4, the same stack down the left column of every page — not tied to days.
Ratio is always preserved and nothing is cropped: when the stack is taller than the column all
photos shrink in width together. Three details worth keeping:

- the scale divides `room − gaps` by the **image** height, since the 12px gaps do not scale —
  dividing by `stack + gaps` undershoots and leaves the last photo over the edge;
- heights come from `naturalWidth/naturalHeight`, not `offsetHeight`, because the effect reruns
  on every font and image load and measuring already-shrunken images shrinks them again;
- the **shortest** column across all pages sets the width, so a two-line day title (which costs
  ~40px of column) cannot push the stack past the footer on that page.

Verified with four 1:2 portraits: scaled to 70%, stack 904px inside the tightest 876px…916px
column on every page.

### Verified

`tsc --noEmit` exits 0; `node --check` clean on both website files. Parser and pagination run
in node (heading variants, meal shapes, `Overnight in X`, junk input, sentence splitting).
Full documents rendered in headless Chromium via the §11 harness recipe — the CSS literal and
`FIT_SCALES` are regexed straight out of `TextDoc.tsx` so the harness cannot drift: every page
measured exactly 1123px, zero text overflow, footer and chip strip inside the page on all six
pages, photo column fitting everywhere. The renderer was exercised with an XSS probe (escaped),
relative and absolute photo paths, and an empty `data` row.

**Not yet done / not verified:**
- Nobody has clicked this in the real app, and the PDF has not been exported for real. The
  export is the per-page `html2canvas` + `jsPDF` loop copied from `PackageBuilder.exportPdf`,
  including the 18-device-px left/right crop; the preview transform is forced to `scale(1)`
  for the capture, which is essential — capturing a scaled ancestor produces a scaled page.
- `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` are already bound on the website's Production
  environment for the packages route, so the new route needs no new variables — but the
  website repo still has to be pushed before any `/pages/<slug>` link resolves.
- Photo uploads are not offered here; use the package builder's picker to get a file into the
  `tour-photos` bucket, then pick it from this one.
