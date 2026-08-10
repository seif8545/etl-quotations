# Session handoff — 14 Jul (b)

Rules unchanged: edit .tsx via python heredoc (never Write/Edit on mount), verify
`node node_modules/typescript/lib/tsc.js --noEmit`, DB via Supabase MCP `execute_sql`
(proj yxgpjjwjgtgavfusurbi), created_by 0a58da13-831c-4322-8f62-e5777cc5f2b7.
tsc clean at session end. Full detail in handoff.md §0/§8.

## Done this session
1. **Doc sharing** (live). All 4 doc tables got `shared_with uuid[]`; RLS split so
   recipients SELECT only; trigger `q_guard_shared_with` blocks non-admin share edits.
   `Documents.tsx` takes isAdmin+uid; admin "Share…" modal (non-admin q_profiles);
   "Shared with you" tag; Delete hidden for non-owners. Files: App/Documents/styles.
2. **Dahabiya day presets** — q_day_presets ids 33–40 (7-night Luxor–Luxor).
3. **PDF fixes** (ItineraryDoc/PackageBuilder): scroll-zero before html2canvas capture
   (§8-I); overview.days now counted live from day pages, not stored; summary split into
   2 pages (Accommodation+Price / What's Included) so long lists don't clip price box.
4. **Builder UX**: Highlights now an editable comma input per day; Offered-hotels is a
   4-row textarea, rendered line-per-line in PDF; pricing eyebrow "Investment"→"Pricing";
   removed "Based on quoted rate" ref line.
5. **Photos**: moved dahabiya-philae into public/images/tours + manifest; picker got
   drag&drop/browse upload → Supabase Storage bucket `tour-photos` (public read); uploads
   show as "<area> — Uploaded"; `photoSrc()` maps http/relative.
6. **23 tour packages** inserted from tours.json (egypt-top-light-travel-v2 repo) as
   ids **98–120**. pp=json price, priceTableOn:false (add tiers in builder), hotels
   hand-derived (verified nights match), Jordan/Jerusalem days use fallback photos.

## Pending / next
- Uncommitted code (user push): App.tsx, Documents.tsx, PackageBuilder.tsx,
  ItineraryDoc.tsx, styles.css, manifest.json, public/images/tours/dahabiya-philae/,
  handoff.md. Fix corrupted git index first: `git reset` (had bogus staged deletions
  of tsconfig.json/vite.config.ts).
- **q_package_docs has many dupes** (~45 "Ultimate Egypt", ~14 "Majestic") because
  exportPdf() calls savePackage() every export. Offer: dedupe keep-newest + stop
  auto-save on export.
- Pricing tiers empty on ids 98–120; Jordan/Jerusalem/Petra photos missing from library.
