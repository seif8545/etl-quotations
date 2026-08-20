
---

## 18. SESSION 2026-08-18 — THE PILL, THE WORD FILE, THE CENTRED PAGE, AND TWO VOUCHERS

Everything in §17 was reported committed and pushed before this session started, so §17g items
1 and 2 are the user's to confirm, not this session's work. What follows is new.

### 18a. The pill carries the logo now — both repos

`TextDoc.tsx` and `functions/_lib/textDocHtml.js` printed `EGYPT TOP LIGHT · TRAVEL` as set
type in the pill at the top of every page. Both now print the wordmark image, the way the
package PDF's cover already did.

- **In the app** the pill takes `TextDocView.logoUrl`, and `TextBuilder` loads
  `/images/logo.png` and holds it as a **data URL** — copied deliberately from
  `PackageBuilder`, for the reason recorded there: html2canvas rasterises the DOM as it
  stands, so a logo still in flight exports as an empty pill. The path is the initial value so
  the preview is never blank; the builder only passes the value to the .docx export once it is
  a data URL.
- **On the website** it is `/assets/images/logo/logo.webp` — the file the site header already
  loads, so it is warm in the reader's cache. `opts.logoUrl` overrides it and `''` turns it
  off, which falls back to the old set-type pill rather than to a gap.
- Both files keep the text pill as the fallback branch. Do not delete it: it is what a moved
  image degrades to.

### 18b. Text → Pages exports Word — `src/lib/textDocx.ts` (new)

A **Download Word** button next to Download PDF. The file is hand-written WordprocessingML
zipped with PizZip, and that choice needs defending because every other document in this app
goes through docxtemplater:

- The invoice and the voucher are **forms** — fixed furniture, a handful of holes. A .docx
  template with tags is exactly right for them.
- An itinerary is **not a form**. It is an arbitrary stream of days, paragraphs, chip strips, a
  two-column list and a rate table, in whatever order the pasted text happened to be, and a
  template cannot grow furniture it does not already have.

What it produces: logo in the page header (so it repeats), Georgia/navy day labels with the
tracked gold subtitle and the short gold rule, justified 10.5pt body, the meals/stay strip as a
line rather than as pill graphics, a borderless two-column Included / Not included table with
literal-bullet lists, the rate table with a navy header row, and the contact footer with
`PAGE / NUMPAGES`.

Three things in there that were paid for during the build:

1. **The stored page breaks are ignored.** The .docx page count can differ from the PDF's, by
   design — Word repaginates the moment anyone edits a line, and forcing our breaks in leaves
   half-empty sheets. Only the item stream is read out of `pages`.
2. **`cantSplit` + `tblHeader` on rate rows only.** Without them a rate row split across a
   sheet and stranded the tail of its hotel list under no heading. They are deliberately NOT
   on the Included / Not included row: that row is as tall as the longest list, and forbidding
   the split would push the whole block to the next sheet — the hole this avoids.
3. **The C0 control range is stripped in `esc`.** One stray control character out of a pasted
   PDF and Word calls the whole file unreadable content, with no clue which byte did it.

Verified by generating the file in node and converting it with LibreOffice — two pages, the
rate table whole on page 2 with its header repeated. **Never opened in real Word.**

### 18c. The web render centres its content vertically — and the app does not

`.tp-body` in `textDocHtml.js` is now `align-items: center`. This is **the one place that file
deliberately differs from `TextDoc.tsx`**, which pins the text to the top.

In the app that pin is load-bearing — stretch makes each `.tp-flow` as tall as the row and the
overflow check then measures the container against itself (§11's bug class). Nothing on the
website measures anything, and top-pinning left the last page — always the short one — as a
block of text with a third of a sheet of nothing under it and the footer stranded at the
bottom. The leftover room now falls half above and half below.

Pages that fill are untouched: there is no leftover to distribute. **The PDF still top-pins**,
so a short last page sits differently in the download than on the link. That was the user's
call; if the PDF should match, it is a separate change to the app's own CSS and the measuring
pass has to be re-checked when it happens.

### 18d. The voucher template has a row that clips, and a line that has never printed

Found while building today's vouchers, and it affects **every voucher the app has ever made**:

`public/templates/hotel_voucher_tpl.docx` contains a single-cell floating table between the
dates table and the rooms table whose row is `<w:trHeight w:hRule="exact" w:val="257"/>`. The
cell holds six empty paragraphs and then the hard-coded line

> `Room No 1    :   TWIN  Room  Based on soft all inclusive.`

At an exact 257 twips everything past the first fraction of an inch is clipped, so that line
has **never appeared on a printed voucher** — the gap between the two tables is it. Which is
lucky, because it is wrong for any job but the one it was typed for.

**This is fixed, and template and code shipped together.** The row is now `hRule="atLeast"`,
the cell's six empty paragraphs and the hard-coded line collapsed into a single `{room_note}`
tag, and:

- `VoucherData` gained **`roomNote`** — free text, printed between the dates table and the
  rooms table, with a "Room / meal note" textarea on the form and a placeholder showing the
  shape. Blank prints nothing.
- It is **not** defaulted from the rooming inputs. The rooms table underneath already lists
  room, type and guest, and the only things worth saying there — bed & breakfast, full board,
  two blocks with a gap — are not in the data. A derived default would just be noise that
  someone has to delete.
- `generateVoucherDocx` coerces it with `String(d.roomNote ?? '').trim()`, and that default
  lives in the function rather than only in the form because **`Documents.tsx` re-renders a
  saved row's `data` straight into it** — every voucher saved before today has no `roomNote`,
  and docxtemplater's default nullGetter prints the literal word `undefined` for a tag with no
  value. Verified: an old-shaped row renders with an empty note and no "undefined" anywhere.
- The editor now seeds its state with `{ ...emptyVoucher(), ...initial }` for the same reason
  `hydrateInvoice` exists — `undefined` in a controlled input makes React switch it to
  uncontrolled mid-edit.
- `printVoucher` prints the note too, so the browser-print path does not quietly drop it.

**If that template is ever replaced from an older copy, the tag goes with it** and every
voucher gets "undefined" printed on it. Template and `generateVoucherDocx` are now a pair.

### 18e. The two vouchers issued today

Both were generated from the patched template **before** it was wired into the app, so they are
byte-for-byte what the app now produces from the same inputs — but they were not saved into
`q_vouchers`. Re-key them in the app if they need to live in Documents.

Off the "Epic Egypt Experience — 8 Nights" quote (7–15 Nov 2026, 1 guest at the 5,500 USD solo
rate), with **Acamar replaced by the Sonesta Moon Goddess** — that swap is the whole reason
they were rebuilt.

| | Sheraton Cairo | Sonesta Moon Goddess |
|---|---|---|
| guest | Mr. Nicolas Josson, Belgian | same |
| rooming | 1 single, bed & breakfast | 1 single cabin, full board |
| dates | 07 Nov → 15 Nov 2026, **4 nights** | 09 Nov → 13 Nov 2026, 4 nights |
| note | split stay: 2 nights 07–09 and 2 nights 13–15, cruise in between | embark Luxor Mon 09 Nov, disembark Aswan Fri 13 Nov |

The 09 November embarkation is a **Monday**, which is the 4-night Luxor → Aswan sailing in
§14's operator table — the quote and the cruise weekday agree, so the dates are not guesses.

**Two contact lines are not verified.** Web search was unavailable from the session; the
Sonesta phone (+202 2264 1211/12/13) came off sonesta.com, but the Sheraton Cairo address and
telephone were written from memory and need a glance before either voucher is sent. The hotel
directory could not help: `q_hotels` holds two identical junk "Hilton / 1 Cairo" rows and
nothing else.

### 18f. State of the working tree

`etl-quotations` — modified: `src/pages/TextDoc.tsx`, `src/pages/TextBuilder.tsx`,
`src/pages/Voucher.tsx`, **`public/templates/hotel_voucher_tpl.docx` (binary)**; new:
`src/lib/textDocx.ts`, `handoff-18-append.md`. `tsc --noEmit` exits 0.

`egypt-top-light` — modified: `functions/_lib/textDocHtml.js`. `node --check` clean. No new
Cloudflare variables; the route was not touched, because the logo default lives in the
renderer.

The two generated voucher .docx files were **not** written into either repo — only the template
they came from.

### 18g. Next-session shortlist

1. **Open the Word export in real Word once.** LibreOffice is not Word, and the header image,
   the tracked small caps and the `NUMPAGES` field are the three things most likely to differ.
2. **Click through Text → Pages and export a real PDF** — still never done (§17g).
3. **Make one voucher through the app** and check the note lands where 18e's two put it. The
   template change is binary and untested through the real form.
4. Fill in `q_hotels` with the properties actually used — Sheraton Cairo, Marriott Omar
   Khayyam, the Sonesta boats — so vouchers stop being typed by hand.
5. Still open from §17g: reprice row 181 (the sleeper train came out, the figures did not
   move), publish row 185 on the client's confirmation, and the published-slug guard.

## 18h — Why the guarantee-letter PDF had no stamp (found, fixed)

The stamp was never missing from the pipeline. It was being laid out **0 pixels wide** in the app,
and only in the app.

`src/styles.css` line 42 is `img { max-width: 100%; }` — correct for every picture in the UI. The
PDF export renders the .docx into a plain `<div>` appended to `document.body`, so that rule reaches
it too. docx-preview wraps an anchored Word image in a shrink-to-fit box, so "100% of the
container" resolves to **zero**, and the stamp came out 0 × 161px. Word's own size is already on
the element as an inline style, so any app-side clamp on a picture in that host is wrong by
definition.

Measured in a headless render of the real `guarantee_letter_tpl.docx`, with and without the app
stylesheet loaded:

| | stamp `<img>` box | coloured pixels in the capture |
|---|---|---|
| without styles.css | 354 × 161 | 21 026 |
| with styles.css | **0 × 161** | 5 082 |
| with styles.css + the fix | 354 × 161 | 20 854 |

Fix — one line added to the `fixes` stylesheet in `docxBlobToPdf` (`src/lib/docx.ts`):

```css
.docx img, .docx svg { max-width: none !important; max-height: none !important; min-width: 0 !important; }
```

That is correction **8** in that function's list. Same lesson as the other seven: the cause was the
environment around the render, never the capture. Re-verified afterwards with the app stylesheet
loaded — letter, Sheraton voucher, Sonesta voucher and the Vanderberg invoice all still come out on
one page with stamp, letterhead and every column intact.

### The letter's silent fallback now speaks

`letterToPdf` falls back to the `LetterSheet` HTML layout if docx-preview cannot be reached. That
layout has **no stamp**, and it used to fire silently — so a fallback letter looked exactly like a
stamp bug. `letterToPdf` now returns `true` when the Word template was photographed and `false`
when the fallback ran, and both callers (Letter.tsx's own button and the Documents list) show a
notice on `false`.

Still worth knowing: `docx-preview` and `JSZip` are loaded from cdnjs/jsdelivr at click time, not
bundled. A blocked CDN is the one thing that can still send the letter down the fallback path and
break the voucher and invoice PDFs outright. Bundling them is `npm i docx-preview jszip` plus
swapping `getDocxPreview()` for two dynamic imports — not done here because it needs an install on
your machine before the next build.

## 18i — A client's name was printing on another client's live link

`https://egypttoplight.net/packages/egypt-solar-eclipse-nile-alexandria-discovery-extended` is
Shelly Howie's package (row 173, internal label "Shelly Howie"). Its public subtitle read
**"Egypt Top Light Travel · Lee Marie Tormos – Eclipse 2027 | Extended 9-Night Option"**.

The printed value is `data.meta.ref`, **not** the `group_ref` column. `meta.ref` has no field
anywhere in the builder: it was seeded once from the quotation's group reference — a client's name —
and then carried silently through every save and every clone. Row 173 was cloned from row 172
(Lee Marie's own link), so it inherited hers.

Cleared on row 173: `group_ref = ''` and `data.meta.ref = ''`. Verified by full-row text search —
"Tormos" now appears nowhere in row 173, and nowhere in `q_packages`, `q_quotations`,
`q_package_docs_archive`, `q_text_docs`, `q_sites` or `q_settings`.

Code fix in `PackageBuilder.tsx`, so it cannot recur:

- `meta.ref` no longer seeds from `draft.groupRef`. The client reference goes to `internalLabel`,
  which is private.
- The INSERT path — which is also "Save as new version" — writes `group_ref: ''` and
  `meta.ref: ''`. No new or cloned package can ever publish a client's name again.

Existing rows updated in place keep their `meta.ref`, deliberately: nineteen live pages carry one
and most read as a harmless subtitle ("Egypt Solar Eclipse Tour 2027").

### Still printing a real person's name on a live page (report only)

| row | link | prints |
|---|---|---|
| 160 | luxor-eclipse-road-trip-middle-egypt-luxor-cairo | SMITH-ECL-2027 |
| 166 | sakkara-solar-eclipse-abydos-hurghada | Tara Cummins – Luxor Eclipse 2027 |
| 167 | egypt-solar-eclipse-red-sea-dive-connection | Gabriella Gerhardt – Eclipse & Dive Connection |
| 171 | the-eclipse-at-karnak-mary-jasmin-photography-edition | Mary Jasmin (MJ) — Karnak Eclipse 2027 |
| 172 | egypt-solar-eclipse-nile-alexandria-discovery | Lee Marie Tormos – Eclipse 2027 |

Each is on that client's own page, so it may be intended. Row 170 is different: the name is in the
**slug** (`...-double-kim-bradley`), which cannot be changed without 404ing a link she has.

### Cache

Twenty minutes after the write, every fetch I can make still returns the old subtitle — across two
hostnames, with and without a trailing slash, and with fresh query strings. The database is clean,
so this is a cache in front of the origin, not the data. Hard-refresh, or purge that URL in
Cloudflare. `functions/packages/[slug].js` has never been staged to the sandbox, so if the name
survives a purge that file is the next place to look.

## 18j — Text → Pages: photos in the Word file, and the download name

### Photos never carried over because the export never embedded them

`textDocx.ts` wrote exactly one image part, `media/logo.png`. There was no code to embed the
chosen photographs at all, so however many were picked the .docx came out text-only. A .docx cannot
reference a URL — every picture is a part inside the zip — so the photos have to be fetched and
re-encoded before the file is built.

Added:

- `loadDocxPhotos(urls)` — fetches each photo, decodes it through `createImageBitmap(blob)`
  (**not** an `<img>`: a cross-origin `<img>` taints the canvas and `toDataURL` throws, which would
  have silently dropped every photo served from Supabase storage), caps the long edge at 1400px and
  re-encodes to JPEG at q0.86. Webp and gif in the library become JPEG, which Word can display.
  An unreachable photo is skipped, not fatal; the builder reports how many were left out.
- `photoLayout()` — the plates stacked down a LEFT COLUMN with the itinerary beside them, the same
  shape the PDF and the web page draw. Widths are the PDF's own physical dimensions: 132px of a
  794px A4 sheet is 1.375in, and the gutter beside it is 0.19in, so a client holding both files
  sees the same column. Plate sizes come from each photo's own ratio — landscape capped on width,
  portrait capped on height — so nothing is stretched and nothing eats half a sheet.

### Why the left column is a table and not floating pictures

Floats were the first attempt, and they position correctly: `wrapSquare wrapText="right"` narrows
the text measure for exactly as many lines as the picture stack is tall. But **wrapping only
applies to paragraphs.** A table ignores it, so the moment the wrap region reached the
included/excluded block or the rate table, that table was shifted right by the picture and ran off
the right margin — "Steigenberger Pyramids" clipped mid-word at the page edge. Confirmed in the
render; an itinerary can put a table anywhere, so ordering could not avoid it.

A two-column table cannot collide. The body lives in the right cell and every nested table's 100%
width resolves against that cell. The row is deliberately splittable, so a fifteen-day programme
flows across sheets — and the gutter stays reserved on every sheet, exactly as the PDF does it.

One thing that had to be fixed with it: `rule()` measured its indent off the full page width, so
inside the narrower cell Word collapsed every gold hairline to a two-pixel dash. Rules now take the
current measure. Verified across 4 / 2 / 1 / 0 photos and a four-page fifteen-day document.

Verified: built four variants (4 / 2 / 1 / 0 photos), confirmed `word/media/photoN.jpeg` and the
matching `rIdPhotoN` relationships, converted through LibreOffice and read the pages. Aspect ratios
hold, the portrait plate is height-capped, the zero-photo file has no orphan relationship — an
orphan is what makes Word declare a document corrupt.

### Download name

`downloadName()` already preferred the Filename field then the title, so the generic
`itinerary.docx` could only appear when the Title box was empty AND the pasted text had no heading
for `guessTitle` to find. It now falls back further — to the saved row's name, then to
"Egypt Top Light Travel — Itinerary" — and strips trailing dots and spaces, which Windows refuses
to create.

The likelier culprit was `downloadBlob()` in `excel.ts`, used by every Word download in the app: it
clicked a **detached** anchor and revoked the object URL in the same tick. Firefox and Safari ignore
a detached anchor's click outright, and revoking that early races the browser's own read of the
blob — which lands as a generated name, a zero-byte file, or no download. It now appends the anchor,
clicks, and cleans up after 4 seconds.
