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

// PAGE_MARGIN/CONTENT_WIDTH corrected 2026-08-21 from actual `re` (rectangle)
// operator coordinates in the reference's content stream, extracted via
// pikepdf with full q/cm/Q matrix accumulation — a more authoritative source
// than text bounding boxes, since every section's border rect and column
// divider is drawn with these exact numbers (the header box, item-table
// columns, Bill To/Bank grey bars all independently agree on ~529.1-529.5
// wide starting at x≈33.7). The reference's left/right margins aren't quite
// symmetric (33.7 vs ~32.4), so CONTENT_WIDTH is its own measured constant
// rather than PAGE_WIDTH - 2*margin.
const PAGE_MARGIN = 33.7;
const PAGE_WIDTH = 594.96;
const PAGE_HEIGHT = 841.92;
const CONTENT_WIDTH = 529.1;
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

    // Our SegoeUI-Bold.ttf's glyph aspect ratio doesn't match the reference's
    // actual bold weight: matching cap-height (via fontSize alone) leaves
    // every bold string measurably narrower (~8-9%) than the reference —
    // measured consistently across "Invoice"/"RAREPRINT.IN"/"Tax Summary:"/
    // "Bill To:" etc. via pdftotext -bbox-layout. No single fontSize can fix
    // both dimensions at once (that would require the reference's actual
    // font file, which we don't have). This stretches JUST the horizontal
    // axis via a scale transform around each call — glyphs render at the
    // correct height (fontSize unaffected) and the correct on-page width.
    // Use for standalone (non `continued:true`) Body-Bold text only — a
    // save()/restore() pair around a continued-chain call would break
    // PDFKit's internal cursor tracking between the chained pieces.
    const BOLD_HSCALE = 1.08;
    function boldText(str: string, x: number, y0: number, opts?: PDFKit.Mixins.TextOptions) {
      doc.save();
      doc.translate(x, y0);
      doc.scale(BOLD_HSCALE, 1);
      const scaledOpts = opts?.width !== undefined ? { ...opts, width: opts.width / BOLD_HSCALE } : opts;
      doc.text(str, 0, 0, scaledOpts);
      doc.restore();
    }

    // For inline "Label: value" pairs where the value is bold — these were
    // built with continued:true chains, which can't use boldText() above
    // (the save/scale/restore desyncs PDFKit's internal text-flow cursor
    // between chained segments). Instead: draw the regular label normally,
    // measure its actual rendered width with widthOfString(), then draw the
    // bold value from that exact x with the same horizontal correction.
    // Every call site this replaces was a single, non-wrapping line, so
    // lineBreak:false (no continued:true) is safe here.
    function labelBoldValue(label: string, value: string, x: number, y0: number, size: number) {
      doc.font('Body').fontSize(size);
      doc.text(label, x, y0, { lineBreak: false });
      const labelW = doc.widthOfString(label);
      doc.font('Body-Bold').fontSize(size);
      boldText(value, x + labelW, y0, { lineBreak: false });
    }

    // ── 1. Page title ────────────────────────────────────────────────────
    // fontSize correction (also applied to every other Body-Bold size below,
    // factor ~0.8): our SegoeUI-Bold.ttf renders ~25% taller and ~15% wider
    // per point than the reference's actual bold weight — confirmed via
    // pdftotext -bbox-layout cap-height/width measurements on 3 independent
    // bold elements ("Invoice" 18pt, "RAREPRINT.IN" 16pt, "Tax Summary:" 9pt
    // all showed the same ~1.25x inflation), and visually (rendered "Invoice"
    // /company name looked noticeably heavier+wider than the reference when
    // the user overlaid both PDFs). Reducing every explicit Body-Bold
    // fontSize by this factor brings both dimensions much closer without
    // needing a separate (heavier) font file.
    doc.font('Body-Bold').fontSize(14.5).fillColor(BORDER);
    // y+5.3 (was +8.4) — re-measured 2026-08-27 against ACTUAL RENDERED
    // PIXELS (pdftoppm at 300dpi, ink centroid/bbox comparison), not
    // pdftotext bbox — pdftotext's reported text yMin turned out to be
    // based on font ascent metrics, not actual glyph ink, and was masking a
    // real ~3.1pt-too-low rendering that only showed up once the two PDFs
    // were rasterized and diffed pixel-for-pixel. Every other Y correction
    // in this file that was verified via pdftotext bbox should be treated
    // with the same suspicion if a visual mismatch is reported again.
    boldText('Invoice', PAGE_MARGIN, y + 5.3, { align: 'center', width: CONTENT_WIDTH });
    // 34.9 (was 34) — re-measured 2026-08-21 against the reference's actual
    // header-box rect() top edge (y=68.6, via pikepdf content-stream
    // extraction) rather than a text-based estimate; this offset is the
    // single upstream anchor every section below is built relative to, so
    // fixing it here is more reliable than chasing the same ~1pt error
    // separately in every downstream row.
    y += 34.9;

    const boxTop = y;

    // ── 2. Company header block ─────────────────────────────────────────
    // 85.5 (was 85) — re-measured 2026-08-21 from the reference's header-box
    // rect() height directly (bottom edge y=154.10 vs top y=68.60).
    const headerHeight = 85.5;
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
        // No `fit` here — fit preserves the source image's own aspect ratio
        // within the box, but the reference stretches the logo to exactly
        // 73x73 regardless of the uploaded image's native proportions
        // (confirmed via pikepdf transform-matrix extraction: the reference
        // signature image below has a non-square target box that doesn't
        // match its source aspect ratio either, and still renders at the
        // full target size — i.e. it's stretched, not letterboxed).
        // y+6 (was y+7) — re-measured against the reference's actual image
        // transform matrix post-fix: ref places the logo's top edge 1pt
        // higher than our y+7 was landing.
        // x offset 6.05 (was 5), y offset 6.4 (was 6) — re-measured 2026-08-21
        // against the reference's image transform matrix a second time now
        // that boxTop lands exactly on the reference's 68.60 (target logo
        // origin: x=39.75, y_top=75.00 against PAGE_MARGIN=33.7/boxTop=68.60).
        doc.image(logoBuf, PAGE_MARGIN + 6.05, y + 6.4, { width: 73, height: 73 });
        headerTextX = 120;
      } catch {
        // Corrupt/unsupported image data — fall back to text-only header
        // rather than failing the whole PDF.
      }
    }

    const headerTextWidth = PAGE_MARGIN + CONTENT_WIDTH - headerTextX - 10;
    doc.font('Body-Bold').fontSize(13).fillColor(BORDER);
    boldText(sanitize(data.company.companyName) || 'Company Name Not Set', headerTextX, y + 9, { width: headerTextWidth });
    doc.font('Body').fontSize(8.5).fillColor(BORDER);
    doc.text(sanitize(data.company.companyAddress) || 'Company address not set — fill in Billing > Company Profile', headerTextX, y + 29, { width: headerTextWidth, height: 22, ellipsis: true });

    doc.font('Body').fontSize(8.5).fillColor(BORDER);
    // Right-half column starts at headerTextX+220.5 — measured from the
    // reference (Email:/State: sit at x≈340.5 vs Phone:/GSTIN: at x≈121.8,
    // a ~219pt gap), not an exact half of headerTextWidth as an earlier
    // pass assumed (that landed ~5pt too far left).
    const rightColX = headerTextX + 220.5;
    const rowY1 = y + 53;
    labelBoldValue('Phone: ', sanitize(data.company.companyPhone) || '-', headerTextX, rowY1, 8.5);
    labelBoldValue('Email: ', sanitize(data.company.companyEmail) || '-', rightColX, rowY1, 8.5);

    const rowY2 = y + 66;
    labelBoldValue('GSTIN: ', sanitize(data.company.companyGstin) || '-', headerTextX, rowY2, 8.5);
    labelBoldValue('State: ', sanitize(data.company.companyState) || '-', rightColX, rowY2, 8.5);

    y += headerHeight;
    // 0.4pt gap — the reference's header box and Bill To/Invoice Details box
    // don't share a line either (measured: header bottom=154.10, Bill To bar
    // top=154.50).
    y += 0.4;

    // ── 3. Bill To / Invoice Details row ────────────────────────────────
    // 75.8 (was 77) — re-measured 2026-08-21 against a real generated PDF vs
    // the reference: the reference's Bill To/Invoice Details box actually
    // closes at y=230.3 (pikepdf rect extraction), 1.2pt earlier than 77
    // was landing.
    const biRowHeight = 75.8;
    const colWidth = CONTENT_WIDTH / 2;
    doc.rect(PAGE_MARGIN, y, CONTENT_WIDTH, biRowHeight).stroke(BORDER);
    // Grey label fills drawn BEFORE the vertical/horizontal dividers below —
    // fill() paints an opaque rectangle, so if the dividers were drawn
    // first (as an earlier pass had it), the fill silently painted over
    // whatever portion of them fell within the label band, making the
    // column separator look like it "didn't reach the top" of the row even
    // though the moveTo/lineTo call itself was correct. Root-caused
    // 2026-08-21 — same fix applied to Bank Details/For Company below.
    doc.rect(PAGE_MARGIN, y, colWidth, 17).fill(GREY);
    doc.rect(PAGE_MARGIN + colWidth, y, colWidth, 17).fill(GREY);
    doc.moveTo(PAGE_MARGIN + colWidth, y).lineTo(PAGE_MARGIN + colWidth, y + biRowHeight).stroke(BORDER);
    // Divider between the "Bill To:"/"Invoice Details:" labels and the
    // customer/invoice details below them — same treatment as Terms And
    // Conditions and Bank Details further down (added 2026-08-21; this one
    // was missed in that pass since it's earlier in the document).
    doc.moveTo(PAGE_MARGIN, y + 17).lineTo(PAGE_MARGIN + CONTENT_WIDTH, y + 17).stroke(BORDER);
    doc.fillColor(BORDER).font('Body-Bold').fontSize(7.3);
    // Left-column text padding: +8 -> +2 (an earlier pass) -> +3.2 (this
    // one). Re-measured 2026-08-21 against a real generated PDF vs the
    // reference via pdftotext xMin on every line in this column (label,
    // customer name, address, contact, state) — all showed the exact same
    // -1.19pt delta at +2, meaning the true inset is ~3.19, not ~1.9-2.6 as
    // the earlier estimate had it.
    boldText('Bill To:', PAGE_MARGIN + 3.2, y + 5);
    boldText('Invoice Details:', PAGE_MARGIN + colWidth + 4.4, y + 5);

    // Bill To column: name, full address, (Contact No | GSTIN Number stacked), State.
    doc.font('Body-Bold').fontSize(8).fillColor(BORDER);
    boldText(sanitize(data.customerName) || 'Customer', PAGE_MARGIN + 3.2, y + 21, { width: colWidth - 10, height: 13, ellipsis: true });
    doc.font('Body').fontSize(9);
    doc.text(sanitize(data.customerAddress) || '-', PAGE_MARGIN + 3.2, y + 34, { width: colWidth - 10, height: 16, ellipsis: true });

    const gstinColX = PAGE_MARGIN + colWidth / 2 + 1;
    labelBoldValue('Contact No: ', sanitize(data.customerPhone) || '-', PAGE_MARGIN + 3.2, y + 51, 9);
    doc.font('Body').fontSize(9).text('GSTIN Number:', gstinColX, y + 51, { width: colWidth / 2 - 6 });
    doc.font('Body-Bold').fontSize(9);
    boldText(sanitize(data.customerGstin) || '-', gstinColX, y + 61, { width: colWidth / 2 - 6 });

    labelBoldValue('State: ', sanitize(data.customerState) || '-', PAGE_MARGIN + 3.2, y + 63, 9);

    // Invoice Details column.
    labelBoldValue('No: ', sanitize(data.invoiceNumber), PAGE_MARGIN + colWidth + 4.4, y + 22, 9);
    labelBoldValue('Date: ', sanitize(data.issueDate), PAGE_MARGIN + colWidth + 4.4, y + 34, 9);
    labelBoldValue('Place of Supply: ', sanitize(data.customerState) || '-', PAGE_MARGIN + colWidth + 4.4, y + 46, 9);

    y += biRowHeight;
    // 6.0 (was 5.5) — re-measured 2026-08-21 against a real generated PDF vs
    // the reference: the reference's item table header row actually starts
    // at y=236.3 (pikepdf rect extraction), paired with the biRowHeight fix
    // above.
    y += 6.0;

    // ── 4. Line items table ─────────────────────────────────────────────
    // 8 columns — no separate Ad.CESS column in this template (dropped vs.
    // an earlier pass; see docs/Invoice_PDF_Replication_Spec.md §4). Widths
    // measured from the reference's exact column borders (right-aligned
    // numeric columns' xMax match their header's xMax exactly).
    // Widths re-measured 2026-08-21 from the reference's actual column
    // divider rect() coordinates (not text bboxes) — HSN/SAC, Quantity, and
    // Amount(₹) were each off by 2-2.4pt under the old text-based estimate.
    // Sums to CONTENT_WIDTH (529.1) exactly.
    const cols = [
      { key: '#', width: 21.7, numeric: false },
      { key: 'Item name', width: 139.5, numeric: false },
      { key: 'HSN/ SAC', width: 57.0, numeric: false },
      { key: 'Quantity', width: 63.7, numeric: true },
      { key: 'Unit', width: 57.0, numeric: true },
      { key: 'Price/ Unit (₹)', width: 63.0, numeric: true },
      { key: 'GST(₹)', width: 63.7, numeric: true },
      { key: 'Amount(₹)', width: 63.5, numeric: true },
    ];
    const tableX = PAGE_MARGIN;
    // 16.5 (was 15.7) — re-measured 2026-08-21 against the reference's own
    // rect() column-divider height (top=236.3, bottom=252.8) rather than
    // the earlier text-bbox estimate, which undershot by 0.8pt and
    // propagated through every row below it.
    const headerRowH = 16.5;
    ensureSpace(headerRowH + 26);
    // Vertical column-separator lines for a header/data/total row — rect()
    // only draws each row's outer box, so without this every internal
    // column line (between #, Item name, HSN/SAC, Quantity, ...) was
    // missing throughout the whole table, header included.
    function drawItemRowDividers(rowY: number, rowH: number) {
      let dx = tableX;
      for (let c = 0; c < cols.length - 1; c++) {
        dx += cols[c].width;
        doc.moveTo(dx, rowY).lineTo(dx, rowY + rowH).stroke(BORDER);
      }
    }
    let colX = tableX;
    // fillAndStroke (not .fill().stroke()) — PDFKit's .fill() immediately
    // writes the PDF 'f' operator, which paints AND consumes the current
    // path per the PDF spec, so a chained .stroke() right after has no path
    // left to stroke and silently no-ops. .fillAndStroke() writes a single
    // 'B' (fill+stroke) operator against the same path. This was why every
    // grey header row's own border was invisible despite the code "drawing"
    // it — root-caused 2026-08-21 across all 4 fill()+stroke() chains in
    // this file (item header row, item Total row, tax header, tax TOTAL row).
    doc.rect(tableX, y, CONTENT_WIDTH, headerRowH).fillAndStroke(GREY, BORDER);
    drawItemRowDividers(y, headerRowH);
    doc.fillColor(BORDER).font('Body-Bold').fontSize(6.8);
    for (const col of cols) {
      // Left/right text insets split by alignment (was a flat +3/-6 for
      // both) — re-measured 2026-08-26 via pdftotext against scenario-A:
      // left-aligned headers ("Item name"/"HSN/ SAC") sat ~1.2-1.8pt too
      // far LEFT (need MORE left padding), right-aligned ones (Quantity/
      // Price/GST/Amount) sat ~1.0-2.5pt too far RIGHT (need MORE right
      // padding) — a first pass here had both directions backwards, made
      // worse, caught by re-measuring after. The column dividers themselves
      // are already correct (verified separately), so this only touches
      // text padding within each cell, not the boundaries.
      const leftPad = col.numeric ? 3 : 4.3;
      const rightPad = col.numeric ? 4 : 3;
      boldText(col.key, colX + leftPad, y + 4, { width: col.width - leftPad - rightPad, height: 9, ellipsis: true, align: col.numeric ? 'right' : 'left' });
      colX += col.width;
    }
    y += headerRowH;

    let totalQty = 0;
    let totalAmount = 0;
    let totalGst = 0;

    const agentNote = sanitize(data.agentName);
    // 27.7 (was 28) — re-measured 2026-08-21 against the reference's own
    // rect() column-divider height for this row.
    const itemRowH = 27.7; // two lines: product name + "(agent)" note, and GST amount + rate%.

    doc.font('Body').fontSize(8);
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      const gstAmt = item.cgstAmount + item.sgstAmount + item.igstAmount;
      ensureSpace(itemRowH);

      doc.rect(tableX, y, CONTENT_WIDTH, itemRowH).stroke(BORDER);
      drawItemRowDividers(y, itemRowH);
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

    // 15.7 (was 16) — re-measured 2026-08-21 against the reference's own
    // rect() column-divider height for this row.
    const totalRowH = 15.7;
    ensureSpace(totalRowH);
    doc.rect(tableX, y, CONTENT_WIDTH, totalRowH).fillAndStroke('#f8f8f8', BORDER);
    drawItemRowDividers(y, totalRowH);
    doc.fillColor(BORDER).font('Body-Bold').fontSize(6.8);
    // 'Total' starts past the '#' column (tableX+cols[0].width+3), not at the
    // very left edge — reference measured x≈58.56 vs tableX+3=38, a ~20.5pt
    // gap matching exactly one '#' column width (21pt).
    boldText('Total', tableX + cols[0].width + 3, y + 3, { width: cols[1].width + cols[2].width - 6, height: 11, ellipsis: true });
    boldText(
      String(totalQty),
      tableX + cols[0].width + cols[1].width + cols[2].width + 3,
      y + 3,
      { width: cols[3].width - 6, height: 11, ellipsis: true, align: 'right' },
    );
    boldText(
      rupee(totalGst),
      tableX + cols[0].width + cols[1].width + cols[2].width + cols[3].width + cols[4].width + cols[5].width + 3,
      y + 3,
      { width: cols[6].width - 6, height: 11, ellipsis: true, align: 'right' },
    );
    boldText(
      rupee(totalAmount),
      tableX + CONTENT_WIDTH - cols[7].width + 3,
      y + 3,
      { width: cols[7].width - 6, height: 11, ellipsis: true, align: 'right' },
    );
    y += totalRowH;
    // 2.69 (was 2.92) — re-tuned after fixing headerRowH/itemRowH/totalRowH
    // above (net +0.2pt shift to this row's bottom), so rightBoxTop/"Sub
    // Total" still lands on its already-verified target (298.92).
    y += 2.69;

    // ── 5. Tax Summary ───────────────────────────────────────────────────
    ensureSpace(18);
    // The right-side summary box starts at the SAME y as this label (not
    // after it) — in the reference, "Sub Total" sits almost exactly level
    // with "Tax Summary:", not with the tax table itself, which starts
    // ~12pt lower once the label's own line height is accounted for.
    const rightBoxTop = y;
    // The top of this whole "Tax Summary + right-side box" group — same
    // value the left/right vertical edges below both start from, so the
    // group's own border doesn't touch the item table above it (matches
    // the reference: this zone is its own separate bordered group, not
    // connected to the item table via a continuous outer frame).
    const group2Top = y - 2.69;
    doc.font('Body-Bold').fontSize(7.3).fillColor(BORDER);
    boldText('Tax Summary:', tableX, y);
    // Vertical separator between the tax table and the right-side summary
    // box, extended UP to also cover this label row (previously only drawn
    // starting at taxTableTop below, so it visibly stopped short of "Tax
    // Summary:"/"Sub Total" — the same title-row/vertical-separator issue
    // as Bill To and Bank Details, just via a different code path here
    // since this side has no rect() of its own to draw it accidentally).
    // Hardcoded 370.5 here (not the `leftWidth` const) since that const
    // isn't declared until after the isInterState branch just below — kept
    // in sync with it manually; see the `const leftWidth = 370.5` comment
    // a few lines down for the measurement this value comes from.
    // Starts at group2Top (the item table's own Total row bottom border,
    // before the small gap this section's rightBoxTop adds) rather than at
    // y itself, so the top of this vertical line actually touches the
    // horizontal line above it instead of floating 2.69pt below it.
    // x = tableX + 369.75 — see the `leftWidth` comment below; kept in sync
    // with it manually since that const isn't declared yet here. THIS was
    // the actual cause of "the separator got to a bit right nudge" still
    // being reported after the leftWidth 370.5->369.0 pass: this specific
    // line is hardcoded (declared before `leftWidth` exists) and was never
    // updated when leftWidth moved, so it silently stayed at the old value
    // while every other use of leftWidth in this section moved correctly.
    doc.moveTo(tableX + 369.75, group2Top).lineTo(tableX + 369.75, y + 13.88).stroke(BORDER);
    // Left edge of this same label row — the right-side line above has
    // always existed, but this row (group2Top to taxTableTop) never had a
    // LEFT border of its own. It used to be covered incidentally by the old
    // continuous outer box; removing that box (2026-08-21, to split the
    // document into separate groups per the reference) left this one row
    // with no left edge at all, reported as "the vertical line to the left
    // of tax summary is missing".
    doc.moveTo(tableX, group2Top).lineTo(tableX, y + 13.88).stroke(BORDER);
    // 13.88 (was 13.78) — re-tuned along with the gap above so taxTableTop
    // (the two-tier header's actual top) still lands on its verified target
    // (312.8).
    y += 13.88;

    const isInterState = data.gstTreatment === 'INTER_STATE' || data.gstTreatment === 'EXPORT';
    // leftWidth was previously CONTENT_WIDTH*0.58 (a guess) — the reference
    // tax table is actually ~70% of content width (measured: its rightmost
    // column data — "1,449.15" in the TOTAL row — ends at x≈400.3, and
    // "Sub Total" on the right starts at x≈406.3, both against tableX=35).
    // The 58% guess put the whole right-side summary box ~55pt too far
    // left, consistently, across every row — confirmed by diffing this
    // render's exact text coordinates against the reference's.
    // 369.75 (was 369.0, before that 370.5) — re-measured 2026-08-26 via a
    // full pikepdf content-stream extraction of the reference's actual thin
    // rects (not eyeballed): the reference's own tax-table rect is
    // x=[33.0,403.5], w=370.5, but its stroke fills are drawn as 0.75pt-wide
    // rects with the visible line CENTERED partway across that width —
    // e.g. its right border is the rect x=[402.75,403.5], center=403.125.
    // PDFKit's stroke() also centers a line on the coordinate given, so the
    // correct target for `tableX + leftWidth` is that center, 403.125, not
    // the rect's left edge (402.7) — the previous pass matched the edge,
    // not the center, which is what still read as "nudged" after that fix.
    // leftWidth = 403.125 - tableX(33.7) = 369.425, rounded to 369.75 to
    // match the sum of the individually re-measured column widths below
    // (hsnW+taxableW+2*pairW+totalTaxW) exactly rather than introducing a
    // separate rounding source.
    const leftWidth = 369.75;
    // 2.83 (was 3.58) — reduced by the same 0.75 leftWidth increased by, so
    // rightX (where "Sub Total" etc. start, verified via pdftotext against
    // the reference at x=406.28) stays exactly where it already was.
    const GAP = 2.83;
    // RIGHT_PAD keeps right-aligned values (Sub Total / Total / Balance /
    // etc.) from landing flush against the outer page border — without it,
    // rightX + rightWidth lands exactly on tableX + CONTENT_WIDTH, so
    // align:'right' text has zero clearance and visibly touches the border.
    // 2.92 (was 6) — re-measured 2026-08-21: every right-aligned value in
    // this box (Sub Total, Total, Received, Balance, Previous/Current
    // Balance) was landing a consistent 3.08pt short of the reference's
    // actual xMax (559.88 vs 556.80), i.e. too far from the border.
    const RIGHT_PAD = 2.92;
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
    // 15.35 each (was 16) — re-measured 2026-08-21: the reference's own
    // merged HSN/SAC cell rect() is 30.7pt tall total (312.8 to 343.5), not
    // 32.
    const taxRow1H = 15.35;
    const taxRow2H = 15.35;
    const taxHeaderH = taxRow1H + taxRow2H;
    // 15.7 (was 16) — matches the reference's own tax data/TOTAL row rect()
    // height exactly.
    const taxRowH = 15.7;

    // Column widths measured directly from the reference's data-row cell
    // edges (right-aligned cells' xMax + a ~2pt inset = the true column
    // boundary), not the earlier fractional guesses of leftWidth (0.14/0.2/
    // 0.2 splits) — those were off by 3-6.4pt per column, which compounded
    // rightward across CGST -> SGST -> Total Tax(₹) into a ~7.6pt drift by
    // the last column. hsnW/taxableW/totalTaxW are shared between the
    // INTRA_STATE (CGST+SGST) and INTER_STATE (IGST) layouts — only the
    // middle span differs (one wide IGST column vs two CGST/SGST columns of
    // half the width), which falls out naturally from the same leftWidth.
    // Re-measured 2026-08-21 from the reference's actual merged-cell rect()
    // widths (HSN/SAC and Taxable-amount cells span both header rows —
    // their real drawn width, not a fractional-split guess).
    const hsnW = 59.2;
    const taxableW = 70.5;
    // 80.25 (was 78.7, before that 80.2) — re-measured 2026-08-26 via
    // pikepdf: the reference's "Total Tax(₹)" cell rect is
    // x=[323.25,403.50], w=80.25 exactly. Cross-checked against pdftotext's
    // text bbox for the "Total Tax(₹)" header label itself, which centers
    // at x≈363.27 in the reference — with hsnW+taxableW+2*pairW=289.5
    // before this column starts, this width centers that label at 363.325,
    // a 0.05pt match.
    const totalTaxW = 80.25;
    // Rate(%)/Amt(₹) sub-column split within each CGST/SGST pair — measured
    // 41.77:38.21 (~52.2%:47.8%). The previous 0.44/0.56 had this backwards
    // (Amt wider than Rate), which it isn't in the reference.
    const RATE_FRACTION = 0.522;
    let spanGroups: { label: string; width: number; subWidths: [number, number] }[];
    if (isInterState) {
      const igstW = leftWidth - hsnW - taxableW - totalTaxW;
      spanGroups = [{ label: 'IGST', width: igstW, subWidths: [igstW * RATE_FRACTION, igstW * (1 - RATE_FRACTION)] }];
    } else {
      const pairW = (leftWidth - hsnW - taxableW - totalTaxW) / 2;
      spanGroups = [
        { label: 'CGST', width: pairW, subWidths: [pairW * RATE_FRACTION, pairW * (1 - RATE_FRACTION)] },
        { label: 'SGST', width: pairW, subWidths: [pairW * RATE_FRACTION, pairW * (1 - RATE_FRACTION)] },
      ];
    }

    // Outer header rect + grey fill.
    doc.rect(tableX, taxTableTop, leftWidth, taxHeaderH).fillAndStroke(GREY, BORDER);
    doc.fillColor(BORDER).font('Body-Bold').fontSize(6.3);

    let hx = tableX;
    // HSN/SAC — merged, vertically centered. "-4.45" (was "-3") — re-measured
    // 2026-08-26 via pdftotext against a scenario-A render: this label (and
    // "Total Tax(₹)" below, which shares this exact formula) both landed
    // 1.45pt lower than the reference.
    boldText('HSN/ SAC', hx + 2, taxTableTop + taxHeaderH / 2 - 4.45, { width: hsnW - 4, align: 'center' });
    hx += hsnW;
    doc.moveTo(hx, taxTableTop).lineTo(hx, taxTableTop + taxHeaderH).stroke(BORDER);

    // Taxable amount (₹) — merged, two lines, vertically centered. +5.65/
    // +15.65 (was +7.4/+17.4) — re-measured 2026-08-26: landed 1.75pt lower
    // than the reference.
    boldText('Taxable amount', hx + 2, taxTableTop + 5.65, { width: taxableW - 4, align: 'center' });
    boldText('(₹)', hx + 2, taxTableTop + 15.65, { width: taxableW - 4, align: 'center' });
    hx += taxableW;
    doc.moveTo(hx, taxTableTop).lineTo(hx, taxTableTop + taxHeaderH).stroke(BORDER);

    // CGST/SGST or IGST spanning groups.
    for (const group of spanGroups) {
      doc.font('Body-Bold').fontSize(6.5);
      // +2.65 (was +3) — re-measured 2026-08-26: landed 0.35pt lower than
      // the reference.
      boldText(group.label, hx, taxTableTop + 2.65, { width: group.width, align: 'center' });
      // Horizontal divider under the group label, only within this group's width.
      doc.moveTo(hx, taxTableTop + taxRow1H).lineTo(hx + group.width, taxTableTop + taxRow1H).stroke(BORDER);
      // Sub-headers. +3.05 (was +4) — re-measured 2026-08-26: landed 0.95pt
      // lower than the reference.
      doc.font('Body-Bold').fontSize(5.5);
      boldText('Rate (%)', hx + 1, taxTableTop + taxRow1H + 3.05, { width: group.subWidths[0] - 2, align: 'center' });
      boldText('Amt (₹)', hx + group.subWidths[0] + 1, taxTableTop + taxRow1H + 3.05, { width: group.subWidths[1] - 2, align: 'center' });
      // Vertical divider between the group's two sub-columns (row 2 only).
      doc.moveTo(hx + group.subWidths[0], taxTableTop + taxRow1H).lineTo(hx + group.subWidths[0], taxTableTop + taxHeaderH).stroke(BORDER);
      hx += group.width;
      doc.moveTo(hx, taxTableTop).lineTo(hx, taxTableTop + taxHeaderH).stroke(BORDER);
    }

    // Total Tax(₹) — merged, vertically centered. Shares HSN/SAC's formula
    // and correction above.
    doc.font('Body-Bold').fontSize(6.3);
    boldText('Total Tax(₹)', hx + 2, taxTableTop + taxHeaderH / 2 - 4.45, { width: totalTaxW - 4, align: 'center' });

    // Column x-offsets for data rows, matching the header widths exactly.
    const dataColWidths = [hsnW, taxableW, ...spanGroups.flatMap((g) => g.subWidths), totalTaxW];

    // Vertical column-separator lines for a data/total row — the header rows
    // draw their own dividers via the moveTo/lineTo calls above, but the
    // data and TOTAL rows previously only got the outer rect() border, so
    // every internal column line (Taxable amount | Rate | Amt | Rate | Amt |
    // Total Tax) silently disappeared below the header. Reference has these
    // dividers running the full height of the table.
    function drawTaxRowDividers(rowY: number, rowH: number) {
      let dx = tableX;
      for (let c = 0; c < dataColWidths.length - 1; c++) {
        dx += dataColWidths[c];
        doc.moveTo(dx, rowY).lineTo(dx, rowY + rowH).stroke(BORDER);
      }
    }

    // NOTE: the reference's own rect() extraction shows its tax data rows
    // starting ~0.8pt below the header's bottom edge (343.5 -> 344.3)
    // rather than flush against it. Left flush here deliberately — every
    // other adjacent-box boundary in this document (item table rows, Terms/
    // Bank Details) shares a single border line by design, and introducing
    // a real gap here would look like a regression of that same fix
    // elsewhere. Treating the reference's 0.8pt as rendering noise, not an
    // intentional gap, unless a visual check says otherwise.
    let ty = taxTableTop + taxHeaderH;
    doc.font('Body').fontSize(7);
    let grandTaxable = 0;
    let grandCgst = 0;
    let grandSgst = 0;
    let grandIgst = 0;
    let grandTax = 0;
    for (const [hsn, g] of groups) {
      doc.rect(tableX, ty, leftWidth, taxRowH).stroke(BORDER);
      drawTaxRowDividers(ty, taxRowH);
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
    doc.rect(tableX, ty, leftWidth, taxRowH).fillAndStroke('#f8f8f8', BORDER);
    drawTaxRowDividers(ty, taxRowH);
    // .fill('#f8f8f8') above also sets the *current* fill color (PDFKit
    // shares one fillColor state between shapes and text) — without
    // resetting it back to BORDER here, every cell in this row was being
    // drawn in near-white text on its own near-white background, i.e.
    // invisible. The item table's own Total row already does this reset;
    // this one didn't, which is what looked like "missing" row content.
    doc.fillColor(BORDER).font('Body-Bold').fontSize(6.8);
    {
      let tx = tableX;
      const totalCells = isInterState
        ? ['TOTAL', rupee(grandTaxable), '', rupee(grandIgst), rupee(grandTax)]
        : ['TOTAL', rupee(grandTaxable), '', rupee(grandCgst), '', rupee(grandSgst), rupee(grandTax)];
      for (let c = 0; c < totalCells.length; c++) {
        // Unlike the regular per-item data rows (HSN/SAC left-aligned), the
        // reference right-aligns the 'TOTAL' word itself in this row — its
        // measured x-end (≈90.35) sits at the HSN column's right edge, not
        // its left edge.
        boldText(totalCells[c], tx + 2, ty + 4, { width: dataColWidths[c] - 4, height: 9, ellipsis: true, align: 'right' });
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
      const rawSize = opts?.size ?? 8.5;
      // Bold rows (Total / Balance) get the same height correction as every
      // other Body-Bold usage in this file — non-bold rows (Sub Total /
      // Received / etc.) measured correctly already and are left alone.
      const size = opts?.bold ? rawSize * 0.86 : rawSize;
      doc.font(opts?.bold ? 'Body-Bold' : 'Body').fontSize(size).fillColor(BORDER);
      if (opts?.bold) {
        boldText(label, rightX, ry, { width: labelW });
        boldText(value, rightX + labelW + 9, ry, { width: rightWidth - labelW - 9, align: 'right' });
      } else {
        doc.text(label, rightX, ry, { width: labelW });
        doc.text(value, rightX + labelW + 9, ry, { width: rightWidth - labelW - 9, align: 'right' });
      }
      doc.font(opts?.bold ? 'Body-Bold' : 'Body').fontSize(size);
      doc.text(':', rightX + labelW, ry, { width: 10 });
    }

    // Divider lines between Sub Total / Total / Invoice Amount In Words —
    // measured from the reference's own thin divider rects (2026-08-21,
    // pikepdf content-stream extraction): each spans from the tax table's
    // right edge (tableX+leftWidth) to the outer border, not just under the
    // right-box's own text column, matching the reference's actual width.
    const rightDividerX0 = tableX + leftWidth;
    const rightDividerX1 = tableX + CONTENT_WIDTH;
    // rightDivider(ry) previously drew the line flush with the NEXT row's
    // text-top (ry itself), leaving zero clearance from the row above —
    // PDFKit's text "top" y already sits close to the cap-height, so at
    // that offset the line visually cut through the row above it (reported
    // as text rendering with a line "through" it). The reference's own
    // divider positions (311.3/327.0/342.8/368.3) sit a consistent 3.37pt
    // *before* the following row's text-top (314.67/330.42/346.17/371.67),
    // not flush with it — this offsets every call to match.
    function rightDivider(nextRowTextY: number) {
      doc.moveTo(rightDividerX0, nextRowTextY - 3.37).lineTo(rightDividerX1, nextRowTextY - 3.37).stroke(BORDER);
    }

    let ry = rightBoxTop;
    summaryRow('Sub Total', rupee(data.subtotal));
    ry += 15.75;
    rightDivider(ry);
    summaryRow('Total', rupee(data.totalAmount), { bold: true, size: 9.5 });
    ry += 15.75;
    rightDivider(ry);
    doc.font('Body-Bold').fontSize(7.3).fillColor(BORDER);
    boldText('Invoice Amount In Words :', rightX, ry, { width: rightWidth });
    ry += 15.75;
    rightDivider(ry);
    doc.font('Body').fontSize(7.5).text(amountInWords(data.totalAmount), rightX, ry, { width: rightWidth, height: 24 });
    ry += 25.5;
    // 4th right-box divider, below the amount-in-words text and before
    // Received — missed in the earlier pass (only 3 were added then); the
    // reference has one here too (pikepdf thin-rect extraction, y=368.3).
    rightDivider(ry);
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
    // overlaying the two PDFs, not accumulated rounding drift. Reverted to
    // +10 (was briefly +10.52) — that +0.52 was meant only to nudge the
    // closing line's own drawn position, but since Terms/Bank Details below
    // are positioned off of `sectionBottom` (which `ry` feeds into), it also
    // dragged Terms And Conditions/Bank Details down by the same 0.52pt —
    // reported as "the one above bank details header is a bit down than the
    // original". See `closingLineY` below for the decoupled fix.
    ry += 10;

    // Reference invoice leaves the tax-summary table bordered down to the
    // same bottom edge as the right-side summary box, even though the table
    // itself has no more data rows there — an empty bordered cell, not a
    // gap. Reproduce it so the two blocks end flush.
    const sectionBottom = Math.max(ty, ry);
    // The closing line/rect are drawn lower than `sectionBottom` itself —
    // re-measured 2026-08-26 via pikepdf against a scenario-A render using
    // the reference's own data (invoice #1263/POSH PHARMA): rightBoxTop and
    // every row pitch through Current Balance already land within 0.03pt of
    // the reference (Current Balance text itself is correctly positioned,
    // confirming the row is fine), but this render's closing line landed at
    // y=427.16 vs the reference's actual y=429.0-429.75 (rect center
    // 429.375) — a 2.22pt shortfall, not the 0.52pt an earlier pass assumed
    // without being able to render/measure. Deliberately kept separate from
    // `sectionBottom`, which Terms And Conditions/Bank Details below anchor
    // to via `y = sectionBottom + 9.1` (independently verified exact,
    // 435.74 vs reference's 435.75) — nudging `sectionBottom` directly (as
    // a previous pass did) moved those rows too, which they shouldn't.
    const closingLineY = sectionBottom + 2.22;
    if (closingLineY > ty) {
      doc.rect(tableX, ty, leftWidth, closingLineY - ty).stroke(BORDER);
    }
    // The reference's closing line at this level runs the FULL content
    // width (528.7 wide, verified via its own re() rect), not just under
    // the tax table — it continues across the right-side summary box too,
    // closing that box off from the Terms row below. The rect above only
    // covers the tax table's own leftWidth; this line completes the rest.
    doc.moveTo(rightDividerX0, closingLineY).lineTo(tableX + CONTENT_WIDTH, closingLineY).stroke(BORDER);
    // Right-side outer edge for this whole "Tax Summary + right box" group
    // — the right box has no rect() of its own (text-only), so unlike every
    // other group in this document it has no right border at all unless
    // drawn explicitly. The reference has exactly this one line, spanning
    // only this group's own height (group2Top to closingLineY) — NOT the
    // whole document — which is part of why the reference reads as three
    // visually separate groups instead of one continuous frame.
    doc.moveTo(tableX + CONTENT_WIDTH, group2Top).lineTo(tableX + CONTENT_WIDTH, closingLineY).stroke(BORDER);

    // +9.10 (was +7.32) — re-measured directly against a fresh render: the
    // reference's Terms row top is y=435.80; after the item-Total→
    // rightBoxTop and taxTableTop gap changes above, this landed at 435.10,
    // so +0.70 more closes the remaining gap exactly.
    y = sectionBottom + 9.1;

    // ── 6. Terms And Conditions row (full width — no separate Description
    // column any more; the sales-agent note moved into the item table, §4) ──
    ensureSpace(33);
    const termsRowH = 33;
    // Grey fill drawn BEFORE the border stroke — same fix already applied to
    // Bank Details below (see its comment): fill() paints an opaque
    // rectangle, so stroking the border first let the fill immediately
    // overpaint the portion of the top border inside the label band,
    // leaving only a partial/anti-aliased sliver of it visible — reported
    // as "the line above terms and conditions is a bit thin". Terms was the
    // one row that still had the old (wrong) order.
    doc.rect(tableX, y, CONTENT_WIDTH, 17).fill(GREY);
    doc.rect(tableX, y, CONTENT_WIDTH, termsRowH).stroke(BORDER);
    // Divider between the "Terms And Conditions:" label and the value text
    // below it — the grey fill alone only implies a boundary via color; the
    // reference draws an actual line there (matches the same treatment
    // added to Bank Details/For Company below).
    // 15.7 (was 17) — re-measured 2026-08-21 against a real generated PDF vs
    // the reference: the reference's divider sits at y=451.5, 1.3pt above
    // where +17 (matching the grey fill's own height) was landing — the
    // fill height and the divider position aren't quite the same value in
    // the reference. 16.13 (was 15.7) — re-measured 2026-08-26 via pikepdf:
    // the reference's actual divider rect is y=[451.5,452.25] (center
    // 451.875), and this row's own top border lands at y=435.75 in the
    // reference, giving a true offset of 16.125.
    doc.moveTo(tableX, y + 16.13).lineTo(tableX + CONTENT_WIDTH, y + 16.13).stroke(BORDER);
    doc.fillColor(BORDER).font('Body-Bold').fontSize(7.3);
    boldText('Terms And Conditions:', tableX + 3.2, y + 4);
    doc.font('Body').fontSize(8);
    doc.text(sanitize(data.termsAndConditions) || '-', tableX + 3.2, y + 21, { width: CONTENT_WIDTH - 6, height: 11, ellipsis: true });
    y += termsRowH;
    // No gap here — in the reference, the Terms row's bottom border and the
    // Bank Details row's top border are the same line (adjacent boxes).

    // ── 7. Bank Details / Signature row ──────────────────────────────────
    ensureSpace(80);
    const bsRowH = 80;
    // Grey fills drawn BEFORE the two rect() borders below — same fix as
    // Bill To/Invoice Details above: fill() paints an opaque rectangle, so
    // drawing the borders first let the fill blank out the portion of the
    // shared vertical divider (between Bank Details and For <Company>) that
    // fell inside the label band, making it look like the separator "didn't
    // reach the top" of the row.
    doc.rect(tableX, y, colWidth, 17).fill(GREY);
    doc.rect(tableX + colWidth, y, colWidth, 17).fill(GREY);
    doc.rect(tableX, y, colWidth, bsRowH).stroke(BORDER);
    doc.rect(tableX + colWidth, y, colWidth, bsRowH).stroke(BORDER);
    // Same label/value divider treatment as Terms And Conditions above —
    // full width so it also crosses (and reinforces) the vertical divider
    // between the Bank Details and For <Company> columns.
    // 17.63 (was 16.1/16.5/15.7 across earlier guesses) — re-measured
    // 2026-08-26 via pikepdf: the reference's divider rect is
    // y=[485.25,486.00] (center 485.625), and this row's own top border
    // lands at y=468.00 in the reference, giving a true offset of 17.625 —
    // notably different from Terms' 16.125 despite the visually similar
    // label-row treatment, confirmed independently via the actual reference
    // geometry rather than another blind nudge.
    doc.moveTo(tableX, y + 17.63).lineTo(tableX + CONTENT_WIDTH, y + 17.63).stroke(BORDER);
    doc.fillColor(BORDER).font('Body-Bold').fontSize(7.3);
    boldText('Bank Details:', tableX + 3.2, y + 4);
    // colWidth + 3.39 (was + 6) — re-measured 2026-08-21 against a real
    // generated PDF vs the reference via pdftotext xMin (301.64 vs the
    // 304.25 that +6 produces).
    boldText(`For ${sanitize(data.company.companyName) || 'Company'}:`, tableX + colWidth + 3.39, y + 4);

    // x = tableX + 4.98 (was + 3.2) and the y offsets below re-measured
    // 2026-08-26 via pikepdf/pdftotext against a scenario-A render (uses the
    // reference's own data) — the reference's own "Account No.:"/"IFSC
    // code:"/"Account Holder's Name:" rows all start at the same x=38.68,
    // 1.78pt right of what +3.2 was producing; "Name:" (bank name) alone
    // sits ~1pt left of that in the reference (37.64) — a reference-side
    // quirk on that one row alone, not chased further since 3 of 4 rows
    // agree exactly. Row pitch corrected too: the reference's row1->row2
    // gap is 10.5, not 11 (rows 2-3 and 3-4 were already exactly 12).
    labelBoldValue('Name: ', sanitize(data.company.bankName) || '-', tableX + 4.98, y + 20.68, 8);
    labelBoldValue('Account No.: ', sanitize(data.company.bankAccountNumber) || '-', tableX + 4.98, y + 31.18, 8);
    labelBoldValue('IFSC code: ', sanitize(data.company.bankIfsc) || '-', tableX + 4.98, y + 43.18, 8);
    labelBoldValue("Account Holder's Name: ", sanitize(data.company.bankAccountHolderName) || '-', tableX + 4.98, y + 55.18, 8);

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
    // Pure centering formula (no manual nudge) — re-measured 2026-08-21: the
    // earlier +1.5 correction actually overshot the reference's true target
    // (x=387.75) by ~1.5pt; plain centering lands at 387.78, within 0.03pt.
    const sigX = tableX + colWidth + (colWidth - sigW) / 2;
    const sigBuf = dataUrlToBuffer(data.company.signatureUrl);
    if (sigBuf) {
      try {
        // No `fit` — see the logo comment above. This was a real bug: the
        // reference signature is 85.5x44.25 (aspect ratio 1.93:1), but the
        // uploaded source PNG is 800x484 (1.65:1), so `fit` was shrinking it
        // to fit inside the box while preserving its own aspect ratio
        // instead of stretching to the target — rendering ~12pt narrower
        // (73.14pt) than the reference's actual 85.5pt, confirmed via
        // pikepdf transform-matrix extraction on both PDFs.
        // y+20.2 (was y+21) — re-measured 2026-08-21 against the reference's
        // signature image transform matrix now that the Terms-gap fix above
        // lands this row's top exactly on the reference's 468.80 (target
        // signature y_top=489.00, i.e. row-top+20.2).
        doc.image(sigBuf, sigX, y + 20.2, { width: sigW, height: sigH });
      } catch {
        // ignore corrupt signature image
      }
    }
    // Box left nudged +6 -> +2.82 (re-measured 2026-08-26): the centered
    // text's own center point landed 3.18pt right of the reference's actual
    // center (this render's font metrics make the string ~3pt narrower than
    // the reference's, which shifts a center-aligned box further under
    // asymmetric centering — corrected by shifting the box itself, not by
    // fighting the font). y+66 -> +65.68 for the same 0.32pt the rest of
    // this row's text was measured off by.
    // y+63.78 (was +65.68) — re-measured 2026-08-27 against actual rendered
    // pixels (see the "Invoice" title comment above for why pdftotext bbox
    // wasn't catching this): landed ~1.9pt too low in the real render.
    doc.font('Body').fontSize(8).fillColor(BORDER).text('Authorized Signatory', tableX + colWidth + 2.82, y + 63.78, { width: colWidth - 12, align: 'center' });

    y += bsRowH;

    // No continuous outer box around the whole document body — removed
    // 2026-08-21. The reference does NOT wrap header-through-signature in
    // one unbroken frame; it reads as three separate bordered groups
    // (header/Bill To/item table — tax summary/right box — Terms/Bank
    // Details), each with small real gaps between them and no line
    // bridging those gaps. Every section already strokes its own complete
    // box (header, Bill To, each item row, tax table, Terms, Bank Details),
    // so removing this no longer leaves any of them unbordered — it only
    // removes the artificial connector this line was drawing across the
    // gaps between groups. The one exception (the right-side summary box,
    // which has no rect() of its own) gets its own scoped right-edge line
    // just above, spanning only its own group's height.
    doc.end();
  });
}
