# Invoice PDF — 1:1 Replication Spec

Supersedes §1 of `docs/Billing_Module_Build_Prompt.md` for the invoice PDF
layout. Ground-truth reference: `Sale_1263_23-06-2026.pdf` (a real RarePrint
invoice for "POSH PHARMA", uploaded 2026-08-20; a second reference,
`Invoice_311_07_11_25.pdf`, confirmed the same template with an inter-state
(IGST) invoice). Customer-specific values below are placeholders — this spec
describes structure, not data.

Implemented in `backend/src/billing/invoice-pdf.ts`. Verified against the
reference via `pdffonts`, `pdfimages`, and pixel-sampling the rendered PNG
(see extraction notes at the end).

## Global styling

- Page: A4, 40pt margin all sides. Content width = 515.28pt.
- Font: Segoe UI (`Body` regular / `Body-Bold` bold), registered via
  `registerInvoiceFonts()` in `pdf-fonts.ts`. This is the exact font the
  original tool uses (confirmed via `pdffonts` — embedded CID TrueType,
  Identity-H). Required because standard PDFKit fonts lack the ₹ glyph.
- Text/border color: dark navy-slate, `#3F4155` (sampled from the reference
  render — not black). Used for all body text, table borders, and the outer
  box.
- Section-header grey bar fill: `#F4F4F4` (sampled from the reference).
- All monetary cells are ₹-prefixed (`₹1,234.56`), not just labeled with a
  currency-column header.
- Every table cell that could overflow uses `{ width, height: <one-line-px>,
  ellipsis: true }` — NOT `lineBreak: false` alone, which does not prevent
  wrapping in this PDFKit version (verified via isolated test, see prior
  build notes). `height` is what forces single-line truncation.

## Section-by-section layout (top → bottom)

1. **Page title** — "Invoice", centered, bold, ~18pt, sits above the bordered
   box (not inside it).

2. **Company header box** (bordered rectangle, ~100pt tall):
   - Left: company logo, ~70×70pt.
   - Right of logo: company name (bold, brand color), then address
     (wraps to 2 lines if long), then two label:value rows —
     `Phone: <value>` / `Email: <value>` on one row, `GSTIN: <value>` /
     `State: <value>` on the next.

3. **Bill To / Invoice Details row** (bordered box split into two equal
   columns by a vertical divider):
   - Both columns get a grey header bar (`#F4F4F4`, ~18pt tall) reading
     `Bill To:` and `Invoice Details:` respectively.
   - **Bill To column**, top to bottom:
     - Customer business name (bold).
     - Full address as one comma-joined line: billing address, city, state,
       pincode (whichever are present) — e.g. `EKORI WARD, CHANDRAPUR,
       Chandrapur, Maharashtra, 442401`. Not just the city.
     - A row with `Contact No: <phone>` on the left half and `GSTIN Number:`
       (label on its own line, value on the line below it) on the right
       half — the GSTIN label+value stack is two lines tall, taller than the
       Contact No line next to it.
     - `State: <value>` on its own line below Contact No.
   - **Invoice Details column**, top to bottom: `No: <invoiceNumber>`,
     `Date: <issueDate>`, `Place of Supply: <state>` (lowercase "of").

4. **Line items table** — 7 columns (no separate CESS column in this
   template):
   `#` · `Item name` · `HSN/ SAC` · `Quantity` · `Unit` · `Price/ Unit (₹)` ·
   `GST(₹)` · `Amount(₹)`. Header row grey-filled.
   - Each data row is tall enough for **two lines in the Item name cell**:
     the product name, then on the line directly below it, the sales
     agent's name in parentheses, e.g. `STICKER 6*4` / `(SANKET)` — this is
     how the per-item "note" line works; it is not a separate top-level
     Description field (see §6 below — that field is gone from this
     template).
   - The **GST(₹) cell is two lines**: the ₹ amount on top, the tax rate in
     parentheses below it, e.g. `₹1,449.15` / `(18.0%)` — one decimal place
     on the percentage.
   - A final bold `Total` row: item count column blank, `Quantity` column
     shows summed quantity, `GST(₹)` and `Amount(₹)` columns show summed
     totals.

5. **Tax Summary** (label "Tax Summary:" above the table, not inside a
   header bar) — a genuine **two-tier spanning header**, not a flattened
   single row:
   - Row 1 (spanning cells): `HSN/ SAC` | `Taxable amount (₹)` | `CGST`
     (spans 2 sub-columns) | `SGST` (spans 2 sub-columns) | `Total Tax(₹)`.
     For inter-state invoices, replace the CGST+SGST pair with a single
     `IGST` header spanning the same 2 sub-columns (Rate/Amt) — confirmed
     against the `Invoice_311` reference, which is IGST-based.
   - Row 2 (sub-columns, only under the CGST/SGST/IGST span): `Rate (%)` |
     `Amt (₹)`, repeated once per tax type.
   - Data rows: one per HSN/SAC group, then a bold `TOTAL` row.
   - Rendered as an actual merged/spanning header, drawn with PDFKit
     primitives (a wide rect + border lines for the sub-column split), not
     abbreviated into single-row labels like an earlier pass did.
   - Sits in the **left ~58%** of the content width, beside the summary box.

6. **Right-side summary box** (no border, plain label/value rows, to the
   right of the Tax Summary table, top-aligned with it). Each row is
   `Label` left-aligned, `:` , then the value right-aligned — not just two
   spaces between label and value:
   - `Sub Total : ₹<subtotal>`
   - `Total : ₹<totalAmount>` (bold, larger)
   - `Invoice Amount In Words :` header, then the words on the next line(s).
   - `Received : ₹<paidAmount>`
   - `Balance : ₹<balanceAmount>`
   - `Previous Balance : ₹<previousBalance>` — customer's cumulative
     outstanding balance across all their invoices *before* this one.
   - `Current Balance : ₹<currentBalance>` — previous balance + this
     invoice's own balance. Both computed from the same running-balance
     logic as `getPartyLedger()` (single source of truth — do not
     re-derive with a different formula).
   - **Amount-in-words phrasing**: `<NumberWords> Rupees[ and <PaiseWords>
     Paise] only` — note "Rupees" comes *after* the number words, and
     "only" is lowercase and at the very end. (Different word order from a
     generic "Rupees ... Only" — matches the reference exactly:
     "Nine Thousand Five Hundred Rupees only".)

7. **Terms And Conditions** — a single **full-width** bordered row with a
   grey header bar ("Terms And Conditions:"), free text below it. There is
   **no separate "Description:" column any more** — the old 50/50
   Description/Terms split is retired; the sales-agent-name content that
   used to live in Description now appears as the per-item note in the line
   items table (§4).

8. **Bank Details / For \<Company\>: row** — same two-column pattern as
   before, unchanged: left column `Name:` / `Account No.:` / `IFSC code:` /
   `Account Holder's Name:` (note the capital H and apostrophe placement —
   `Account Holder's Name`, not `Account holder's name`); right column has
   the signature image and "Authorized Signatory" caption.

9. Outer border rectangle drawn around the whole document body last, on top
   of the individual section borders (unchanged from before).

## Assets extracted from the reference PDF (2026-08-20)

- Logo: 800×800 PNG, embedded/subset in the reference at object ID 6.
  Identical in size to the one extracted from `Invoice_311` earlier — same
  asset, already in use via `CompanyProfile.logoUrl`.
- Signature: 800×484 PNG, object ID 12. Same as previously extracted.
- No new assets needed — the existing `logoUrl`/`signatureUrl` data already
  stored in Company Profile are correct.

## Data-source additions needed vs. the prior build

- `previousBalance` / `currentBalance` — new, computed in
  `billing.service.ts#generateInvoicePdf` by reusing `getPartyLedger()`'s
  running-balance calculation for the invoice's customer, not a new
  formula.
- Per-item note — reuses the existing `order.salesAgent.fullName` value
  (previously mapped to the now-retired `description` field), applied as a
  second line under every item's product name instead of a standalone
  field.
