# HANDOFF — ETL Quotation System (Egypt Top Light Travel)

> **This is the single authoritative doc for this repo.** Superseded session notes are in `archive/`.
> Last updated **2026-08-11**.
>
> Read section **0 (Gotchas)** and section **4 (Package PDF)** before touching anything. Most of the
> July pain came from a handful of tooling + html2canvas traps documented in section **8**.
> Section **10** covers publishing packages to the public website — new on 10 Aug 2026.

---

## 0. GOTCHAS FOR THE NEXT AGENT (read first, will save you hours)

1. **The Write/Edit tools TRUNCATE `.tsx` files mid-write on this machine.** Symptom: `tsc`
   fails with `Identifier expected`, `JSX element has no corresponding closing tag`, or the file
   just ends mid-line. It happened repeatedly in the July 2026 sessions.
   - **Do NOT edit `.tsx`/`.ts` with the Edit/Write tools.** Use bash + Python string replace:
     `python3 - <<'PY' ... open(p).read()/replace/write ... PY`, with `assert s.count(a)==1` guards.
   - If a file is already truncated, **restore it from git first**: `git show HEAD:src/pages/X.tsx > src/pages/X.tsx`, then re-apply edits via Python.
   - **ALWAYS verify after every edit:** `node node_modules/typescript/lib/tsc.js --noEmit` (exit 0 = good).
2. **`npm run build` fails in this sandbox** (missing rollup linux-x64 native binary). That is
   environmental, NOT your code. `tsc --noEmit` is your verification. The user builds on their machine / Cloudflare.
3. **You cannot render the PDF here** (no Chromium/puppeteer; npm registry blocks playwright).
   You iterate blind on the html2canvas pipeline — reason carefully, then have the USER re-export and send the PDF.
   You CAN render an uploaded PDF to PNG with `pdftoppm -png -r 150 file.pdf out` and view it, and measure
   things with Python+Pillow. Use that to diagnose.
4. **git from the sandbox is unreliable** (`.git/index.lock` "Operation not permitted", can't unlink for checkout).
   `git show HEAD:file > file` works (in-place write). The **USER commits & pushes** from their own machine —
   your job is to leave a clean working tree + passing tsc. DB changes (Supabase) are live immediately; code
   changes need the user's `git push` → Cloudflare auto-deploy.
5. **Supabase writes:** there is NO direct DB connection from the sandbox (only the public anon key in `.env`,
   no service key, no psycopg2). Use the **Supabase MCP `execute_sql`** (project `yxgpjjwjgtgavfusurbi`).
   For JSONB use dollar-quoting to avoid escaping hell: `$pkg${...json...}$pkg$::jsonb`. `created_by` is a
   NOT NULL uuid — use `0a58da13-831c-4322-8f62-e5777cc5f2b7` (the account's profile id) or query `q_profiles`.
6. **Save and Publish are different actions, deliberately.** `slug` / `published` / `published_at` are
   COLUMNS on `q_package_docs`, not fields inside `data`, so they are not part of `PackageState` and
   `savePackage()` never touches them. Saving a draft must not be able to change what the public sees;
   publishing must not overwrite the itinerary with whatever is on screen. Keep them separate. See §10.
7. **Adding a photo now takes TWO steps, and skipping the second fails silently.** The local picker reads
   `public/images/tours/` + `manifest.json`; the PUBLIC package pages read the Supabase `tour-photos`
   bucket. Drop the file in the folder, add it to `manifest.json`, **and** run
   `node scripts\upload-tour-photos.mjs`. Miss the upload and the PDF looks perfect while the public
   page shows a broken image — and nothing errors anywhere.
8. **Never click "Remove policy" on Supabase's "Clients can list all files in this bucket" warning.**
   `loadUploads()` calls `supabase.storage.list()`, which needs the SELECT policy on `storage.objects`.
   Removing it leaves public image URLs working (a public bucket bypasses RLS when SERVING files) while
   the photo picker silently shows nothing — `loadUploads()` swallows the error. The correct hardening,
   applied 10 Aug, is to narrow the policy to `authenticated` rather than drop it.

---

## 1. WHAT THIS IS / STACK / LOCATIONS

Rebuild of a 2024 ASPX tool. Now a **Vite + React 18 + TypeScript SPA + Supabase**, deployed to **Cloudflare Pages**.
Four "modules": (1) Excel quotations, (2) Guarantee letters, (3) Hotel vouchers, (4) **Package PDF builder** (this
session's focus — a branded, magazine-style multi-day itinerary PDF).

- **Code:** `C:\Users\DELL\Downloads\etl-quotations` → GitHub `seif8545/etl-quotations` → Cloudflare Pages
  (build `npm run build`, output `dist`, Pages Functions in `/functions`).
- **Website repo (source of brand + tour photos + tours.json content):**
  `C:\Users\DELL\Downloads\egypt-top-light-travel-v2` (also mounted; that's where the group photos came from).
- **Sandbox bash paths:** `/sessions/<id>/mnt/etl-quotations/`, `/sessions/<id>/mnt/egypt-top-light-travel-v2/`.

**Brand:** fonts Fraunces (display/serif) + Inter (body), loaded via Google Fonts `<link>` in `index.html`.
Colors: navy `#0e2a47`, navy-deep `#081a30`, gold `#c8960a`/`#e8b015`/pale `#f0c53a`, cream `#fffefa`/`#faf5e9`.

---

## 2. SUPABASE / DATA MODEL

- Project **`art-crawford-gallery`**, id **`yxgpjjwjgtgavfusurbi`** (shared with another app → **all tables prefixed `q_`**).
- URL + publishable/anon key are committed in `.env` (safe). RLS: agents see own docs, admins everything; helper `q_is_admin()`.
- Reference tables: `q_sites`, `q_transfers`, `q_regions`, `q_accommodation_destinations`, `q_meal_tiers`,
  `q_service_rates`, `q_pax_tiers`, `q_settings`, `q_profiles`.
- Document tables: `q_quotations`, `q_letters`, `q_vouchers`, `q_packages` (reusable draft templates),
  and **`q_package_docs`** (the exported/openable Package PDFs — this is what the Packages tab lists).
- **`q_package_docs` columns:** `id bigint`, `name text NOT NULL`, `group_ref text`, `pax int`,
  `arrival_date date`, `departure_date date`, `data jsonb NOT NULL` (= a `PackageState`, see §4),
  `created_by uuid NOT NULL DEFAULT auth.uid()`, `created_at timestamptz`, `shared_with uuid[]`,
  and — added by migration `q_package_docs_public_slug_and_publish` — **`slug text`** (unique index
  `q_package_docs_slug_key`), **`published boolean NOT NULL DEFAULT false`**, **`published_at timestamptz`**.
  Those last three drive the public pages (§10) and are NOT inside `data`.
- **Document sharing (14 Jul session):** all four doc tables (`q_quotations`, `q_package_docs`, `q_letters`,
  `q_vouchers`) now have `shared_with uuid[] NOT NULL DEFAULT '{}'`. The old single ALL policy per table is split
  into select/insert/update/delete; SELECT adds `auth.uid() = any(shared_with)` so recipients can view but never
  modify/delete. Trigger `q_guard_shared_with()` on all 4 tables blocks non-admins from setting/changing
  `shared_with` (allows when `auth.uid()` is null, i.e. MCP/service SQL). UI: `Documents.tsx` now takes
  `isAdmin` + `uid` props from `App.tsx`; admins get a per-row "Share…" button → checkbox modal listing non-admin
  `q_profiles` (updates `shared_with` immediately); non-admins see a "Shared with you" tag on rows they don't own
  and no Delete. Styles: `.share-*` block at the end of `styles.css` (reuses `.picker-overlay`/`.picker`).

Pricing rules (base Excel module): 120 sites / 104 transfers; +10% from 1 Nov 2025 (`new_price*` + `effective_date`);
vehicle by pax ≤7 limo / ≤15 coaster / 16+ bus (`q_pax_tiers`); SGL supp = 70% of DBL (`q_settings`);
Guide 2000 / Rep 400 LE/day (`q_service_rates`).

---

## 3. THE THREE ORIGINAL MODULES (brief)

- **Excel quotation** — `src/lib/excel.ts` fills the "Quotation new" sheet; `src/lib/pricing.ts` mirrors the
  template formulas; dates written as UTC; totals use `{formula,result}` cell objects. `QuotationWizard.tsx`.
- **Guarantee letter** — `src/pages/Letter.tsx`. Word via docxtemplater (`public/templates/*_tpl.docx`), then
  **PDF via ConvertAPI** through a Cloudflare Pages Function proxy `functions/api/convert.js` (env
  `CONVERTAPI_SECRET`, so the secret is hidden server-side). `src/lib/docx.ts` also has `docxBlobToPdf`.
- **Hotel voucher** — `src/pages/Voucher.tsx`. Same docx→pdf approach.
- **`Documents.tsx`** — tabs `['Quotations','Packages','Letters','Vouchers']`. Quotations tab: Excel / Package PDF /
  Open-Duplicate / Save-as-package. Packages tab reads `q_package_docs`, "Open / Export" opens `<PackageBuilder saved={...}/>`.
- **`Admin.tsx`** — 8 CRUD tabs over the reference tables + `DayPresetsAdmin`.

> ⚠️ Earlier in the project I accidentally reverted the user's ConvertAPI code in `Letter.tsx`/`excel.ts` by
> rebuilding a truncated file from memory. **Lesson: restore from git, don't rebuild from memory.**

---

## 4. THE PACKAGE PDF SYSTEM  ← the core of this app

Two files do everything:

### 4a. `src/pages/ItineraryDoc.tsx` — the print template (the thing html2canvas captures)
- `forwardRef` div `.itin` (width **794px** = A4 at 96dpi; each page block is **height 1123px** = A4 height).
- **CSS is injected into `document.head`** (id `itin-doc-css`) via `useEffect`, NOT rendered as an inline
  `<style>` inside `.itin`. (An inline `<style>` gave html2canvas a phantom ~130px box at the top that pushed
  every page down — see §8.) The effect always re-sets `el.textContent = CSS` so HMR picks up changes.
- **`ItineraryData` / `PackageState` shape** (the `data` JSONB):
  ```
  title, intro, hero (path under /images/tours/),
  meta:{ ref, pax, arrival, departure },
  overview:{ days, nights, cities },
  hotels:[{ nights, destination }],
  days:[ EditableDay{ uid,title,description,photo,sites[],guide,meals{breakfast,lunch,dinner},hotel } ],
  arrival:FixedDay, departure:FixedDay  (FixedDay = {on,title,description,photo,meals,hotel}),
  pp, sgl, showPrice,
  included (string, \n-separated → bullets), excluded (string),
  priceTableOn, priceRows:[{ category, dbl, single, hotels }],
  flights:[...]
  ```
- **Page structure (each a fixed `height:1123px; overflow:hidden` block, sliced 1:1 by the exporter):**
  1. `.itin-cover` — full-bleed hero image + logo + eyebrow + title + gold divider + meta (dates/guests).
  2. `.opening` — "At a Glance": stats (Days/Nights/Cities/Guests, singular-aware) + intro paragraph.
  3. **One `.day-full` page per day** (see below).
  4. `.summary-page` — Accommodation cards + Package Price box.
  4b. `.summary-page` — What's Included/Excluded on its OWN page (since 14 Jul: long inclusion lists were
      overflowing the single summary page and clipping the price box — fixed heights clip, they don't flow).
  5. `.summary-page` — Package Pricing tier table (only if `priceTableOn && priceRows.length`).
  6. `.itin-closing` — navy "Why Egypt Top Light" + "Thank You" + contact.
- **Days = ONE PER PAGE** (the user explicitly chose this — see §8 history). `dayPage(day,i)` renders a full-page
  photo-top layout: fixed-height photo band (`.df-photo` 632px) with the image as a **`background-image` on
  `.df-img` (position:absolute; inset:-3px; background-size:cover)** + gradient + big ghost day number + title
  overlaid; then `.df-body` with the description bullets + `.d-foot` (tags · meals · stay).
  Arrival = day 1 (FixedDay), Departure = last day; the middle `days[]` are in between.
  `bulletsOf(desc)` splits description on `\n`.

### 4b. `src/pages/PackageBuilder.tsx` — the editor UI + the export
- Opened from `Documents.tsx` as `<PackageBuilder saved={packageState} onClose=.../>` (or `draft={...}` from a quotation).
- State: `title,intro,hero,days,arrival,departure,pp,sgl,showPrice,priceTableOn,priceRows,included,excluded,
  flights,manifest,picker,busy` and now **`meta` and `hotels` are `useState`** (were read-only consts).
- `data:ItineraryData = useMemo(...)` builds the render model from all state (deps include meta/hotels/totalNights).
  `heroUrl = '/images/tours/' + hero`; `pricing:{ show:priceTableOn, refPp:pp, refSgl:sgl, rows:priceRows }`.
  For **saved** packages, overview.nights is recomputed live from the accommodation rows AND overview.days from
  the rendered day pages (`days.length + arrival.on + departure.on`) — the stored overview.days was stale (a
  saved doc showed "15 days" for a 13-day trip, 14 Jul). Re-saving heals the stored value.
- `buildState():PackageState` → `savePackage()` inserts into `q_package_docs`.
- **Trip details editor** (added July 2026) — top of `.builder-body`, `.b-trip`: Arrival/Departure date pickers,
  Guests, and Accommodation-nights rows (nights + destination + remove, "+ Add accommodation"). Styles in `styles.css`.
- **Photo picker:** each day + the cover have a "Change photo"/"Change cover photo" link → `setPicker({target})` →
  overlay that maps `manifest` (`public/images/tours/manifest.json`, fetched at runtime) grouped by area; clicking a
  thumb calls `pickPhoto`. Each editable day's Highlights line is an editable comma-separated input bound to `day.sites`
  (cleared = no tag line in the PDF; 'Private guide' is still auto-appended from `day.guide` at data build).
  `FixedDayEditor` is a **module-scope** component (see §8 — it must NOT be defined inside
  the render or every keystroke remounts the inputs and loses focus). Area labels are prettified in the picker
  (`area.replace(/-/g,' ')` + title-case) so `group-shots` shows as "Group Shots".

### 4c. THE EXPORT PIPELINE (in `exportPdf()`), read carefully
```
opt = { margin:0, image:{type:'jpeg',quality:0.95},
        html2canvas:{ scale:2, useCORS:true, backgroundColor:'#fffefa', logging:false },
        jsPDF:{ unit:'px', format:[794,1123], orientation:'portrait', hotfixes:['px_scaling'] },
        pagebreak:{ mode:['css'] } }
try {
  await html2pdf().set(opt).from(node)
    .toCanvas().then(function(this){ /* crop out ~cut px each L/R edge, redraw full width */ this.prop.canvas = out })
    .toImg().toPdf().save()
} catch { await html2pdf().set(opt).from(node).save() }   // fallback = uncropped
```
- html2pdf is loaded from CDN at runtime via `getHtml2Pdf()` in `src/lib/pdf.ts` (NOT bundled).
- `waitForAssets(node)` (in `pdf.ts`) awaits fonts + all `<img>` **and** preloads CSS `background-image` photos
  (the day photos are background-images, so they must be preloaded or html2canvas may capture them blank).
- **The canvas crop** (cut = 18 device px = ~9 CSS px each side) removes html2canvas's left/right capture seam.
  It rescales horizontally only (vertical untouched) so the 1123px page slicing stays identical. See §8.

---

## 5. HOW THE FIRST PACKAGES WERE SEEDED (`q_package_docs`, July 2026)

From the "Egypt Discovery Programs" PDF (4, with 3/4/4-Deluxe/5★ tier tables + includes/excludes):
- **52** 04 Nights Sharm El Sheikh Escape (5d/4n, $385 4★)
- **53** Cairo Stopover — 04 Nights (5d/4n, $695)
- **54** Cairo & Nile Cruise Escape — 07 Nights (8d/7n, $1420)
- **55** 6 Nights Cairo & Sharm El Sheikh Escape (7d/6n, $820)

From `tours.json` (the website's 25 tours; user asked for these 2 specifically):
- **57** Egypt Solo Explorer (7d/6n, pp 845, pax 1; tiers derived from Cairo Stopover + Alexandria; single supp waived)
- **58** African American Group Tour: Egypt & Nubia Heritage Journey (8d/7n, pp 1390, pax 10; tiers derived from
  Cairo & Nile Cruise; hero set to the real website group photo `group-shots/summer-2026-usa-group-1.jpeg`)

Insert pattern used (repeat for the other 23 tours in tours.json whenever asked):
`insert into q_package_docs (name,group_ref,pax,arrival_date,departure_date,data,created_by) values ('name','',N,null,null, $pkg${...PackageState...}$pkg$::jsonb, '0a58da13-...');`
Map: itinerary day 1 → `arrival`, last day → `departure`, middle → `days[]`; `included`/`excluded` joined by `\n`;
description points joined by `\n`; meals inferred from text or sensible defaults; photos resolved from the
tour's cover/gallery `.webp` names to the actual `.jpeg`/`.jpg` files in `public/images/tours/**`.

---

## 6. `tours.json` (uploaded)

A 25-item array (`uploads/tours.json`) scraped from egypttoplight.net/tours. Each item:
`id, slug, title, duration, nights, price, destinations[], governorates[], category, coverImage, gallery[],
excerpt, overview, highlights[], groupSize, pace, itinerary:[{day,title,description}], included[], excluded[], rating, reviews`.
Image paths are `/assets/images/tours/<area>/<name>.webp`; the same basenames exist as `.jpeg`/`.jpg` in the app's
`public/images/tours/<area>/`. All 25 tours are now inserted: 5 & 25 previously, and the remaining 23 on 14 Jul as ids **98-120**
(generated from tours.json at `egypt-top-light-travel-v2/egypt-top-light/data/tours.json`, mounted alongside this one).
Notes on the 23: pp = tours.json price, `priceTableOn:false` + empty priceRows (no tier source — user adds hotel
categories in the builder); hotels hand-derived per itinerary (verified: hotel nights == overview.nights == days-1
for every row); day photos keyword-matched against the real photo inventory (Jordan/Jerusalem days fall back to
generic shots — no such photos exist in the library yet); dahabiya tours use the new `dahabiya-philae` photos.

---

## 7. PHOTOS / MANIFEST / PICKER

- Library: `public/images/tours/<area>/*.{jpeg,jpg,png}`. Areas: `cairo-giza, luxor-aswan, alexandria,
  memphis-sakkara-dahshur, red-sea, arrivedepart`, and NEW **`group-shots`** (20 real group photos copied from
  the website repo `.../public/assets/images/our-groups/summer-2025-usa` + `summer-2026-usa`, `.jpeg` originals).
- `public/images/tours/manifest.json` = `{ "<area>": ["file.jpeg", ...] }`. The picker fetches it at runtime and
  the manifest key doubles as the folder path (`/images/tours/<key>/<file>`) — so key must equal folder name.
- To add images: drop files in `public/images/tours/<area>/`, add them to `manifest.json`, commit+push.
- `dahabiya-philae` area added 14 Jul (7 jpgs; the user had dropped the folder at public/images/ — picker
  folders must live under public/images/tours/ + have a manifest key).
- **Runtime uploads (14 Jul):** the picker has a drag-&-drop / browse bar → Supabase Storage public bucket
  `tour-photos` (policies `q tour photos read` / `q tour photos upload`), one folder per collection; they render
  as "<Collection> — Uploaded" sections and are picked as FULL public URLs. `photoSrc()` in PackageBuilder maps
  photo values (http/data pass through, else `/images/tours/` prefix), so PackageState may contain absolute
  URLs now — old relative paths still work everywhere.

### The bucket is now the source of truth for PUBLIC pages (10 Aug 2026)

The PDF resolves relative paths against this repo's `public/images/tours/`. The public package pages
(§10) live in the *website* repo, which has no copy of that library — so the whole library was mirrored
into the bucket. **307 objects: 287 from `public/images/tours/` + the 20 pre-existing `my-uploads/`.**
Verified by MD5 over the sorted filename list on both sides — byte-exact parity.

- **Structure is load-bearing.** The 9 area folders sit at the BUCKET ROOT, because `data` stores paths
  like `cairo-giza/sphinx-pyramids.jpeg` relative to it. One extra level of nesting (a `tours/` prefix)
  breaks every relative photo at once.
- **`scripts/upload-tour-photos.mjs`** does the mirroring in one command. It needs `SUPABASE_URL` and
  the **service_role** key in the environment — uploading is not a public operation even on a public
  bucket. Pass it via `set` in cmd; never put it in a file, and remember **this repo is public on
  GitHub**. Run `--dry-run` first. It upserts, so it is always safe to re-run.
- Node's `fetch` throws a bare `fetch failed` on transient connection drops; on a ~58 MB batch a handful
  of random files will hit one. That is the network, not a bad file. The script retries 3× with backoff.
- **Storage policies (10 Aug):** `q tour photos read` (SELECT) and `q tour photos upload` (INSERT) are
  both scoped to `{authenticated}`. Anonymous users can still FETCH any image — public buckets bypass
  RLS when serving files — they just cannot enumerate the bucket. See §0.8 before changing this.

---

## 8. OBSTACLES AND THEIR FIXES (July 2026 — all still current)

**A. File truncation (the biggest time sink of that session).** See §0.1. Edit `.tsx` via Python, verify with tsc, restore from git if cut.

**B. Blank/extra pages in the PDF.**
- Original inline `<style>` inside `.itin` → phantom ~130px top box → cover split across pages. Fix: CSS in `<head>`.
- `min-height:1123px` + `page-break-after:always` **double-breaks** → a blank page after every section (got 19 pages).
  Fix: **fixed `height:1123px; overflow:hidden` and NO page-break CSS**; html2pdf slices the tall canvas 1:1.
- Switching jsPDF to `unit:'mm', format:'a4'` produced a **trailing blank page** (content overshoots). Revert to
  `unit:'px', format:[794,1123], hotfixes:['px_scaling']` (px 794×1123 IS exactly A4 proportions → perfect slicing).

**C. Photos not filling / misaligned.**
- An `<img>` with `height:100%` inside an **auto-height flex item** does NOT resolve in html2canvas → the photo
  renders at intrinsic size and floats (the old side-by-side "spread" cards misaligned badly). Fixes: use a
  **`background-image` on a stretched div**, OR give the photo box a **fixed height** (the hero pages always
  worked because their photo box is fixed height). This is why days are now one-per-page with fixed-height photo bands.
- `calc()` + over-constrained `inset:-3px` + `width/height:calc(100%+6px)` on an `<img>` **collapsed the cover**
  for a **portrait** hero image. Fix: plain `.cover-hero { position:absolute; inset:0; width:100%; height:100%; object-fit:cover }`.

**D. The persistent left "sliver" (white strip down the left edge of every page).**
- It's an html2canvas **capture seam** (~4 CSS px), NOT a jsPDF placement offset (mm/a4 didn't fix it; overscan on
  individual images didn't fix it because the seam is at the page/canvas edge). Trying `windowWidth`/`scrollX` on
  html2canvas **broke the capture positioning** (clipped everything) — don't.
- Fix that works: **crop the canvas in the export pipeline.** MUST use the **linear** html2pdf chain
  `.toCanvas().then(function(){ this.prop.canvas = croppedCanvas }).toImg().toPdf().save()`. The split approach
  (`const c = await worker.toCanvas().get('canvas')` then separately `worker.toImg()...`) silently falls back to
  uncropped — that cost a round trip. Crop rescales L/R only, vertical untouched, so pagination is unchanged.
  `cut` is currently 18 device px. Measure the remaining seam with `pdftoppm -r150` + Pillow if it needs tuning.

**E. Input loses focus on every keystroke.** `FixedDayEditor` (arrival/departure editor) was defined **inside** the
  `PackageBuilder` component → new component identity each render → React remounts the input. Fix: **hoist it to
  module scope** and pass callbacks (e.g. `onPickPhoto`) as props. (`MealTicker` was already module-scope; the
  inline editable-day inputs were fine because they're plain JSX, not a nested component.)

**F. Spacing/pagination polish (history, in case it regresses):** cover/opening/summary/closing all fixed 1123px;
  packing logic for multi-day-per-page was abandoned in favor of one-per-page; alternating photo-top/bottom was
  tried and rejected (photo-bottom page followed by photo-top page made two images "collapse" together across the
  break) → **all days photo-top**. "1 Cities" → singular-aware labels on the At-a-Glance stats.

**G. Bulk DB inserts.** No psycopg2 / no service key → can't script Postgres from the sandbox. Everything goes
  through the Supabase MCP `execute_sql`, one statement at a time, JSON dollar-quoted. That's why only 2 of the 25
  tours were inserted (the 2 requested); the rest are one-by-one on request.

**H. Verification without a browser.** You can't run html2canvas. Render the user's uploaded PDFs to PNG
  (`pdftoppm`), view them, measure with Pillow. Reason about html2canvas from first principles (it clones the DOM,
  lets the real browser lay it out, then copies each element's bounding rect + draws images — so anything the
  browser resolves to "auto"/intrinsic is where bugs live). Then have the user re-export to confirm.

**I. Whole export shifted DOWN by a constant offset — blank first page(s), last page(s) cut off (14 Jul).**
  Reported as "adding a pricing table breaks the rendering" — actually scroll-dependent: html2canvas crops
  the capture at the element's on-screen bounding rect, and the offscreen `<ItineraryDoc>` wrapper is an
  absolute child of the scrollable `.builder-overlay`. Scroll the builder (e.g. down at the pricing-table
  editor) and the rect sits scrollTop px above the viewport while html2canvas's clone lays out unscrolled ⇒
  the whole capture shifts down by exactly the scroll amount (measured 1348px on the user's 18-page export:
  page 1 blank + closing page gone). Fix in `exportPdf()`: zero `window` scroll and every scrolled ancestor's
  scrollTop/Left before capture, restore in `finally`. Still never pass scrollX/scrollY/windowWidth to
  html2canvas itself (see D).

---

## 9. CURRENT STATE / PENDING  (as of 2026-08-10)

- `tsc --noEmit` passes clean. Base modules (Excel/Letter/Voucher/Admin) unchanged and working.
- Package PDF: cover fixed (portrait heroes work), one-per-page days, canvas-crop for the seam, singular
  labels, Trip-details editor live above the Export button.
- **`q_package_docs`: 69 rows, 69 slugs, all distinct. 2 published.**
- **`exportPdf()` no longer creates rows.** It used to end with an unconditional `savePackage(false)`,
  which INSERTs whenever `currentId` is unset — so every export from an unsaved builder minted another
  row. That is where the historical duplicates came from. It now only updates a package that already
  exists: exporting a PDF is not a request to create a package.
- **Dahabiya day presets (14 Jul session):** `q_day_presets` ids 33–40, sorts 30–37, named "Dahabiya 1 — …"
  to "Dahabiya 8 — …" so they render as one consecutive chip row in the Quotation wizard (Luxor–Luxor,
  7 nights). Costed sites: D2 Valley of Kings+Hatshepsut, D3 Edfu, D4 Philae+High Dam, D6 Kom Ombo,
  D7 Karnak+Luxor Temple. Abu Simbel (D5) is *optional* in the text and NOT costed (add site 80 via
  Admin → Day presets if wanted). Guide on D2/3/4/6/7 only; no transfers (the boat is the transport).
  NB: site 71 = "Habo" (Medinet Habu), NOT Memnon — the Colossi have no q_sites entry (free to visit).

### Known-broken / open

- **Package 1** (`Ultimate Egypt Experience February 2027`) is the one genuinely inconsistent row of the
  69: `overview.days` 15 vs 14 real day pages, 13 hotel nights against a 14-night date span, and 5 days
  with an empty description and no photo. Package 151 supersedes it. Decide whether it is worth keeping.
- **`segments-cityBullets-patch.md`** — fixes the compact card's "Also visiting" line, which re-lists
  places the prose already described. Root cause: the coverage test asks whether the whole flattened site
  name appears as a contiguous substring, so "Al-Moez Street" misses "Al-Moez **Ldin Allah** Street".
  Verified against real rows from 153/155/156 — 4 of 5 day-blocks improve, control unchanged. **Never
  applied, `tsc` never run on it.**
- **`summariseLines`** — decides which prose lines survive onto the compact card at all. The other half of
  "doesn't summarise the days well". Not started.
- Slug 153 still reads badly at the 60-char cut (`…the-2027-total-so`). The slug field in the publish strip
  is the fix — edit it before publishing that one.

### Things that are NOT bugs (verified — do not "fix" these)

- **`photo: ''` is deliberate.** Packages 147/148/149 are intentionally photo-free on every day page (hero
  kept), and 154's Siwa and El Alamein pages are blank because the library has no Western Desert imagery.
  There is no `updated_at` on `q_package_docs`, so you cannot tell an intentional edit from a corruption —
  **ask before restoring**. A previous session assumed blank meant lost, wrote the old values back over an
  intentional edit, and had to revert.
- **`sitePhotos.ts` ALIASES are cruise-centric and will invent cities.** Every Luxor keyword — `karnak`,
  `luxor`, `valleyofthekings`, `hatshepsut`, `colossi`, `westbank` — and both `eclipse` and `solareclipse`
  map to the city label **`Nile Cruise`**. Any land-based Luxor or eclipse day tagged naturally in `sites[]`
  adds a phantom city to the At-a-Glance stat and a bogus block on the compact sheet. Worked around in
  154/155/156 by wording the tags to dodge the aliases. The real fix (adding `luxor → Luxor`, `siwa → Siwa`)
  reclassifies every existing cruise package's compact sheet, so it needs a deliberate decision.
  Related: `hotels[].destination` doubles as a city label and must match the `siteInfo()` label exactly, or
  the same place counts twice (`Cairo` vs `Cairo & Giza`).
- **`packageCategories.ts` keyword rules fire on prose, not just titles.** Writing "Gulf of **Aqaba**" in a
  day description filed two Red Sea packages under **Multi-country (Jordan)**, because `aqaba` is in the
  `multi` rule. Recent packages carry an explicit `category` so wording can never refile them.
- **`days[]` excludes arrival and departure.** The rendered sequence is
  `[arrival if on, ...days, departure if on]`. Any count from `days.length` alone is two short. Endlessly
  re-learned; it is now also asserted in the website repo's renderer tests.

---

## 10. PUBLISHING A PACKAGE TO THE PUBLIC WEBSITE  (new, 2026-08-10)

A package can be shared as a URL instead of a 4 MB PDF attachment:

```
https://egypttoplight.net/packages/<slug>
```

**The page is rendered by the OTHER repo.** This app only sets three columns on the row. The renderer is
`functions/_lib/packageHtml.js` + `functions/packages/[slug].js` in `seif8545/egypt-top-light`. If a page
looks wrong, the bug is almost certainly there, not here.

### The publish strip (in `PackageBuilder.tsx`, under the toolbar)

- Editable slug + **Generate** (re-derives from the title), **Save slug**, **Publish** / **Unpublish**,
  a copy-link button, and a live/draft indicator.
- `slugify()` is exported and **matches the SQL backfill exactly** — lowercase, runs of non-alphanumerics
  collapsed to a single `-`, trimmed, capped at 60 chars. The cap cuts mid-word on purpose; making it
  word-aware now would silently re-slug rows whose links may already have been shared.
- New rows get a slug on insert, with a `-2`, `-3` suffix on collision rather than failing the save.
- `published_at` is stamped on the FIRST publish only, so it records when the link went live.
- A unique-violation (`23505`) is reported as "that slug is already used", not a raw Postgres error.
- Publishing needs an id, so **Save before Publish** on a brand-new package.

### What the reader gets

Noindex, nofollow, not in the sitemap, not linked from anywhere on the site — but **public to anyone with
the URL. There is no password.** Be deliberate about who receives a link.

Edits propagate on their own: the page caches for 5 minutes, so save a change here and the same link shows
it shortly after. You never re-send a link or redeploy the site.

Price display follows the existing flags and never invents a number: tier table if `priceTableOn` with a
non-zero row, else the price box if `showPrice` and `pp > 0`, else **"Price on request"**. A package with
no price set shows the last of those — correct behaviour, but check it is what you intended before sending.

### Verified end to end on 2026-08-10

Renderer exercised against all 69 rows (618 day cards, 56 deliberate blank photos, 27 tier tables /
30 price boxes / 11 price-on-request, XSS probes escaped). Live: published renders correctly, unpublished
returns 404. That 404 matters — `[slug].js` runs on a service_role key that bypasses RLS, so the
`published=eq.true` filter is the only thing between the public and every draft quotation in this table.

---

---

## 11. DAY-PAGE AUTO-FIT  (new, 2026-08-11)

**The bug:** a day whose description was longer than the body box was silently **clipped
mid-sentence**. `.day-full` is a fixed `height:1123px; overflow:hidden` (it has to be — the
exporter slices the canvas 1:1), `.df-photo` is a fixed 632px, so `.df-body` only ever had
**399px of content box** — roughly 11 lines of 15px bullets once `.d-foot` is accounted for.
Nine of the eleven day pages of package 159 overflowed it. Nothing errored; the text just ended.

**The fix** — `fitDayPage()` / `autoFitDays()` in `ItineraryDoc.tsx`, run from a `useEffect`
keyed on `data` and again on `document.fonts.ready` (the webfonts change the wrapped line
count, so a pass against the fallback font would leave the wrong scale applied):

- Each day body is wrapped in a single measurable child, **`.df-fit`** (`flex: 0 0 auto`), so
  `box.offsetHeight` vs `body.clientHeight − padding` is an exact fit test. `.df-body` itself
  stays `flex:1`, so shrinking the photo hands its pixels straight to the body.
- Search order is **photo band first, type second** — `FIT_PHOTO_H = [632, 580, 530, 480, 440, 400]`
  then `FIT_SCALES = [1 … 0.76]`. Losing photo height is visually cheap; 11px body copy is not.
  The first combination that fits wins, so pages that already fitted are left untouched.
- Shrinking the band also scales `.df-num`, `.df-cap` bottom and `.df-title`, and steps the
  title down until the caption clears the top ~26% of the band — otherwise a short band would
  trade the body overflow for a clipped heading.
- **All values are written as inline px**, deliberately: no `var()`/`calc()` to resolve, so the
  html2canvas clone sees plain computed pixels. (See §8C for why calc + html2canvas is a trap.)
- The forwarded ref is now merged with a local `rootRef` (`setRoot`) so the fit pass finds the
  day pages inside this document instead of querying the whole `document`.
- Verified with `node node_modules/typescript/lib/tsc.js --noEmit` (exit 0). **Not yet rendered
  in a browser** — have the user re-export a long package and confirm.

**Content-side rule of thumb** (from modelling the same geometry in Python): a day page holds
about **1,300 characters over 8 bullets** at the full 632px band and 15px type, and about
**1,450 at a 400px band**. Past that the auto-fit starts shrinking type. Keep day descriptions
under ~1,350 characters and short tag lines (a `sites[]` line that wraps to 2 lines costs 17px)
and every page renders at full size.

**Still to do:** the PUBLIC package renderer (`functions/_lib/packageHtml.js` in
`seif8545/egypt-top-light`) was not touched — if it reuses the fixed-height day page it has the
same clipping bug and needs the same treatment.

---

*Update this file at the end of each session. Keep §0, §8 and §9's "not bugs" list current — they are the
expensive lessons.*
