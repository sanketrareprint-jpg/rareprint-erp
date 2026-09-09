# Billing Module — Detailed Build Prompt

**How to use this file:** hand this directly to whoever (or whichever AI session) builds
the Billing module. It assumes the reader has NOT seen the earlier planning conversation
— everything needed to start implementing is here. Companion doc:
`docs/Billing_Module_Spec.md` (the "why" — vision, feature rationale, what's out of
scope). This doc is the "how" — concrete layout, data mapping, file structure, build
order.

Reference file: `Invoice_311_07_11_25.pdf` — RarePrint's actual current bill, generated
by their old billing tool. The PDF generator built here must reproduce this layout by
default, driven by real order/customer data instead of manual entry.

---

## 1. Exact PDF layout (top to bottom, matching the reference)

A4 portrait, roughly 40–50px page margin. Whole document body sits inside one outer
bordered box. Structure, in vertical order:

1. **Page title** — "Invoice", centered, bold, ~18pt, sits above the outer box (not
   inside it).
2. **Company header block** (inside the box, top strip, no border under it except the
   full-width rule that starts the next section):
   - Left: circular logo image (~70×70px).
   - Right of logo: business name in large bold red text ("RAREPRINT.IN"), then on the
     next line the full address (wraps to 2 lines here), then a row with "Phone:" +
     bold phone number(s) on the left half and "Email:" + bold email on the right half,
     then a row with "GSTIN:" + bold GSTIN on the left half and "State:" + bold state on
     the right half.
   - This whole block = the Company Profile data (§3 below), not order data.
3. **Bill To / Invoice Details row** — full-width strip split into two equal columns by
   a vertical rule, each with a light-grey header bar:
   - Left column header "Bill To:", then below (no header bar, plain rows): customer
     business name (bold), city, then a row "Contact No:" + phone next to "State:" +
     customer's state.
   - Right column header "Invoice Details:", then below: "No:" + invoice number,
     "Date:" + issue date, "Place Of Supply:" + state code + state name (this is the
     customer's state — the destination state for GST purposes).
4. **Line items table** — bordered, header row with grey background:
   columns: `#` | `Item name` (item name bold, optional note line below it in smaller
   text, e.g. "(SHIPPING CHARGES EXTRA)") | `HSN/SAC` | `Quantity` | `Unit` |
   `Price/Unit(₹)` | `GST(₹)` (shows the amount, with the rate % in parentheses next to
   it) | `Ad. CESS(₹)` | `Amount(₹)`.
   One row per order item. Bold `Total` row underneath summing quantity and the amount
   columns.
   - Note on the reference sample: its GST/Ad.CESS column values look like a
     data-entry quirk from the old tool (Price/Unit shows ₹0.00 and the actual line
     value ended up under "Ad. CESS" instead of being split out as taxable value + GST
     properly) — **don't blindly copy that math**. The new generator should compute
     Price/Unit × Quantity = taxable value, then GST = taxable value × rate correctly,
     and put real values in the right columns. Reproduce the table's *columns and
     styling*, not that specific row's arithmetic.
5. **Tax Summary** section, label "Tax Summary:" left-aligned above a table that sits
   side-by-side with a summary box on the right:
   - Left (~60% width): bordered table, columns `HSN/SAC` | `Taxable amount (₹)` |
     tax columns (see below) | `Ad. CESS (₹)` | `Total Tax (₹)`. One row per distinct
     HSN/SAC on the invoice, `TOTAL` row at the bottom.
     - Tax columns depend on `gstTreatment`: if `INTER_STATE`, one group header "IGST"
       spanning two sub-columns `Rate (%)` and `Amt (₹)`. If `INTRA_STATE`, this becomes
       two group headers "CGST" and "SGST", each with their own `Rate (%)` /`Amt (₹)`
       pair (this case isn't in the sample since it used IGST, but the schema already
       models both — build both, don't hardcode IGST-only).
   - Right (~40% width), no table borders, label:value rows: `Sub Total`, `Total`
     (bold), then a sub-block "Invoice Amount in Words:" with the spelled-out amount
     below it, then `Received`, then `Balance`.
6. **Description / Terms & Conditions row** — two equal columns, grey header bars
   "Description:" and "Terms & Conditions:", free-text content below each.
   **Description auto-fills with the order's sales agent name** (`order.salesAgent.fullName`
   — matches the ad hoc usage on the sample, now automated instead of manually typed),
   editable per invoice if the biller needs to override it. Terms & Conditions defaults
   to the Company Profile's `billing.defaultTermsAndConditions`, also editable per invoice.
7. **Bank Details / Signature row** — two equal columns:
   - Left, header "Bank Details:": `Name`, `Account No.`, `IFSC code`,
     `Account holder's name` — all from Company Profile, not per-invoice.
   - Right, header "For {Company Name}:": signature image, caption "Authorized
     Signatory" below it.

Colors: black body text, light grey (~#e5e5e5 or similar) header bars, thin black table
borders, red company name/logo accent color to roughly match RarePrint's brand red.

---

## 2. Field-by-field data source map

| PDF field | Source |
|---|---|
| Logo, business name, address, phone, email, company GSTIN, company state, bank details, signature image | **New**: Company Profile (§3) |
| Customer name, city, contact, customer state, customer GSTIN (for the Bill To block — not shown on sample but should be added since we now capture it) | `Order.customer` (existing `Customer` model) |
| Invoice No, Date | `Invoice.invoiceNumber`, `Invoice.issueDate` (existing) |
| Place of Supply | Customer's state (existing `Customer.state`) |
| Line items (name, HSN/SAC, qty, unit, price, GST, cess, amount) | `InvoiceItem` (existing — already has `hsnSac`, `quantity`, `unitPrice`, `gstRatePct`, `cgstAmount`/`sgstAmount`/`igstAmount`, `lineTotal`) |
| Tax Summary table | Aggregate `InvoiceItem` rows grouped by `hsnSac`, using `Invoice.gstTreatment` to decide IGST vs CGST+SGST columns |
| Sub Total, Total, Received, Balance | `Invoice.subtotal`, `Invoice.totalAmount`, `Invoice.paidAmount`, `Invoice.balanceAmount` (existing) |
| Amount in Words | **New**: number-to-words utility, computed from `Invoice.totalAmount` at render time (not stored) |
| Description | `order.salesAgent.fullName` (auto-filled, editable per invoice — confirmed) |
| Terms & Conditions | **New**: Company Profile default terms text, optionally overridable per invoice |

---

## 3. New schema: Company Profile

Store as key-value rows in the existing `SystemConfig` model (`key`, `value`,
`updatedAt`) — no new table needed. Suggested keys:

```
billing.companyName
billing.companyAddress
billing.companyPhone
billing.companyEmail
billing.companyGstin
billing.companyState
billing.bankName
billing.bankAccountNumber
billing.bankIfsc
billing.bankAccountHolderName
billing.defaultTermsAndConditions
billing.logoUrl
billing.signatureUrl
```

`logoUrl`/`signatureUrl`: store uploaded images the same way other file uploads in this
codebase are handled (check how `frontend/app/design-studio` or product image uploads
currently persist files before inventing a new upload path — reuse that pattern).

Invoice numbering reuses the existing order number (confirmed, §8) — no separate
sequence keys needed.

---

## 4. Backend build plan

New NestJS module, following the existing module pattern (see `backend/src/dispatch/`
for the shape to copy — module + controller + service + dto):

- `backend/src/billing/billing.module.ts` — register in `backend/src/app.module.ts`
  alongside the other modules (`DispatchModule` etc.).
- `backend/src/billing/billing.controller.ts`:
  - `GET /billing/invoices` — list, with filters (date range, customer, status, search)
  - `GET /billing/invoices/:id/pdf` — generate and stream/download the PDF
  - `GET /billing/parties` — party list with billed/received/balance rollups
  - `GET /billing/parties/:customerId/statement` — full ledger + PDF statement
  - `GET /billing/parties/:customerId/statement/pdf`
  - `GET /billing/company-profile`, `PUT /billing/company-profile` (owner/accountant only)
  - `POST /billing/company-profile/logo`, `POST /billing/company-profile/signature`
    (image upload)
  - `GET /billing/gst-summary?from=&to=` — taxable/CGST/SGST/IGST totals + HSN-wise
    breakdown for a period
  - `POST /billing/invoices/:id/share-whatsapp` — reuse the existing WhatsApp service,
    but attach the generated PDF (current behavior only sends a text notification —
    this is the gap to close)
- `backend/src/billing/billing.service.ts`:
  - `generateInvoicePdf(invoiceId)` — builds the PDFKit document following §1's layout,
    pulling data per §2's map. Mirror the structure (not the code) of
    `bigship.service.ts`'s existing `generateInvoicePdf` for how this codebase already
    sets up PDFKit documents, fonts, and streams the result.
  - `amountInWords(amount: number): string` — small standalone utility, no external
    dependency needed (a few hundred lines of number-to-words logic, or a lightweight
    npm package if one's already vetted — check `backend/package.json` for anything
    already covering this before adding a new dependency).
  - `getCompanyProfile()` / `updateCompanyProfile()` — read/write the `SystemConfig`
    keys from §3.
  - `getPartyLedger(customerId)` / `getGstSummary(from, to)` — aggregation queries over
    `Invoice`/`InvoiceItem`/`Payment`, joined through `Order.customer`.
- DTOs: `backend/src/billing/dto/` — `UpdateCompanyProfileDto`, query DTOs for the list
  endpoints, following the validation style already used in
  `backend/src/orders/dto/create-order.dto.ts` (class-validator decorators,
  `@IsOptional()` for everything not strictly required).

---

## 5. Frontend build plan

New top-level page, following the existing page shape (see `frontend/app/dispatch/page.tsx`
for the tab-switcher + `DashboardShell` pattern to copy):

- `frontend/app/billing/page.tsx` — tab switcher across four views:
  - **Invoices** — list/search/filter table (reuse the existing Sales Invoices table
    styling from Accounts' "Billing & GST" tab as the starting point — it already has
    the right columns), each row with Download PDF / Print / Share WhatsApp actions.
  - **Parties** — the receivables-first table from the spec's §4.4, click into a party
    for their full statement + running balance + "Download Statement PDF."
  - **Company Profile** — the one-time setup form (§3's fields), image upload for logo
    and signature.
  - **GST Summary** — period picker + taxable/CGST/SGST/IGST totals + HSN-wise table.
- Sidebar nav entry: add to the nav array in `frontend/components/dashboard-shell.tsx`
  (same array `Dispatch` is defined in) — `{ label: "Billing", href: "/billing", icon: <pick something like FileText or Receipt from lucide-react> }`.
- On Accounts' "Order Approval" tab, add a "View/Generate Invoice" link per approved
  order pointing at `/billing?invoiceId=...` (or similar), per the spec's §5.

---

## 6. Retiring the overlapping Accounts tabs

Once the Billing module's Invoices and Parties views are live and verified against real
data, remove (or redirect) Accounts' "Billing & GST" and "Customer Outstanding" tabs so
the same data doesn't live in two places. Do this as a deliberate last step, not
simultaneously with the initial build — keep the old tabs working until the new module
is confirmed correct, so there's no gap in accountant workflow during rollout.

---

## 7. Suggested build order (phases, not a rigid sequence)

1. Company Profile: schema keys + backend CRUD + frontend settings form. Nothing else
   depends on anything except this existing first.
2. PDF generation: `generateInvoicePdf` + `amountInWords`, wired to a single "Download
   PDF" button somewhere reachable (even bolted onto the existing Accounts invoice list
   temporarily) — get the actual PDF output matching the reference layout before
   building the surrounding UI.
3. Billing module shell: new page, Invoices tab wired to real data, nav entry added.
4. Parties/ledger view + statement PDF.
5. GST Summary view.
6. WhatsApp PDF attachment (closing the current text-only gap).
7. Retire the two overlapping Accounts tabs (§6).

---

## 8. Decisions (confirmed by Sanket, 2026-08-17)

- **Invoice numbering: reuse the existing order number.** No separate invoice sequence,
  no `billing.invoiceNumberSequence`/`billing.invoiceNumberPrefix` keys needed — drop
  those from §3.
- **Description auto-fills with the sales agent's name**, editable per invoice. See §1/§2
  updates above.
- **Single registered state — Maharashtra.** Company Profile is a flat `SystemConfig`
  set (§3), not a list. Confirmed no multi-state billing needed.

### One thing to resolve before building Company Profile: which address is correct

Two different addresses have come up and they don't match:

- The **sample invoice itself** prints: "F-401 FOURTH FLOOR TIRUPATI APARTMENT 03 401
  FOURTH FLOOR TIRUPATI APARTMENT CHANDRAPUR MAHARASHTRA 442401"
- The **address Sanket provided** (from RarePrint's Google Business listing): "Rareprint.in,
  Tukdoji Chowk, behind Nutan Gym, near Nehru School, Ghutkala Ward, Ramnagar,
  Chandrapur, Maharashtra 442402"

Different building/area, different pincode (442401 vs 442402). Before filling in
`billing.companyAddress`, confirm which one is the actual current registered address to
print on invoices — one of the two may simply be outdated (old invoice tool vs. a stale
Google listing, or vice versa).
