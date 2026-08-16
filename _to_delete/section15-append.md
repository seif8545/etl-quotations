
---

## 15. INVOICES ARE NOW EDITABLE  (new, 2026-08-16)

Until now an invoice was write-once: the form saved a row and there was no way back into it.
A typo meant a second invoice, and the common case — a client pays a deposit and the next
invoice bills the remainder — meant retyping the whole thing. Both are now one click from
**Documents → Invoices**.

### The two verbs, and why they are separate

- **Edit** reopens the row. `savedId`/`savedSerial` are passed, the editor binds to that row,
  and **Save changes** overwrites it. Offered only to the owner and to admins — the RLS
  `own invoices update` policy is owner-or-admin, so a recipient of a *shared* invoice would
  fill the form in and then fail at the save.
- **Duplicate** (and **Save as new invoice**, the same thing from inside the editor) inserts a
  new row and never touches the original.

**A saved invoice's serial is frozen** (`lockedSerial`). Changing the issue date on a document
the client already holds must not renumber it. Only "Save as new invoice" mints another, from
whatever issue date is on the form at that moment. Note the consequence: after an edit that
moves the date, `issue_date` and the date encoded in `serial` disagree. That is deliberate —
the number is the client's reference, not a derived field.

### What a duplicate carries over — decided by the user, do not "simplify" it

Everything: guests, rates, extras **and the deduction rows**. So TOTAL is unchanged and
Balance already reads the amount still outstanding. That is the whole point — the second
invoice in a file bills the remainder while still showing the client the full job and what
they have already paid. Only `issueDate` moves to today (`duplicateInvoice()`).

### Serial sequencing changed

`nextSeqForDate()` used to `count` the rows for that date and add one. Deleting an invoice
pulled the count back down and handed the next save a serial that was already live, and
`q_invoices.serial` carries **no unique index**, so nothing complained. It now reads the
highest `-NNN` already minted for that date. Second rows on one day are routine now, which is
why it started to matter.

Still open: RLS hides other agents' invoices from the query, so two agents billing on the same
day can still collide. Closing that needs a SECURITY DEFINER counter in the database — a
client-side `select` cannot see what it is not allowed to see.

### `q_invoices.updated_at` (new column, nullable timestamptz)

Stamped by `updateInvoice()` from the client, not by a trigger, so the Documents list can show
"edited <date>" under Created. **NULL means the row is exactly as first issued — do not
backfill it.** This is the column §9 wishes `q_package_docs` had: without it you cannot tell an
intentional edit from a corrupted row, and a previous session overwrote real edits for exactly
that reason.

### Files touched

- `src/pages/Invoice.tsx` — `hydrateInvoice()` (defaults every field out of a stored row, so a
  row written by an older build cannot flip a controlled input to uncontrolled mid-edit, and
  rebuilds the arrays so the editor never mutates the objects the Documents list still holds);
  `duplicateInvoice()`; `invoiceColumns()` shared by insert and update so the mirrored columns
  and the JSON can never drift; `saveInvoice()` now returns the new id; `updateInvoice()`.
  The editor takes `initial` / `savedId` / `savedSerial` and swaps its action row by mode.
- `src/pages/Documents.tsx` — `openInvoice` prop; Edit + Duplicate buttons on the Invoices tab;
  `updated_at` sub-line in the Created cell.
- `src/App.tsx` — `editInvoice` state, and `leaveInvoice()` so an invoice opened from the list
  closes back to the list rather than to Home. The editor seeds from its props **on mount
  only**; that is safe because leaving the page unmounts it, so every open is a fresh mount.
  Do not turn that conditional render into an always-mounted panel without adding a `key`.
- `src/styles.css` — `.notice`, the calm-coloured sibling of `.error`, for save confirmations.

### Verified

`tsc --noEmit` exits 0. The pure helpers were extracted from `Invoice.tsx`, compiled and run in
node (§11's harness recipe, applied to logic instead of layout): duplicate carries the
deductions and the balance, arrays are copied not aliased, junk/missing fields hydrate to safe
values, serial sequencing parses the live format. The insert → update → delete round trip was
rehearsed against the real table through the Supabase MCP with row 1's own data, confirmed, and
removed again; row 1 is untouched and `updated_at` is still NULL on it. Row id 2 was consumed
by that rehearsal, so the next real invoice will be id 3.

**Not verified in a browser** — no one has clicked these buttons yet. The Word/PDF path is
unchanged and was not re-exercised.
