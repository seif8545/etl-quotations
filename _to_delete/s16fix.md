
### §16 REVISED, same day — the text FLOWS

The first cut of this feature put **one day per page** and produced fifteen sheets each
carrying four lines of text. That was wrong and is gone. Days now run one after another down
the page; a fifteen-day programme lands on **three sheets**. `textItinerary.ts` opens with the
same warning — do not reintroduce per-day pages.

**The document is a flat item stream, not a list of days.** `parseDoc()` reads the text once,
left to right, with a mode flag, then `streamOf()` flattens it to typed items —
`day | p | chips | h | two | table` — and the packer fills pages with them in order. A day
heading is never orphaned at the foot of a page; everything else breaks wherever it lands.

### The tail of the document is parsed, not just the days

The real inputs end with three sections, and all three are recognised:

- **`INCLUDED SERVICES` / `Inclusions` / `Included` / `Included items`** and
  **`NOT INCLUDED` / `Exclusions` / `Excluded` / `Excluded items`** → the two-column list block.
- **`OFFERED 4 Star package :`** blocks → the rate **table** at the end, one row per tier, with
  the columns *Package · Per person, double · Offered hotels*, exactly like a package quotation.
  `tidyRate()` reduces "Rate per person in Double Occupancy $ 5720 USD" to **5,720 USD** — the
  column header already says per person double, and repeating it in the cell pushed the hotel
  column off the page. Pasted booking URLs are stripped from hotel lines; a printed page cannot
  be clicked.
- Section headings are only recognised **after the first day heading**, so the word "Included"
  inside a day's prose cannot swallow the rest of the itinerary.

`DAY 04 | GIZA PYRAMIDS • GEM • KHAN EL KHALILI` and `DAY 15 | AMMAN • DEPARTURE II Your
Journey Comes to an End` both parse: `|` becomes `•`, their `II` becomes an em dash.

### The type scale is MEASURED, not estimated

`packMeasured()` is the one to use. The builder renders the whole item stream into an
off-screen rig (`.tdoc-measure`, 496px wide), sets the rig's font-size to each candidate scale
in turn, reads every item's real height from `offsetTop` deltas, and packs — then keeps the
**largest** scale whose packing fits the page target. Fifteen days landed on 3 pages at 7.4px.

Why measured and not estimated: the sandbox has no Inter, Inter is narrower than the fallback,
and a ten percent error in characters-per-line is the whole difference between three pages and
four. The pure estimator (`buildPages`) survives only as the value shown before the first
measurement lands and as the answer for a caller with no DOM. **`offsetTop` deltas, not
`offsetHeight`** — the deltas include the margins and their collapsing, which is what the real
flow does.

The page target is a field in the toolbar (default 3). If even 7px will not fit, the document
runs longer and the toolbar says so — too many pages is a judgement call, text cut off the
bottom of a fixed-height page is a bug.

### `photoWidthPct` is stored, and has to be

The left column holds the same 0–4 photos on every page, ratio preserved, never cropped; when
the stack is taller than the column they all shrink in width together. The browser measures
that percentage — **and it is saved into the row**, because the public renderer runs on the edge
where nothing can measure an image, and CSS alone cannot cap a stack's height without either
cropping or distorting it. Without the stored number the web pages grew 48px past A4. Older
rows without the field simply render at full width, as they always did.

### Layout numbers

Columns are `34 + 132 photos + 18 + 496 text + 18 + 62 marks + 34 = 794`. The text column went
from 430 to 496 for density. Every `.ti-*` rule sizes in **em** off one inline px font-size on
`.tp-flow`, so a single number sets a page's density; `em` resolves to px in the html2canvas
clone, unlike `calc()`. `AVAIL = 995`, `AVAIL_FIRST = 937` (page 1 carries the document title).

`guessTitle()` only looks at lines **before** the first day heading. Reading "the first non-day
line" anywhere made a programme that opens straight with `DAY 01` title itself with its own
first bullet — "Arrival at Cairo International Airport, meet and assist…" as an H1.

### Verified again, in headless Chromium

The real 15-day Egypt + Jordan text with the 4★/5★ rate blocks: **3 pages at 7.4px**, every
page exactly 1123px, flow height inside the column on all three, four 1:2 portrait photos
scaled to 86% and clearing the footer on every page, the two-column list and the rate table
both landing on page 3. A 2-page target on the same text correctly refuses and returns 3 at the
7px floor. A 2-day text goes to **one** page at 15px. The public HTML renders at exactly
1123px per page with the stored `photoWidthPct` applied, and 400px-wide mobile has no
horizontal scroll. `tsc --noEmit` exits 0; `node --check` clean.

Still not clicked in the real app, and the PDF has still not been exported for real.
