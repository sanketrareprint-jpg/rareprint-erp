// backend/src/billing/invoice-pdf.ts
//
// Renders the Tax Invoice PDF matching RarePrint's real bill layout 1:1 —
// see docs/Invoice_PDF_Replication_Spec.md for the exact section-by-section
// spec this follows (supersedes the earlier §1 in
// docs/Billing_Module_Build_Prompt.md — this version was corrected against a
// second, more complete reference, Sale_1263_23-06-2026.pdf, 2026-08-20).
// Structural pattern (PDFKit doc → chunks → Buffer via a Promise) mirrors the
// existing generateInvoicePdf in bigship.service.ts.
//
// Every coordinate/height below (2026-08-20 pass) was taken directly from
// `pdftotext -bbox-layout` run against the reference PDF — i.e. the exact
// pt-position of every text run in the original, not a visual estimate. An
// earlier pass eyeballed spacing from rendered pixels and drifted further
// off the original with every section (confirmed by the user overlaying
// both PDFs in Photoshop); this pass replaces every offset with the
// measured value so nothing compounds.
import PDFDocument from 'pdfkit';
import { amountInWords } from './amount-in-words';
import { registerInvoiceFonts } from './pdf-fonts';

export interface InvoicePdfCompanyProfile {
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  companyGstin: string;
  companyState: string;
  bankName: string;
  bankAccountNumber: string;
  bankIfsc: string;
  bankAccountHolderName: string;
  defaultTermsAndConditions: string;
  logoUrl: string | null;
  signatureUrl: string | null;
}

export interface InvoicePdfItem {
  productName: string;
  hsnSac: string | null;
  quantity: number;
  unit: string;
  unitPrice: number;
  gstRatePct: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  taxableAmount: number;
  lineTotal: number;
}

export interface InvoicePdfData {
  invoiceNumber: string;
  issueDate: string; // pre-formatted, e.g. "23-06-2026"
  gstTreatment: 'INTRA_STATE' | 'INTER_STATE' | 'EXPORT' | 'UNREGISTERED';
  subtotal: number;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  previousBalance: number;
  currentBalance: number;
  // Sales-agent name — printed as a note line under every item's product
  // name (e.g. "STICKER 6*4" / "(SANKET)"), matching the reference. The
  // template no longer has a standalone "Description" field — see
  // docs/Invoice_PDF_Replication_Spec.md §6/§7.
  agentName: string;
  termsAndConditions: string;
  customerName: string;
  customerAddress: string; // full comma-joined address (billing address, city, state, pincode)
  customerPhone: string;
  customerState: string;
  customerGstin: string;
  items: InvoicePdfItem[];
  company: InvoicePdfCompanyProfile;
}

// Left/right margins measured from the reference: leftmost text ("Bill To:",
// "#", "Terms And Conditions:") sits at x≈35-37, and the rightmost column
// ("Amount(₹)") ends flush with x≈559.9 on a 594.96pt-wide page — i.e. a
// symmetric ~35pt margin, not the round 40pt guessed in an earlier pass.
const PAGE_MARGIN = 35;
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
// Sampled directly from the reference PDF's rendered pixels (2026-08-20) —
// not black/generic grey. See docs/Invoice_PDF_Replication_Spec.md.
const GREY = '#f4f4f4';
const BORDER = '#3f4155';

// Indian-style digit grouping (last 3 digits, then groups of 2 —
// "12,34,567.89") — the reference invoice formats every amount this way
// (e.g. "₹1,449.15", "₹9,500.00"), not plain toFixed(2). Matches the same
// grouping convention amount-in-words.ts uses conceptually (lakh/crore).
function money(n: number): string {
  const safe = Number.isFinite(n) ? n : 0;
  const fixed = Math.abs(safe).toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  let grouped = intPart;
  if (intPart.length > 3) {
    const last3 = intPart.slice(-3);
    const rest = intPart.slice(0, -3);
    grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
  }
  return `${safe < 0 ? '-' : ''}${grouped}.${decPart}`;
}

// ₹-prefixed amount, for table cells that should show the currency symbol
// per-cell (matches the reference invoice).
function rupee(n: number): string {
  return `₹${money(n)}`;
}

function sanitize(value: string | null | undefined): string {
  return String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim();
}

function dataUrlToBuffer(dataUrl: string | null | undefined): Buffer | null {
  if (!dataUrl || !dataUrl.startsWith('data:')) return null;
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return null;
  try {
    return Buffer.from(dataUrl.slice(commaIdx + 1), 'base64');
  } catch {
    return null;
  }
}

export async function buildInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN, bufferPages: true });
  const chunks: Buffer[] = [];
  registerInvoiceFonts(doc);

  return new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    let y = PAGE_MARGIN;
    // Tracks whether a page break has happened since boxTop was captured —
    // the final outer-border rect further down assumes boxTop and y are on
    // the same page (PDFKit y-coordinates reset per page). On invoices long
    // enough to paginate (many line items), drawing that rect across a page
    // boundary produced a stray full-length horizontal line slicing through
    // whatever content sits at boxTop's y-offset on the later page —
    // confirmed via a 25-item stress render. Skip the outer box once a page
    // break has occurred; each section already has its own border.
    let pageBroke = false;

    function ensureSpace(needed: number) {
      if (y + needed > PAGE_HEIGHT - PAGE_MARGIN) {
        doc.addPage();
        y = PAGE_MARGIN;
        pageBroke = true;
      }
    }

    // ── 1. Page title ────────────────────────────────────────────────────
    doc.font('Body-Bold').fontSize(18).fillColor(BORDER);
    doc.text('Invoice', PAGE_MARGIN, y + 3, { align: 'center', width: CONTENT_WIDTH });
    y += 34; // -> boxTop lands at 69pt, matching the reference's company-box top border.

    const boxTop = y;

    // ── 2. Company header block ─────────────────────────────────────────
    const headerHeight = 85;
    doc.rect(PAGE_MARGIN, y, CONTENT_WIDTH, headerHeight).stroke(BORDER);

    const logoBuf = dataUrlToBuffer(data.company.logoUrl);
    // headerTextX=120 matches the reference's measured text left edge
    // exactly (company name/address both start at x≈119.8).
    let headerTextX = PAGE_MARGIN + 12;
    if (logoBuf) {
      try {
        // Position/size read directly off the reference PDF's content
        // stream (the `cm` transform matrix preceding the image `Do`
        // operator, decoded via pikepdf) — not eyeballed. Reference places
        // the logo at x=39.75, y=75.0 (top-left, boxTop+7) sized 72.75².
        doc.image(logoBuf, PAGE_MARGIN + 5, y + 7, { width: 73, height: 73, fit: [73, 73] });
        headerTextX = 120;
      } catch {
        // Corrupt/unsupported image data — fall back to text-only header
        // rather than failing the whole PDF.
      }
    }

    const headerTextWidth = PAGE_MARGIN + CONTENT_WIDTH - headerTextX - 10;
    doc.font('Body-Bold').fontSize(16).fillColor(BORDER);
    doc.text(sanitize(data.company.companyName) || 'Company Name Not Set', headerTextX, y + 9, { width: headerTextWidth });
    doc.font('Body').fontSize(8.5).fillColor(BORDER);
    doc.text(sanitize(data.company.companyAddress) || 'Company address not set — fill in Billing > Company Profile', headerTextX, y + 29, { width: headerTextWidth, height: 22, ellipsis: true });

    doc.font('Body').fontSize(8.5).fillColor(BORDER);
    // Right-half column starts at headerTextX+220.5 — measured from the
    // reference (Email:/State: sit at x≈340.5 vs Phone:/GSTIN: at x≈121.8,
    // a ~219pt gap), not an exact half of headerTextWidth as an earlier
    // pass assumed (that landed ~5pt too far left).
    const rightColX = headerTextX + 220.5;
    const rowY1 = y + 53;
    doc.text('Phone:', headerTextX, rowY1, { continued: true, width: headerTextWidth / 2 });
    doc.font('Body-Bold').text(` ${sanitize(data.company.companyPhone) || '-'}`);
    doc.font('Body').text('Email:', rightColX, rowY1, { continued: true });
    doc.font('Body-Bold').text(` ${sanitize(data.company.companyEmail) || '-'}`);

    const rowY2 = y + 66;
    doc.font('Body').text('GSTIN:', headerTextX, rowY2, { continued: true, width: headerTextWidth / 2 });
    doc.font('Body-Bold').text(` ${sanitize(data.company.companyGstin) || '-'}`);
    doc.font('Body').text('State:', rightColX, rowY2, { continued: true });
    doc.font('Body-Bold').text(` ${sanitize(data.company.companyState) || '-'}`);

    y += headerHeight;

    // ── 3. Bill To / Invoice Details row ────────────────────────────────
    const biRowHeight = 77;
    const colWidth = CONTENT_WIDTH / 2;
    doc.rect(PAGE_MARGIN, y, CONTENT_WIDTH, biRowHeight).stroke(BORDER);
    doc.moveTo(PAGE_MARGIN + colWidth, y).lineTo(PAGE_MARGIN + colWidth, y + biRowHeight).stroke(BORDER);

    doc.rect(PAGE_MARGIN, y, colWidth, 17).fill(GREY);
    doc.rect(PAGE_MARGIN + colWidth, y, colWidth, 17).fill(GREY);
    doc.fillColor(BORDER).font('Body-Bold').fontSize(9);
    // Left-column text padding reduced from an earlier +8 to +2 — the
    // reference's actual left-inset (measured from its text bbox x, ~1.9-
    // 2.6pt from the border) is much tighter than that; +8 was visibly
    // shifting the whole Bill To block right of the original in an overlay
    // diff.
    doc.text('Bill To:', PAGE_MARGIN + 2, y + 5);
    doc.text('Invoice Details:', PAGE_MARGIN + colWidth + 5, y + 5);

    // Bill To column: name, full address, (Contact No | GSTIN Number stacked), State.
    doc.font('Body-Bold').fontSize(10).fillColor(BORDER);
    doc.text(sanitize(data.customerName) || 'Customer', PAGE_MARGIN + 2, y + 21, { width: colWidth - 10, height: 13, ellipsis: true });
    doc.font('Body').fontSize(9);
    doc.text(sanitize(data.customerAddress) || '-', PAGE_MARGIN + 2, y + 34, { width: colWidth - 10, height: 16, ellipsis: true });

    const gstinColX = PAGE_MARGIN + colWidth / 2 + 1;
    doc.font('Body').fontSize(9).text('Contact No:', PAGE_MARGIN + 2, y + 51, { continued: true, width: colWidth / 2 - 6 });
    doc.font('Body-Bold').text(` ${sanitize(data.customerPhone) || '-'}`);
    doc.font('Body').text('GSTIN Number:', gstinColX, y + 51, { width: colWidth / 2 - 6 });
    doc.font('Body-Bold').text(sanitize(data.customerGstin) || '-', gstinColX, y + 61, { width: colWidth / 2 - 6 });

    doc.font('Body').fontSize(9).text('State:', PAGE_MARGIN + 2, y + 63, { continued: true });
    doc.font('Body-Bold').text(` ${sanitize(data.customerState) || '-'}`);

    // Invoice Details column.
    doc.font('Body').fontSize(9);
    doc.text('No:', PAGE_MARGIN + colWidth + 5, y + 22, { continued: true });
    doc.font('Body-Bold').text(` ${sanitize(data.invoiceNumber)}`);
    doc.font('Body').text('Date:', PAGE_MARGIN + colWidth + 5, y + 34, { continued: true });
    doc.font('Body-Bold').text(` ${sanitize(data.issueDate)}`);
    doc.font('Body').text('Place of Supply:', PAGE_MARGIN + colWidth + 5, y + 46, { continued: true });
    doc.font('Body-Bold').text(` ${sanitize(data.customerState) || '-'}`);

    y += biRowHeight;
    // Reference leaves a small gap between the Bill To/Invoice Details box
    // and the item table's own top border (they don't share a line).
    y += 4;

    // ── 4. Line items table ─────────────────────────────────────────────
    // 8 columns — no separate Ad.CESS column in this template (dropped vs.
    // an earlier pass; see docs/Invoice_PDF_Replication_Spec.md §4). Widths
    // measured from the reference's exact column borders (right-aligned
    // numeric columns' xMax match their header's xMax exactly).
    const cols = [
      { key: '#', width: 21, numeric: false },
      { key: 'Item name', width: 139, numeric: false },
      { key: 'HSN/ SAC', width: 55, numeric: false },
      { key: 'Quantity', width: 66, numeric: true },
      { key: 'Unit', width: 57, numeric: true },
      { key: 'Price/ Unit (₹)', width: 63, numeric: true },
      { key: 'GST(₹)', width: 63, numeric: true },
      { key: 'Amount(₹)', width: 61.28, numeric: true },
    ];
    const tableX = PAGE_MARGIN;
    const headerRowH = 16;
    ensureSpace(headerRowH + 26);
    let colX = tableX;
    doc.rect(tableX, y, CONTENT_WIDTH, headerRowH).fill(GREY).stroke(BORDER);
    doc.fillColor(BORDER).font('Body-Bold').fontSize(7);
    for (const col of cols) {
      doc.text(col.key, colX + 3, y + 4, { width: col.width - 6, height: 9, ellipsis: true, align: col.numeric ? 'right' : 'left' });
      colX += col.width;
    }
    y += headerRowH;

    let totalQty = 0;
    let totalAmount = 0;
    let totalGst = 0;

    const agentNote = sanitize(data.agentName);
    const itemRowH = 28; // two lines: product name + "(agent)" note, and GST amount + rate%.

    doc.font('Body').fontSize(8);
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      const gstAmt = item.cgstAmount + item.sgstAmount + item.igstAmount;
      ensureSpace(itemRowH);

      doc.rect(tableX, y, CONTENT_WIDTH, itemRowH).stroke(BORDER);
      colX = tableX;

      doc.fillColor(BORDER).font('Body').fontSize(8);
      doc.text(String(i + 1), colX + 3, y + 9, { width: cols[0].width - 6, height: 10, ellipsis: true });
      colX += cols[0].width;

      // Item name + agent-name note line.
      doc.text(sanitize(item.productName), colX + 3, y + 5, { width: cols[1].width - 6, height: 10, ellipsis: true });
      if (agentNote) {
        doc.fontSize(7).text(`(${agentNote})`, colX + 3, y + 16, { width: cols[1].width - 6, height: 9, ellipsis: true });
        doc.fontSize(8);
      }
      colX += cols[1].width;

      doc.text(sanitize(item.hsnSac) || '-', colX + 3, y + 9, { width: cols[2].width - 6, height: 10, ellipsis: true });
      colX += cols[2].width;
      doc.text(String(item.quantity), colX + 3, y + 9, { width: cols[3].width - 6, height: 10, ellipsis: true, align: 'right' });
      colX += cols[3].width;
      doc.text(sanitize(item.unit) || 'PCS', colX + 3, y + 9, { width: cols[4].width - 6, height: 10, ellipsis: true, align: 'right' });
      colX += cols[4].width;
      doc.text(rupee(item.unitPrice), colX + 3, y + 9, { width: cols[5].width - 6, height: 10, ellipsis: true, align: 'right' });
      colX += cols[5].width;

      // GST(₹) — amount on top, rate% below, both right-aligned.
      doc.text(rupee(gstAmt), colX + 3, y + 5, { width: cols[6].width - 6, height: 10, ellipsis: true, align: 'right' });
      doc.fontSize(7).text(`(${Number(item.gstRatePct).toFixed(1)}%)`, colX + 3, y + 16, { width: cols[6].width - 6, height: 9, ellipsis: true, align: 'right' });
      doc.fontSize(8);
      colX += cols[6].width;

      doc.text(rupee(item.lineTotal), colX + 3, y + 9, { width: cols[7].width - 6, height: 10, ellipsis: true, align: 'right' });

      y += itemRowH;

      totalQty += item.quantity;
      totalAmount += item.lineTotal;
      totalGst += gstAmt;
    }

    const totalRowH = 16;
    ensureSpace(totalRowH);
    doc.rect(tableX, y, CONTENT_WIDTH, totalRowH).fill('#f8f8f8').stroke(BORDER);
    doc.fillColor(BORDER).font('Body-Bold').fontSize(8.5);
    doc.text('Total', tableX + 3, y + 3, { width: cols[0].width + cols[1].width + cols[2].width - 6, height: 11, ellipsis: true });
    doc.text(
      String(totalQty),
      tableX + cols[0].width + cols[1].width + cols[2].width + 3,
      y + 3,
      { width: cols[3].width - 6, height: 11, ellipsis: true, align: 'right' },
    );
    doc.text(
      rupee(totalGst),
      tableX + cols[0].width + cols[1].width + cols[2].width + cols[3].width + cols[4].width + cols[5].width + 3,
      y + 3,
      { width: cols[6].width - 6, height: 11, ellipsis: true, align: 'right' },
    );
    doc.text(
      rupee(totalAmount),
      tableX + CONTENT_WIDTH - cols[7].width + 3,
      y + 3,
      { width: cols[7].width - 6, height: 11, ellipsis: true, align: 'right' },
    );
    y += totalRowH;
    // Small gap before the "Tax Summary:" label (matches the reference's
    // ~4pt gap between the item Total row and the label text).
    y += 4;

    // ── 5. Tax Summary ───────────────────────────────────────────────────
    ensureSpace(18);
    // The right-side summary box starts at the SAME y as this label (not
    // after it) — in the reference, "Sub Total" sits almost exactly level
    // with "Tax Summary:", not with the tax table itself, which starts
    // ~12pt lower once the label's own line height is accounted for.
    const rightBoxTop = y;
    doc.font('Body-Bold').fontSize(9).fillColor(BORDER).text('Tax Summary:', tableX, y);
    y += 12;

    const isInterState = data.gstTreatment === 'INTER_STATE' || data.gstTreatment === 'EXPORT';
    // leftWidth was previously CONTENT_WIDTH*0.58 (a guess) — the reference
    // tax table is actually ~70% of content width (measured: its rightmost
    // column data — "1,449.15" in the TOTAL row — ends at x≈400.3, and
    // "Sub Total" on the right starts at x≈406.3, both against tableX=35).
    // The 58% guess put the whole right-side summary box ~55pt too far
    // left, consistently, across every row — confirmed by diffing this
    // render's exact text coordinates against the reference's.
    const leftWidth = 368;
    const GAP = 3;
    // RIGHT_PAD keeps right-aligned values (Sub Total / Total / Balance /
    // etc.) from landing flush against the outer page border — without it,
    // rightX + rightWidth lands exactly on tableX + CONTENT_WIDTH, so
    // align:'right' text has zero clearance and visibly touches the border.
    const RIGHT_PAD = 6;
    const rightWidth = CONTENT_WIDTH - leftWidth - GAP - RIGHT_PAD;
    const rightX = tableX + leftWidth + GAP;

    // Group items by HSN/SAC for the tax summary table.
    const groups = new Map<string, { taxable: number; cgst: number; sgst: number; igst: number; total: number }>();
    for (const item of data.items) {
      const key = sanitize(item.hsnSac) || '-';
      const g = groups.get(key) ?? { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
      g.taxable += item.taxableAmount;
      g.cgst += item.cgstAmount;
      g.sgst += item.sgstAmount;
      g.igst += item.igstAmount;
      g.total += item.cgstAmount + item.sgstAmount + item.igstAmount;
      groups.set(key, g);
    }

    // Guard against the tax table overflowing off the bottom of the page —
    // it has no per-row pagination of its own (unlike the line-items table
    // above), so a rough upfront estimate + single page break is enough to
    // stop content being silently drawn past the page boundary and lost.
    ensureSpace(32 + (groups.size + 1) * 16 + 20);

    const taxTableTop = y;
    // Real two-tier spanning header (HSN/SAC, Taxable amount, Total Tax are
    // vertically merged across both header rows; CGST/SGST — or IGST for
    // inter-state — each span 2 sub-columns horizontally in row 1, with
    // Rate(%)/Amt(₹) sub-headers in row 2). Both header rows measure ~16pt
    // each in the reference (a much taller 2-tier header than a flattened
    // single-row one would need). See docs/Invoice_PDF_Replication_Spec.md §5.
    const taxRow1H = 16;
    const taxRow2H = 16;
    const taxHeaderH = taxRow1H + taxRow2H;
    const taxRowH = 16;

    let hsnW: number, taxableW: number, totalTaxW: number;
    let spanGroups: { label: string; width: number; subWidths: [number, number] }[];
    if (isInterState) {
      hsnW = leftWidth * 0.16;
      taxableW = leftWidth * 0.24;
      totalTaxW = leftWidth * 0.28;
      const igstW = leftWidth - hsnW - taxableW - totalTaxW;
      spanGroups = [{ label: 'IGST', width: igstW, subWidths: [igstW * 0.44, igstW * 0.56] }];
    } else {
      hsnW = leftWidth * 0.14;
      taxableW = leftWidth * 0.2;
      totalTaxW = leftWidth * 0.2;
      const pairW = (leftWidth - hsnW - taxableW - totalTaxW) / 2;
      spanGroups = [
        { label: 'CGST', width: pairW, subWidths: [pairW * 0.44, pairW * 0.56] },
        { label: 'SGST', width: pairW, subWidths: [pairW * 0.44, pairW * 0.56] },
      ];
    }

    // Outer header rect + grey fill.
    doc.rect(tableX, taxTableTop, leftWidth, taxHeaderH).fill(GREY).stroke(BORDER);
    doc.fillColor(BORDER).font('Body-Bold').fontSize(6.5);

    let hx = tableX;
    // HSN/SAC — merged, vertically centered.
    doc.text('HSN/ SAC', hx + 2, taxTableTop + taxHeaderH / 2 - 3, { width: hsnW - 4, align: 'center' });
    hx += hsnW;
    doc.moveTo(hx, taxTableTop).lineTo(hx, taxTableTop + taxHeaderH).stroke(BORDER);

    // Taxable amount (₹) — merged, two lines, vertically centered.
    doc.text('Taxable amount', hx + 2, taxTableTop + 4, { width: taxableW - 4, align: 'center' });
    doc.text('(₹)', hx + 2, taxTableTop + 14, { width: taxableW - 4, align: 'center' });
    hx += taxableW;
    doc.moveTo(hx, taxTableTop).lineTo(hx, taxTableTop + taxHeaderH).stroke(BORDER);

    // CGST/SGST or IGST spanning groups.
    for (const group of spanGroups) {
      doc.font('Body-Bold').fontSize(7);
      doc.text(group.label, hx, taxTableTop + 3, { width: group.width, align: 'center' });
      // Horizontal divider under the group label, only within this group's width.
      doc.moveTo(hx, taxTableTop + taxRow1H).lineTo(hx + group.width, taxTableTop + taxRow1H).stroke(BORDER);
      // Sub-headers.
      doc.font('Body-Bold').fontSize(6);
      doc.text('Rate (%)', hx + 1, taxTableTop + taxRow1H + 4, { width: group.subWidths[0] - 2, align: 'center' });
      doc.text('Amt (₹)', hx + group.subWidths[0] + 1, taxTableTop + taxRow1H + 4, { width: group.subWidths[1] - 2, align: 'center' });
      // Vertical divider between the group's two sub-columns (row 2 only).
      doc.moveTo(hx + group.subWidths[0], taxTableTop + taxRow1H).lineTo(hx + group.subWidths[0], taxTableTop + taxHeaderH).stroke(BORDER);
      hx += group.width;
      doc.moveTo(hx, taxTableTop).lineTo(hx, taxTableTop + taxHeaderH).stroke(BORDER);
    }

    // Total Tax(₹) — merged, vertically centered.
    doc.font('Body-Bold').fontSize(6.5);
    doc.text('Total Tax(₹)', hx + 2, taxTableTop + taxHeaderH / 2 - 3, { width: totalTaxW - 4, align: 'center' });

    // Column x-offsets for data rows, matching the header widths exactly.
    const dataColWidths = [hsnW, taxableW, ...spanGroups.flatMap((g) => g.subWidths), totalTaxW];

    let ty = taxTableTop + taxHeaderH;
    doc.font('Body').fontSize(7);
    let grandTaxable = 0;
    let grandCgst = 0;
    let grandSgst = 0;
    let grandIgst = 0;
    let grandTax = 0;
    for (const [hsn, g] of groups) {
      doc.rect(tableX, ty, leftWidth, taxRowH).stroke(BORDER);
      let tx = tableX;
      const taxableAmt = g.taxable;
      const cells: string[] = [hsn, rupee(taxableAmt)];
      if (isInterState) {
        const igstRate = taxableAmt > 0 ? (g.igst / taxableAmt) * 100 : 0;
        cells.push(`${igstRate.toFixed(1)}`, rupee(g.igst));
      } else {
        const cgstRate = taxableAmt > 0 ? (g.cgst / taxableAmt) * 100 : 0;
        const sgstRate = taxableAmt > 0 ? (g.sgst / taxableAmt) * 100 : 0;
        cells.push(`${cgstRate.toFixed(1)}`, rupee(g.cgst), `${sgstRate.toFixed(1)}`, rupee(g.sgst));
      }
      cells.push(rupee(g.total));
      for (let c = 0; c < cells.length; c++) {
        doc.text(cells[c], tx + 2, ty + 4, { width: dataColWidths[c] - 4, height: 9, ellipsis: true, align: c === 0 ? 'left' : 'right' });
        tx += dataColWidths[c];
      }
      ty += taxRowH;
      grandTaxable += g.taxable;
      grandCgst += g.cgst;
      grandSgst += g.sgst;
      grandIgst += g.igst;
      grandTax += g.total;
    }
    doc.rect(tableX, ty, leftWidth, taxRowH).fill('#f8f8f8').stroke(BORDER);
    doc.font('Body-Bold').fontSize(7);
    {
      let tx = tableX;
      const totalCells = isInterState
        ? ['TOTAL', rupee(grandTaxable), '', rupee(grandIgst), rupee(grandTax)]
        : ['TOTAL', rupee(grandTaxable), '', rupee(grandCgst), '', rupee(grandSgst), rupee(grandTax)];
      for (let c = 0; c < totalCells.length; c++) {
        doc.text(totalCells[c], tx + 2, ty + 4, { width: dataColWidths[c] - 4, height: 9, ellipsis: true, align: c === 0 ? 'left' : 'right' });
        tx += dataColWidths[c];
      }
    }
    ty += taxRowH;

    // Right-side summary box (no borders, "Label : Value" rows, value
    // right-aligned). Row pitch (15.75pt for the first three, 15pt for the
    // last three) matches the reference's measured line spacing exactly —
    // it isn't a single round constant there either.
    // labelW=93 matches the reference's measured colon position (x≈499.8,
    // rightX≈406.3) — the earlier leftWidth fix changed rightX enough that
    // the old labelW=110 (sized for the old, wrong rightX) would have left
    // too little room for the value column against the new, wider rightWidth.
    const labelW = 93;
    function summaryRow(label: string, value: string, opts?: { bold?: boolean; size?: number }) {
      const size = opts?.size ?? 8.5;
      doc.font(opts?.bold ? 'Body-Bold' : 'Body').fontSize(size).fillColor(BORDER);
      doc.text(label, rightX, ry, { width: labelW });
      doc.text(':', rightX + labelW, ry, { width: 10 });
      doc.text(value, rightX + labelW + 9, ry, { width: rightWidth - labelW - 9, align: 'right' });
    }

    let ry = rightBoxTop;
    summaryRow('Sub Total', rupee(data.subtotal));
    ry += 15.75;
    summaryRow('Total', rupee(data.totalAmount), { bold: true, size: 9.5 });
    ry += 15.75;
    doc.font('Body-Bold').fontSize(7.5).fillColor(BORDER).text('Invoice Amount In Words :', rightX, ry, { width: rightWidth });
    ry += 15.75;
    doc.font('Body').fontSize(7.5).text(amountInWords(data.totalAmount), rightX, ry, { width: rightWidth, height: 24 });
    ry += 25.5;
    summaryRow('Received', rupee(data.paidAmount));
    ry += 15;
    summaryRow('Balance', rupee(data.balanceAmount), { bold: true });
    ry += 15;
    summaryRow('Previous Balance', rupee(data.previousBalance));
    ry += 15;
    summaryRow('Current Balance', rupee(data.currentBalance));
    // Deliberately NOT another "+= 15" here — every increment above moves
    // ry to the top of the row that follows, but there is no row after
    // Current Balance. Advancing by the same row pitch anyway (as an
    // earlier pass did) left ry pointing ~18pt past the last visible text,
    // which pushed Terms And Conditions down by that same amount — this
    // was the actual bug behind the growing gap the user found by
    // overlaying the two PDFs, not accumulated rounding drift. +10 covers
    // this row's own text height, matching where its bottom actually sits.
    ry += 10;

    // Reference invoice leaves the tax-summary table bordered down to the
    // same bottom edge as the right-side summary box, even though the table
    // itself has no more data rows there — an empty bordered cell, not a
    // gap. Reproduce it so the two blocks end flush.
    const sectionBottom = Math.max(ty, ry);
    if (sectionBottom > ty) {
      doc.rect(tableX, ty, leftWidth, sectionBottom - ty).stroke(BORDER);
    }

    y = sectionBottom + 7;

    // ── 6. Terms And Conditions row (full width — no separate Description
    // column any more; the sales-agent note moved into the item table, §4) ──
    ensureSpace(33);
    const termsRowH = 33;
    doc.rect(tableX, y, CONTENT_WIDTH, termsRowH).stroke(BORDER);
    doc.rect(tableX, y, CONTENT_WIDTH, 17).fill(GREY);
    doc.fillColor(BORDER).font('Body-Bold').fontSize(8);
    doc.text('Terms And Conditions:', tableX + 2, y + 4);
    doc.font('Body').fontSize(8);
    doc.text(sanitize(data.termsAndConditions) || '-', tableX + 2, y + 21, { width: CONTENT_WIDTH - 6, height: 11, ellipsis: true });
    y += termsRowH;
    // No gap here — in the reference, the Terms row's bottom border and the
    // Bank Details row's top border are the same line (adjacent boxes).

    // ── 7. Bank Details / Signature row ──────────────────────────────────
    ensureSpace(80);
    const bsRowH = 80;
    doc.rect(tableX, y, colWidth, bsRowH).stroke(BORDER);
    doc.rect(tableX + colWidth, y, colWidth, bsRowH).stroke(BORDER);
    doc.rect(tableX, y, colWidth, 17).fill(GREY);
    doc.rect(tableX + colWidth, y, colWidth, 17).fill(GREY);
    doc.fillColor(BORDER).font('Body-Bold').fontSize(8);
    doc.text('Bank Details:', tableX + 2, y + 4);
    doc.text(`For ${sanitize(data.company.companyName) || 'Company'}:`, tableX + colWidth + 6, y + 4);

    doc.font('Body').fontSize(8);
    doc.text('Name:', tableX + 2, y + 21, { continued: true });
    doc.font('Body-Bold').text(` ${sanitize(data.company.bankName) || '-'}`);
    doc.font('Body').text('Account No.:', tableX + 2, y + 32, { continued: true });
    doc.font('Body-Bold').text(` ${sanitize(data.company.bankAccountNumber) || '-'}`);
    doc.font('Body').text('IFSC code:', tableX + 2, y + 44, { continued: true });
    doc.font('Body-Bold').text(` ${sanitize(data.company.bankIfsc) || '-'}`);
    doc.font('Body').text("Account Holder's Name:", tableX + 2, y + 56, { continued: true });
    doc.font('Body-Bold').text(` ${sanitize(data.company.bankAccountHolderName) || '-'}`);

    // Signature size/position, like the logo above, read directly off the
    // reference PDF's content stream transform matrix rather than
    // eyeballed — reference places it 85.5wide x 44.25 tall, top edge at
    // rowTop+21 (nearly touching the "Authorized Signatory" caption below
    // it, same as the reference). It's also horizontally centered under
    // "For <Company>:" — an earlier pass fixed the image at a left-shifted
    // x offset while the caption was centered, which visibly misaligned
    // the two; centering keeps both aligned regardless of column width.
    const sigW = 85.5;
    const sigH = 44.25;
    const sigX = tableX + colWidth + (colWidth - sigW) / 2;
    const sigBuf = dataUrlToBuffer(data.company.signatureUrl);
    if (sigBuf) {
      try {
        doc.image(sigBuf, sigX, y + 21, { width: sigW, height: sigH, fit: [sigW, sigH] });
      } catch {
        // ignore corrupt signature image
      }
    }
    doc.font('Body').fontSize(8).fillColor(BORDER).text('Authorized Signatory', tableX + colWidth + 6, y + 66, { width: colWidth - 12, align: 'center' });

    y += bsRowH;

    // Outer box around the whole document body (drawn last so it sits on
    // top of the section borders visually, matching the reference layout).
    // Only meaningful when boxTop and the current y are on the same page —
    // see the pageBroke comment above.
    if (!pageBroke) {
      doc.rect(PAGE_MARGIN, boxTop, CONTENT_WIDTH, y - boxTop).stroke(BORDER);
    }

    doc.end();
  });
}
