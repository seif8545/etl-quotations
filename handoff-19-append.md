# Handoff 19 — append: Text → Package

Picks up from `handoff19.md`. One feature, shipped whole. `npx tsc --noEmit` clean, `vite build`
clean.

## What it does

The same idea as **Text → Pages**, aimed at the package builder instead of at A4 sheets. Paste a
supplier's programme — `DAY 01 … DAY 05`, the `Meals :` lines, the rate line, Includes and
Excludes — press **Read the text**, look at what it made of it, press **Apply**. Then Save, then
Publish, exactly as before.

Two ways in:

- **Home → Text → Package** — starts a package from nothing but the text.
- **Build from pasted text**, a panel at the top of the builder itself — re-seeds a package that
  is already open (the header button reads *Replace from text* once there are days on screen).

## Files

| file | what |
|---|---|
| `src/lib/landmarks.ts` | **new.** ~100 Egyptian sites: how suppliers spell each one, its chip label, a noun phrase for the cover, and for the well-known ones one factual sentence. |
| `src/lib/packageImport.ts` | **new.** The mapper. Text in, the builder's whole state out, plus a list of every assumption it made. Pure — no React, no DOM, no database. |
| `src/pages/PackageBuilder.tsx` | the panel, `readImport()`, `applyImport()`, new `importFirst` prop. |
| `src/App.tsx`, `src/pages/Home.tsx` | the `packagetext` page and its tile. |
| `src/lib/sitePhotos.ts` | one alias added: bare `cairo` → `cairo-giza/cairo-nile.jpg`, last in the Cairo group so every specific entry still beats it. |

## Decisions worth knowing

**The day parser is not duplicated.** `parseDoc` in `textItinerary.ts` already knows every way
these documents are typed. `packageImport.ts` consumes its output. A new heading shape gets fixed
there and both features get it.

**Three things had to be done before `parseDoc` sees the text:**

1. `normalizeBlock` puts the line breaks back. A programme pasted out of an email or a chat
   arrives as one unbroken paragraph, and `parseDoc` is a line parser — against a blob it finds
   one day and one enormous bullet. Newlines are inserted before the bullet characters, `DAY n`,
   a `Meals` label and the rate-sheet headings. Text that already had proper lines is unharmed.
2. `readRateBlock` lifts the rate lines out. The rate sits between the last day and the
   `Rate Includes` heading, so the day parser is still in day mode when it reaches it and files
   the **price as the departure day's last bullet** — it would print inside the departure prose
   on the client's page. Same for the hotel names listed under a tier heading.
3. `rawMealLines` keeps the Meals line as typed. `parseDoc` returns the parsed labels only, and
   whether a meal is included or sold lives in the words it drops.

**Two rate-sheet styles, and why both are handled.** One puts everything on one line
(`Rate for Solo Traveller 1500$ USD 4 Star --- STAY INN PYRAMIDS or Equal`) — `offerHeading` in
`textItinerary.ts` reads that as a heading and throws the figure away. The other heads a block
with the tier and puts the figure and the hotels beneath it. Reading only the first style made
two tiers at 4,200 and 6,100 come out as **one row at 6,100**, which is the worst thing this file
could produce, so `readRateBlock` tracks the tier heading as it goes.

**What it will not do is rewrite prose.** The client-facing sentences are the supplier's, cleaned
and re-cased (`smartCase` only fires on a heading that arrived in capitals; a mixed-case heading
was cased deliberately and is left alone). What it adds is structure the text implies but does not
state: the site chips, the photograph per day, the city each night is in, the cover paragraph, and
the house exclusions. **Every addition comes back in `notes`** and the panel prints them, tagged
`ADDED` / `ASSUMED` / `CHECK` / `READ`, before anything is applied.

**Deliberate judgements in the mapping:**

- A meal charged extra is not an included meal. `Meals : Optional Dinner with EXTRA cost 55 USD`
  leaves dinner unticked and puts *"Optional dinner — 55 USD per person"* in the exclusions with
  its price. Ticking it would have put a paid extra into the board basis and into the inclusions.
- A day card gets a hotel line only when **one** tier is quoted. Two tiers on the sheet and
  naming either would print a five-star hotel on a package sold at the four-star rate.
- The cover takes one highlight from each touring day before it takes a second from any — going
  in document order described day one and never mentioned day four. Arrival and departure days
  are skipped: an airport transfer is not a highlight.
- A broad label (`Alexandria`, `Islamic Cairo`, `The bazaar`) is kept as a chip only on a day with
  fewer than two specific sites. It still chooses the photograph, because "Alexandria" resolves to
  the harbour and that opens the day better than its first specific site happens to.
- `guide` is on whenever the day names a specific site. A guided day that leaves free time in the
  bazaar is still a guided day.
- The house exclusions are each conditional on the programme containing the thing they refer to —
  no tomb fees line on a trip with no tombs.
- **The concert line encodes a house decision**: the transfers are ours, the ticket is the
  client's. Row 203 was published the other way round. The note says so out loud on every build
  that triggers it; if the house rule is the other one, change `PROTECTIVE` in `packageImport.ts`.

**Nothing here writes to the database.** Reading is separate from applying, applying is separate
from saving, and a saved package is still a draft until Publish is pressed. Applying also clears
the compact-sheet overrides, which are keyed to the old cities.

## Verified

- `npx tsc --noEmit` clean; `vite build` clean. `applyImport` type-checking is what proves
  `ImportDay`/`ImportFixedDay`/`ImportPriceRow` are assignable to the builder's own shapes.
- Two fixtures run through the mapper in node, then through the **real `ItineraryDoc`** under
  `react-dom/server`, then through the **real `deriveSegments`**:
  - The supplied Cairo & Alexandria programme, pasted as one unbroken blob. Reproduces row 203:
    5 days / 4 nights, `Cairo — Stay Inn Pyramids, 4★ (or equal)`, `4 Star · solo 1500 · Cairo:
    Stay Inn Pyramids or equal`, `roomBasis single`, 1 guest, arrival and departure mapped, the
    55 USD dinner in the exclusions, label `cairo+alexandria 5d solo 1500`. **5 day pages, 5 day
    photographs, no warnings.**
  - An 8-day cruise with two tiers, a single supplement, full-board days, `Overnight on board`
    and a mixed-case `Day 3 –` heading. Two correct price rows, supplement → `sgl`, nights split
    `2 Cairo / 4 on board / 1 Cairo`, one warning (two tiers, so no hotel on the day cards).
    **8 day pages, 8 day photographs.**
- No `undefined`, `NaN` or `[object Object]` in either rendered document.

## Not done

- **Never opened in a browser.** The panel is verified by the type-checker and by the mapper's
  output, not by a click. Worth one pass through the real UI before an agent uses it on a live
  quote.
- The detail-line library covers the well-known sites only. A day about somewhere it does not
  know is left exactly as the supplier wrote it, which is the right failure.
- Everything in §4 of handoff 19 is still open. Nothing in this session touched row 173, the
  cached page, row 194's repricing, or the CDN load of `docx-preview`.
