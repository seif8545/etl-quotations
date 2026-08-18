
---

## 17. SESSION 2026-08-17/18 — INVOICES, TEXT → PAGES, AND A PILE OF QUOTES

Three code areas and a lot of package work. §16 (with its two revisions) is the biggest thing
here and is written up separately; this section is the rest, plus the state to pick up from.

### 17a. Invoices are editable now — see §15

`q_invoices` gained `updated_at`, `Documents.tsx` gained Edit + Duplicate on the Invoices tab,
and `Invoice.tsx` learned `hydrateInvoice()` / `duplicateInvoice()` / `updateInvoice()`. The
serial of a saved invoice is frozen; "Save as new invoice" mints a fresh one. Full detail in §15.

**Still true:** `q_invoices` has 2 rows and **`updated_at` is NULL on both** — nobody has
actually reopened an invoice in the app yet, so the edit path is tsc-clean and rehearsed against
the real table through the MCP but never clicked. Row id 2 was consumed by that rehearsal.

### 17b. Text → Pages — see §16, and read all three revisions

`q_text_docs` (1 row, a test). The feature works but has never been clicked in the real app and
the PDF has never been exported for real. The three revisions in §16 exist because the design
was wrong twice; the settled position is: **text flows, one column, type size chosen not
derived, page count is an outcome.** Do not re-litigate those.

**The website side is written but the repo is NOT pushed.** `functions/_lib/textDocHtml.js` and
`functions/pages/[slug].js` are on disk in `egypt-top-light` and `node --check` clean. Until
that repo is pushed, every `/pages/<slug>` link 404s. No new Cloudflare variables are needed —
it reuses the `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` pair the packages route already has.

### 17c. Package work — what was built and what is unfinished

`q_package_docs`: **96 rows, 35 published, max id 187.** One row has no slug (173).

| row | what happened | state |
|---|---|---|
| 164 | Alexandria dropped, Hurghada → **Sharm El Sheikh** by flight, included dive day 3 Aug, arrival moved to 26 Jul (13d/12n) | **published**, priced |
| 167 | rebuilt: arrive 30 Jul direct to Aswan, cruise first, eclipse 2 Aug, Cairo, ends at the Marsa Alam dive live-aboard | unpublished |
| 181 | was "Totality from Deir el-Bahari": eclipse moved to **Karnak**, sleeper train removed for 2 Cairo + 2 Luxor nights and two domestic flights | unpublished, **prices unchanged and now wrong** — 2,700 solo / 2,200 double were priced against two train nights |
| 184 | was "…Solar Eclipse Tour 2027 Double with Hurghada": moved to **3–10 March 2027**, all eclipse content stripped, renamed **Egypt Nile Cruise & Red Sea — Double with Hurghada**, March rates 3,900 / 4,500 / 5,600 | **published under a NEW slug** |
| 185 | **new** — Shannon Johnson Wood: cruise-first 29 Jul – 8 Aug, eclipse **from the cruise sundeck**, Hurghada, 4 Cairo nights, 5,200 pp double | unpublished, complete |
| 187 | given the orphaned slug `egypt-solar-eclipse-tour-2027-2` and published | **published** |

### The 164-and-165 restore, and the lesson in it

164 was edited in place and then the ORIGINAL was wanted back as a separate package. It had
already been overwritten. The recovery worked but only just:

- The snapshot came from **`packages-out/pam-egypt-14-days.json` on GitHub**, not from the
  device (which was offline at the time). `packages-out/` is a point-in-time export and drifts.
- It was trusted only after **diffing it against the six day-pages the edit had not touched** —
  byte-exact — and three places where it HAD gone stale were restored from the live values
  instead: "three guests" (the row had been revised to ten), a longer transfer line, an extra
  "Written booking confirmation" inclusion, and a trailing sentence in the intro.
- **Do this diff before ever trusting `packages-out/`.** A blind file-to-DB overwrite silently
  reverts real edits — §14 already says so; this session proved it the hard way.

The edited version went to **row 179** and 164 kept the live URL. When a published row is
edited in place, decide FIRST whether the original needs to survive.

### Slugs are the fragile part, and one link died this session

`/packages/egypt-solar-eclipse-tour-2027-2` was sent to someone and then 404'd, because the row
holding that slug was deleted or renamed. **96 rows against a max id of 187 — a lot has been
deleted.** A published slug is the only thing a client's link depends on and nothing warns you.

Worth building: a guard that refuses to change or delete a **published** row's slug without
confirmation. It does not exist yet.

Related: three rows — **170, 176, 187** — have byte-identical `data` (same fingerprint, the
28 Jul – 3 Aug 5,250 double) and **all three are published** under different slugs. The user
chose to keep all three. So a change to that quote must be applied to all three or the other
two clients see stale figures. There is exactly 1 duplicate-content group in the table today;
`select md5(data::text), count(*) … having count(*) > 1` finds them.

### 17d. Reading a client's chat before answering "does this match?"

A WhatsApp export was checked against row 185. Structure matched; **four things the client had
asked for more than once were missing from the document** — no perfume/oil shop stops,
vegetarian meals, tip guidance, and the payment schedule. All four are now footnote lines at the
end of that row's `included`, in the user's own wording, and the glasses went into `excluded` as
a priced add-on.

**Two standing rules came out of it:**

1. **Do not offer an alternative to a whole day inside that day's prose.** A quote is not a menu.
   "…or it can be traded for a second day in Cairo" was written into an Alexandria day and the
   user's reaction was unambiguous. Practical notes inside an activity ("the descent is a long
   spiral stair") are fine and wanted; offering to replace the day is not.
2. **Optional extras belong in the excluded list as `OPTIONAL ADD-ON — …, quoted on request`,**
   not scattered mid-day. Abu Simbel and Dahshur were moved there.

**Note the glasses reversal.** §14 records that every mention of solar viewing glasses was
stripped from the whole table as policy. Row 185 now has them back, as an add-on, because the
agent promised them to that client in writing. Other rows were left alone. If the policy is
still live, 185 is the deliberate exception.

### 17e. Cruise weekdays, again — they drive every date

§14's operator table decided the dates twice this session, so it is worth repeating:

- **3 nights Aswan → Luxor — embarks each FRIDAY**, disembarks Monday.
- 4 nights Luxor → Aswan — each Monday. 7 nights Luxor roundtrip — each Monday.

Row 184's March dates were derived from this: **Friday 5 March 2027** embarkation → arrive Cairo
Wednesday 3rd (two Cairo nights first), disembark Monday 8th, depart Wednesday 10th. Row 185's
30 July embarkation is the same Friday sailing, which is why totality on Monday 2 August lands
on the boat's last morning — the whole reason the sundeck viewing works.

### 17f. State of the working tree

`etl-quotations` — modified and **not committed**: `handoff.md`, `src/App.tsx`,
`src/pages/Documents.tsx`, `src/pages/Home.tsx`, `src/styles.css`, `src/pages/Invoice.tsx`, and
new: `src/lib/textItinerary.ts`, `src/pages/TextDoc.tsx`, `src/pages/TextBuilder.tsx`.
`tsc --noEmit` exits 0.

`egypt-top-light` — new and **not committed**: `functions/_lib/textDocHtml.js`,
`functions/pages/[slug].js`. `node --check` clean on both.

**`src/pages/Documents.tsx` is CRLF in the working tree while HEAD is LF**, so a plain `git diff`
shows the whole file. Review it with `git diff --ignore-cr-at-eol`. That predates this session.

Scratch files were left in `_to_delete/` — `device_bash` cannot delete, so they need removing by
hand.

### 17g. Next-session shortlist

1. **Push both repos.** Nothing in §15 or §16 reaches production until then, and `/pages/<slug>`
   404s meanwhile.
2. **Click through Text → Pages and export a real PDF.** Never done.
3. **Reprice row 181** — the sleeper train came out and the figures did not move.
4. **Row 185**: single supplement is 0 so none prints; publish when the client confirms.
5. Consider the published-slug guard, and a "same content, different rows" report.
