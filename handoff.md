HANDOFF — ETL Quotation System (Egypt Top Light Travel)

**What this is:** Rebuild of a 2024 ASPX tool (3 modules: Excel quotations, guarantee letters, hotel vouchers). Now a Vite + React + TypeScript SPA with Supabase. All 4 phases done.

**Locations**
- Code: `C:\Users\DELL\Downloads\etl-quotations` → GitHub `seif8545/etl-quotations` → Cloudflare Pages (build `npm run build`, output `dist`)
- Plan doc: `F:\3com\Downloads\quotations\REBUILD_PLAN.md`; templates backup in `F:\3com\Downloads\quotations\templates\`
- Old ASPX source of truth: `F:\3com\source\repos\quotations\quotations`

**Supabase:** project `art-crawford-gallery` (id `yxgpjjwjgtgavfusurbi`, shared with another app — all tables prefixed `q_`). URL + publishable key committed in `.env` (safe). Admin user: seif@egypttoplight.net (email manually confirmed; "Confirm email" toggle should be disabled in dashboard for future agents). RLS: agents see own docs, admins everything; `q_is_admin()` helper.

**Data/pricing rules (from newbasequotation.xlsx, imported):** 120 sites, 104 transfers; +10% prices from 1 Nov 2025 (per-row `new_price*` + `effective_date`); vehicle by pax ≤7 limo / ≤15 coaster / 16+ bus (`q_pax_tiers`); SGL supp = 70% of DBL (`q_settings`); Guide 2000 / Rep 400 LE/day (`q_service_rates`). 26 sites sit in "More Sites" region awaiting reassignment; 14 religious sites have price 0 — fix in Admin.

**Key files:** `src/lib/pricing.ts` (mirrors template formulas), `src/lib/excel.ts` (fills "Quotation new" sheet, `fullCalcOnLoad=true`, dates written as UTC), `src/lib/docx.ts` + `public/templates/*_tpl.docx` (docxtemplater tags added to original templates), pages: QuotationWizard, Letter, Voucher, Documents (list/duplicate/re-export/save-as-package), Admin (8 CRUD tabs).

**Known quirks:** (1) Cowork Write/Edit tool occasionally truncates files on this machine — if a build fails with "Identifier expected"/EOF errors, the file was cut; rewrite via bash heredoc and verify with `node node_modules/typescript/lib/tsc.js --noEmit`. (2) Sandbox npm registry blocked — build/test on user's machine only. (3) PDF for letters/vouchers = print view or Word save-as; exact one-click PDF would need a server converter.

**State at handoff:** tsc passes clean; awaiting user's `git push` of fixed `excel.ts` → Cloudflare auto-deploy. Next likely asks: verify totals/dates in generated Excel, region/price cleanup in Admin, custom domain.