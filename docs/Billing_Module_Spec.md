# RarePrint ERP — Billing / Invoice Module Spec (Vyapar-style)

**Purpose of this document:** a build brief for a dedicated, standalone "Billing" module
in the ERP (its own sidebar item, not a tab inside Accounts — see §5) — a
Vyapar-style invoicing experience layered on top of data that mostly already exists
(Orders, Customers, Payments, Accounts approval, the existing `Invoice`/`InvoiceItem`
tables). This is a planning/requirements document, not a task list to execute
immediately — use it to scope and sequence real implementation work later.

---

## 1. Vision

Give RarePrint a standalone **Billing** section (its own sidebar tab, separate from the
current Accounts approval queue) that looks and behaves like Vyapar: every customer
("party") has a running ledger, every invoice is a polished branded PDF generated in one
click, and the accountant can search, filter, reprint, and share any invoice without
digging through the order list.

This is **additive**, not a replacement for the existing order → approval → invoice
pipeline. Orders are still created in Orders, still approved in Accounts. Billing is the
layer that turns an approved order's already-existing `Invoice` record into a real,
shareable, professional PDF, and gives it a proper home to live in afterward.

---

## 2. What already exists and should be reused, not rebuilt

- `Invoice` + `InvoiceItem` tables already auto-create when an order is approved, already
  carry subtotal, taxable amount, CGST/SGST/IGST split, `gstTreatment`
  (intra-state/inter-state), total, paid, and balance — this is already exactly the tax
  structure our real bills use.
- `Customer` already has GSTIN (just added), phone, billing/shipping address, city,
  state, credit limit — this is the "party" record Vyapar would call a Party.
- Customer Directory already aggregates a customer's full order history in one place —
  the base of a Vyapar-style "Party Statement."
- WhatsApp sending is already wired up for invoice-generated notifications.
- PDF generation (PDFKit) is already used elsewhere in the codebase (courier invoices) —
  proven, no new library needed.
- GST number format validation already exists on order creation.

Billing should sit on top of these, not duplicate them.

---

## 3. Reference: our actual current bill format

Sample analyzed: `Invoice_311_07_11_25.pdf`. Fields present, top to bottom:

- Header: "Invoice" title, company logo, business name (RAREPRINT.IN), full address,
  phone(s), email, GSTIN, state.
- Bill To block: customer name, city, contact number, state.
- Invoice Details block: invoice number, date, Place of Supply.
- Line items table: #, item name (+ optional note line, e.g. "SHIPPING CHARGES EXTRA"),
  HSN/SAC, quantity, unit, price/unit, GST ₹ (with %), Ad. CESS ₹, amount.
- Totals row under the item table.
- Tax Summary table: HSN/SAC, taxable amount, IGST or CGST+SGST rate % and amount,
  Ad. CESS, total tax — grouped by HSN/SAC code.
- Right-side summary box: Sub Total, Total, Invoice Amount in Words, Received, Balance.
- Description (free text — currently used ad hoc, e.g. sales agent name typed manually).
- Terms & Conditions (free text, e.g. "SHIPPING CHARGES EXTRA").
- Bank Details block: bank name, account number, IFSC, account holder name.
- "For RAREPRINT.IN" + signature image + "Authorized Signatory".

The new PDF generator must reproduce all of this by default, sourced from real data
instead of manual entry, and should be extendable to other formats later (see §7).

---

## 4. Feature set (Vyapar-inspired, scoped to what a B2B printing wholesaler needs)

### 4.1 Invoice generation & documents
- One-click "Generate PDF" from an approved order/invoice — pulls company profile,
  customer, line items, tax split, and payment status automatically.
- Support both invoice types we actually issue: intra-state (CGST+SGST) and
  inter-state (IGST) — already modeled via `gstTreatment`, just needs to drive the PDF's
  tax summary table correctly (matches sample: this bill used IGST, MH→KA).
  Sample orders / COD vs prepaid orders should also be checked so the layout handles
  every case we issue (as discussed — send another example if the layout differs for
  those).
- "Amount in Words" auto-generated (number-to-words), not manually typed.
- Optional document types beyond Tax Invoice, if wanted later: Quotation / Proforma
  Invoice, Delivery Challan, Credit Note, Debit Note — these map to existing
  `AccountingNote` concepts already in the schema; only add if actually needed, don't
  build speculatively.
- Re-download/reprint any past invoice at any time, unchanged from when it was issued
  (immutable once issued — never silently regenerate historical numbers).

### 4.2 Company profile (new, small addition)
- One-time setup screen: business name, address, phone(s), email, GSTIN, state, bank
  details (name, account no., IFSC, account holder), logo image, signature image.
- Stored centrally (e.g. `SystemConfig` key-value, which already exists) and reused on
  every invoice — no per-invoice retyping.
- Multiple bank accounts, if RarePrint ever needs to show a different account per
  invoice — otherwise single default is fine.

### 4.3 Invoice numbering
- **Confirmed:** reuse the order number as the invoice number (current behavior).
  No separate sequential invoice-number system.

### 4.4 Party (customer) ledger — the Billing tab's core view
- Party list: every customer with total billed, total received, current balance due —
  effectively a receivables-first table.
- Party detail / statement: chronological list of every invoice + payment for that
  customer, running balance, downloadable as its own PDF statement (not just one
  invoice at a time) — the single most useful Vyapar feature for a business owner
  checking "how much does X owe me."
- Filters: by date range, by balance due > 0 (outstanding only), by GST state, by sales
  agent.

### 4.5 Payments against invoices
- Record full or partial payment against a specific invoice (reuses existing `Payment`
  model + verification flow already in Accounts — don't rebuild payment recording).
- Invoice status derived from paid vs total: Unpaid, Partially Paid, Paid, Overdue (if a
  due date is set and passed).
- Optional: due-date reminders — a scheduled nudge (WhatsApp, since that's already
  wired) for invoices overdue past X days. Only build if this is a real pain point, not
  speculative.

### 4.6 Sharing & delivery
- Buttons on every invoice: Download PDF, Print, Share via WhatsApp (reuse the existing
  WhatsApp integration — don't build a second one), Share via Email if email exists.
- WhatsApp send should attach the actual PDF, not just a text notification (this is a
  gap vs. what currently happens — right now only a text notification fires, no PDF is
  attached).

### 4.7 GST / accountant reporting
- Simple GST summary view: taxable value, CGST, SGST, IGST totals for a selected period
  — a starting point toward GSTR-1/GSTR-3B-style reporting, without needing to build
  full government filing integration.
- HSN/SAC-wise summary (the "Tax Summary" table on our bill is already grouped this way
  per invoice — extend that grouping across a date range for reporting).

### 4.8 Explicitly out of scope (Vyapar has these, we don't need them)
- Barcode scanning / POS-style billing — not relevant, orders already come through the
  existing Orders flow.
- Full inventory/stock management — production and paper stock are already tracked
  elsewhere in this ERP; billing should read from that, not duplicate it.
- Multi-business/multi-firm switching — RarePrint is single-tenant today (see the SaaS
  roadmap doc for future multi-tenant plans; don't conflate the two).

---

## 5. Where this lives in the app

**Decision: standalone module**, not another tab inside Accounts. Accounts already has
11 tabs (Order Approval, Billing & GST, Customer Outstanding, Dispatch Approval,
Receipts Pending, Receipt History, Vendor Statements, Commission, Payment Verification,
Payment History, Expense Tracker) — it's already a dense, overloaded page, and invoicing
is something a broader set of people may need to touch (look up/reshare a past invoice)
without needing access to more sensitive Accounts-only surfaces like Payment
Verification or Expense Tracker. A standalone module also matches the mental model
Vyapar itself uses — a dedicated billing app, not a tab buried in something else.

- New sidebar item: **Billing** (distinct from the existing "Accounts" tab, which stays
  focused on approvals/payment verification/dispatch/expenses).
- Sub-views: Invoices (list, filterable, searchable), Parties (the ledger view from
  §4.4), Company Profile (settings, §4.2), GST Summary (§4.7).
- Every invoice row links back to its source Order for full context, and every approved
  order in Accounts gets a direct "View/Generate Invoice" action into this new tab,
  instead of the invoice record only being reachable indirectly.
- **Migration note:** the existing "Billing & GST" tab (Sales Invoices table) and
  "Customer Outstanding" tab inside Accounts overlap directly with the new Invoices and
  Parties views here. These two should be retired/redirected into the new Billing module
  rather than left as duplicate surfaces showing the same data two different ways —
  plan this as part of the implementation, not a separate cleanup pass later.

---

## 6. Resolved decisions (2026-08-17)

1. ~~Invoice numbering~~ — **confirmed: reuse order number** (§4.3).
2. ~~Description field~~ — **confirmed: auto-fills with sales agent name**, editable
   per invoice (see `Billing_Module_Build_Prompt.md` §1/§2).
3. ~~Single vs multi-state billing~~ — **confirmed: single state, Maharashtra.**

## 7. Still open before implementation

1. Do COD orders, sample orders, and prepaid orders need different invoice layouts, or
   does one template handle all of them with conditional sections?
2. Should WhatsApp auto-send the PDF the moment an order is approved, or should sending
   be a manual "Share" click from the Billing tab?
3. Does RarePrint need Quotation/Proforma/Delivery Challan document types now, or just
   the Tax Invoice for now with room to add the others later?
4. Any other real bill formats (different customer types, states, or order types) that
   look different from the sample already reviewed — send them before layout work
   starts, so one template correctly covers every case instead of needing rework later.
5. **New:** which company address is actually correct — the sample invoice's ("F-401
   Fourth Floor Tirupati Apartment... Chandrapur, Maharashtra 442401") or the Google
   Business listing address just provided ("Tukdoji Chowk, behind Nutan Gym, near Nehru
   School, Ghutkala Ward, Ramnagar, Chandrapur, Maharashtra 442402")? They don't match —
   see `Billing_Module_Build_Prompt.md` §8.

---

## 8. Guardrails (per project rules)

- Financial data: invoices, once issued, must never be silently altered. Corrections go
  through credit/debit notes, matching how `AccountingNote` already works.
- Additive only: no existing Accounts/Orders/Payments behavior should change as a side
  effect of adding Billing.
- Reuse existing patterns: PDF library, WhatsApp integration, `SystemConfig`,
  `Invoice`/`InvoiceItem`/`Customer` models — new schema should be minimal (mainly
  company profile fields and, if wanted, an invoice-number-sequence config).
