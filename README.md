# Egypt Top Light — Quotation System (Phase 1)

Rebuild of the 2024 ASPX quotation tool. React + Vite + TypeScript, Supabase (auth + data), Excel generated in the browser from the base template.

## Run locally
1. Install Node.js 18+ (https://nodejs.org)
2. In this folder:
   npm install
   npm run dev
3. Open http://localhost:5173

## First use
- Create an account on the login screen (each agent gets their own).
- Admin account: seif@egypttoplight.net (already promoted). To promote another user, run in Supabase SQL editor:
  update q_profiles set role='admin' where id = (select id from auth.users where email='THEIR_EMAIL');
  (or use the Admin > Users tab once signed in as admin)

## Deploy (any static host / IIS)
- Run `npm run build` — output goes to `dist/`.
- Copy `dist/` contents to any web server (IIS site, nginx, shared hosting). No server-side code needed; all data goes through Supabase.

## Notes
- Prices live in Supabase (q_sites, q_transfers, ...) — imported from newbasequotation.xlsx.
- Excel output fills the "Quotation new" sheet of public/templates/newbasequotation.xlsx — identical layout to the current file.
- Admin panel (top bar, admins only): edit all prices, lists, pax tiers, settings, users.
- Documents (top bar): every generated quotation/letter/voucher, searchable; re-download, duplicate, save a quotation as a reusable package.
- Guarantee letters & hotel vouchers: exact copies of the current Word templates; "Print / PDF" opens a print view (choose "Save as PDF").
