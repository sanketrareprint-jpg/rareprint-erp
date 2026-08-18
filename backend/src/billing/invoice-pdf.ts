// backend/src/billing/invoice-pdf.ts
//
// Renders the Tax Invoice PDF matching RarePrint's real bill layout
// (reference: Invoice_311_07_11_25.pdf — see docs/Billing_Module_Build_Prompt.md
// §1 for the exact section-by-section spec this follows). Structural pattern
// (PDFKit doc → chunks → Buffer via a Promise) mirrors the existing
// generateInvoicePdf in bigship.service.ts; this one is considerably more
// detailed to match the real invoice format instead of a generic dispatch slip.
import PDFDocument from 'pdfkit';
import { amountInWords } from './amount-in-words';

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
  issueDate: string; // pre-formatted, e.g. "07/11/2025"
  gstTreatment: 'INTRA_STATE' | 'INTER_STATE' | 'EXPORT' | 'UNREGISTERED';
  subtotal: number;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  description: string;
  termsAndConditions: string;
  customerName: string;
  customerCity: string;
  customerPhone: string;
  customerState: string;
  customerGstin: string;
  items: InvoicePdfItem[];
  company: InvoicePdfCompanyProfile;
}

const PAGE_MARGIN = 40;
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const GREY = '#e5e5e5';
const BORDER = '#333333';
const BRAND_RED = '#b91c1c';

function money(n: number): string {
  return (Number.isFinite(n) ? n : 0).toFixed(2);
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

  return new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    let y = PAGE_MARGIN;

    function ensureSpace(needed: number) {
      if (y + needed > PAGE_HEIGHT - PAGE_MARGIN) {
        doc.addPage();
        y = PAGE_MARGIN;
      }
    }

    // ── 1. Page title ────────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(18).fillColor('black');
    doc.text('Invoice', PAGE_MARGIN, y, { align: 'center', width: CONTENT_WIDTH });
    y += 28;

    const boxTop = y;

    // ── 2. Company header block ─────────────────────────────────────────
    const headerHeight = 100;
    doc.rect(PAGE_MARGIN, y, CONTENT_WIDTH, headerHeight).stroke(BORDER);

    const logoBuf = dataUrlToBuffer(data.company.logoUrl);
    const textLeft = PAGE_MARGIN + 12;
    let headerTextX = textLeft;
    if (logoBuf) {
      try {
        doc.image(logoBuf, PAGE_MARGIN + 10, y + 10, { width: 70, height: 70, fit: [70, 70] });
        headerTextX = PAGE_MARGIN + 92;
      } catch {
        // Corrupt/unsupported image data — fall back to text-only header
        // rather than failing the whole PDF.
      }
    }

    const headerTextWidth = PAGE_MARGIN + CONTENT_WIDTH - headerTextX - 10;
    doc.font('Helvetica-Bold').fontSize(16).fillColor(BRAND_RED);
    doc.text(sanitize(data.company.companyName) || 'Company Name Not Set', headerTextX, y + 8, { width: headerTextWidth });
    doc.font('Helvetica').fontSize(8.5).fillColor('black');
    doc.text(sanitize(data.company.companyAddress) || 'Company address not set — fill in Billing > Company Profile', headerTextX, y + 28, { width: headerTextWidth, height: 24, ellipsis: true });

    doc.font('Helvetica').fontSize(8.5).fillColor('black');
    const rowY1 = y + 58;
    doc.text('Phone:', headerTextX, rowY1, { continued: true, width: headerTextWidth / 2 });
    doc.font('Helvetica-Bold').text(` ${sanitize(data.company.companyPhone) || '-'}`);
    doc.font('Helvetica').text('Email:', headerTextX + headerTextWidth / 2, rowY1, { continued: true });
    doc.font('Helvetica-Bold').text(` ${sanitize(data.company.companyEmail) || '-'}`);

    const rowY2 = y + 74;
    doc.font('Helvetica').text('GSTIN:', headerTextX, rowY2, { continued: true, width: headerTextWidth / 2 });
    doc.font('Helvetica-Bold').text(` ${sanitize(data.company.companyGstin) || '-'}`);
    doc.font('Helvetica').text('State:', headerTextX + headerTextWidth / 2, rowY2, { continued: true });
    doc.font('Helvetica-Bold').text(` ${sanitize(data.company.companyState) || '-'}`);

    y += headerHeight;

    // ── 3. Bill To / Invoice Details row ────────────────────────────────
    const biRowHeight = 100;
    const colWidth = CONTENT_WIDTH / 2;
    doc.rect(PAGE_MARGIN, y, CONTENT_WIDTH, biRowHeight).stroke(BORDER);
    doc.moveTo(PAGE_MARGIN + colWidth, y).lineTo(PAGE_MARGIN + colWidth, y + biRowHeight).stroke(BORDER);

    doc.rect(PAGE_MARGIN, y, colWidth, 18).fill(GREY);
    doc.rect(PAGE_MARGIN + colWidth, y, colWidth, 18).fill(GREY);
    doc.fillColor('black').font('Helvetica-Bold').fontSize(9);
    doc.text('Bill To:', PAGE_MARGIN + 8, y + 5);
    doc.text('Invoice Details:', PAGE_MARGIN + colWidth + 8, y + 5);

    doc.font('Helvetica-Bold').fontSize(10).fillColor('black');
    doc.text(sanitize(data.customerName) || 'Customer', PAGE_MARGIN + 8, y + 26, { width: colWidth - 16 });
    doc.font('Helvetica').fontSize(9);
    doc.text(sanitize(data.customerCity) || '-', PAGE_MARGIN + 8, y + 42, { width: colWidth - 16 });
    doc.text('Contact No:', PAGE_MARGIN + 8, y + 60, { continued: true });
    doc.font('Helvetica-Bold').text(` ${sanitize(data.customerPhone) || '-'}`);
    doc.font('Helvetica').text('State:', PAGE_MARGIN + colWidth / 2 + 4, y + 60, { continued: true });
    doc.font('Helvetica-Bold').text(` ${sanitize(data.customerState) || '-'}`);
    doc.font('Helvetica').fontSize(9).text('GSTIN:', PAGE_MARGIN + 8, y + 76, { continued: true });
    doc.font('Helvetica-Bold').text(` ${sanitize(data.customerGstin) || '-'}`);

    doc.font('Helvetica').fontSize(9);
    doc.text('No:', PAGE_MARGIN + colWidth + 8, y + 26, { continued: true });
    doc.font('Helvetica-Bold').text(` ${sanitize(data.invoiceNumber)}`);
    doc.font('Helvetica').text('Date:', PAGE_MARGIN + colWidth + 8, y + 42, { continued: true });
    doc.font('Helvetica-Bold').text(` ${sanitize(data.issueDate)}`);
    doc.font('Helvetica').text('Place Of Supply:', PAGE_MARGIN + colWidth + 8, y + 58, { continued: true });
    doc.font('Helvetica-Bold').text(` ${sanitize(data.customerState) || '-'}`);

    y += biRowHeight;

    // ── 4. Line items table ─────────────────────────────────────────────
    const cols = [
      { key: '#', width: 20 },
      { key: 'Item', width: 130 },
      { key: 'HSN/SAC', width: 55 },
      { key: 'Qty', width: 35 },
      { key: 'Unit', width: 35 },
      { key: 'Price/Unit(₹)', width: 65 },
      { key: 'GST(₹)', width: 65 },
      { key: 'Ad.CESS(₹)', width: 50 },
      { key: 'Amount(₹)', width: 60 },
    ];
    const tableX = PAGE_MARGIN;
    const headerRowH = 22;
    ensureSpace(headerRowH + 20);
    let colX = tableX;
    doc.rect(tableX, y, CONTENT_WIDTH, headerRowH).fill(GREY).stroke(BORDER);
    doc.fillColor('black').font('Helvetica-Bold').fontSize(7.5);
    for (const col of cols) {
      doc.text(col.key, colX + 3, y + 7, { width: col.width - 6 });
      colX += col.width;
    }
    y += headerRowH;

    let totalQty = 0;
    let totalAmount = 0;

    doc.font('Helvetica').fontSize(8);
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      const gstAmt = item.cgstAmount + item.sgstAmount + item.igstAmount;
      const hasNote = false; // no separate item-note field in schema today
      const rowH = hasNote ? 30 : 22;
      ensureSpace(rowH);

      doc.rect(tableX, y, CONTENT_WIDTH, rowH).stroke(BORDER);
      colX = tableX;
      const values = [
        String(i + 1),
        sanitize(item.productName),
        sanitize(item.hsnSac) || '-',
        String(item.quantity),
        sanitize(item.unit) || 'PCS',
        money(item.unitPrice),
        `${money(gstAmt)} (${Number(item.gstRatePct).toFixed(0)}%)`,
        money(0),
        money(item.lineTotal),
      ];
      for (let c = 0; c < cols.length; c++) {
        doc.text(values[c], colX + 3, y + 6, { width: cols[c].width - 6, ellipsis: true });
        colX += cols[c].width;
      }
      y += rowH;

      totalQty += item.quantity;
      totalAmount += item.lineTotal;
    }

    ensureSpace(22);
    doc.rect(tableX, y, CONTENT_WIDTH, 22).fill('#f8f8f8').stroke(BORDER);
    doc.fillColor('black').font('Helvetica-Bold').fontSize(8.5);
    doc.text('Total', tableX + 3, y + 6, { width: cols[0].width + cols[1].width + cols[2].width - 6 });
    doc.text(
      String(totalQty),
      tableX + cols[0].width + cols[1].width + cols[2].width + 3,
      y + 6,
      { width: cols[3].width - 6 },
    );
    doc.text(
      money(totalAmount),
      tableX + CONTENT_WIDTH - cols[8].width + 3,
      y + 6,
      { width: cols[8].width - 6 },
    );
    y += 22 + 10;

    // ── 5. Tax Summary ───────────────────────────────────────────────────
    ensureSpace(20);
    doc.font('Helvetica-Bold').fontSize(9).fillColor('black').text('Tax Summary:', tableX, y);
    y += 16;

    const isInterState = data.gstTreatment === 'INTER_STATE' || data.gstTreatment === 'EXPORT';
    const leftWidth = CONTENT_WIDTH * 0.58;
    const rightWidth = CONTENT_WIDTH - leftWidth - 12;
    const rightX = tableX + leftWidth + 12;

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

    const taxTableTop = y;
    const taxHeaderH = 16;
    const taxRowH = 16;
    const taxColWidths = isInterState
      ? [leftWidth * 0.2, leftWidth * 0.24, leftWidth * 0.14, leftWidth * 0.14, leftWidth * 0.14, leftWidth * 0.14]
      : [leftWidth * 0.18, leftWidth * 0.2, leftWidth * 0.13, leftWidth * 0.13, leftWidth * 0.13, leftWidth * 0.13, leftWidth * 0.1];

    doc.rect(tableX, taxTableTop, leftWidth, taxHeaderH).fill(GREY).stroke(BORDER);
    doc.fillColor('black').font('Helvetica-Bold').fontSize(6.5);
    let tx = tableX;
    const taxHeaders = isInterState
      ? ['HSN/SAC', 'Taxable (₹)', 'IGST Rate%', 'IGST Amt(₹)', 'Ad.CESS(₹)', 'Total Tax(₹)']
      : ['HSN/SAC', 'Taxable (₹)', 'CGST%', 'CGST(₹)', 'SGST%', 'SGST(₹)', 'Total Tax(₹)'];
    for (let c = 0; c < taxHeaders.length; c++) {
      doc.text(taxHeaders[c], tx + 2, taxTableTop + 5, { width: taxColWidths[c] - 4 });
      tx += taxColWidths[c];
    }

    let ty = taxTableTop + taxHeaderH;
    doc.font('Helvetica').fontSize(7);
    let grandTaxable = 0;
    let grandCgst = 0;
    let grandSgst = 0;
    let grandIgst = 0;
    let grandTax = 0;
    for (const [hsn, g] of groups) {
      doc.rect(tableX, ty, leftWidth, taxRowH).stroke(BORDER);
      tx = tableX;
      const rateOverall = g.taxable > 0 ? (g.total / g.taxable) * 100 : 0;
      const cells = isInterState
        ? [hsn, money(g.taxable), `${rateOverall.toFixed(1)}%`, money(g.igst), money(0), money(g.total)]
        : [hsn, money(g.taxable), `${(rateOverall / 2).toFixed(1)}%`, money(g.cgst), `${(rateOverall / 2).toFixed(1)}%`, money(g.sgst), money(g.total)];
      for (let c = 0; c < cells.length; c++) {
        doc.text(cells[c], tx + 2, ty + 4, { width: taxColWidths[c] - 4, ellipsis: true });
        tx += taxColWidths[c];
      }
      ty += taxRowH;
      grandTaxable += g.taxable;
      grandCgst += g.cgst;
      grandSgst += g.sgst;
      grandIgst += g.igst;
      grandTax += g.total;
    }
    doc.rect(tableX, ty, leftWidth, taxRowH).fill('#f8f8f8').stroke(BORDER);
    doc.font('Helvetica-Bold').fontSize(7);
    tx = tableX;
    const totalCells = isInterState
      ? ['TOTAL', money(grandTaxable), '', money(grandIgst), money(0), money(grandTax)]
      : ['TOTAL', money(grandTaxable), '', money(grandCgst), '', money(grandSgst), money(grandTax)];
    for (let c = 0; c < totalCells.length; c++) {
      doc.text(totalCells[c], tx + 2, ty + 4, { width: taxColWidths[c] - 4 });
      tx += taxColWidths[c];
    }
    ty += taxRowH;

    // Right-side summary box (no borders, label:value rows)
    let ry = taxTableTop;
    doc.font('Helvetica').fontSize(8.5).fillColor('black');
    doc.text('Sub Total', rightX, ry, { continued: true, width: rightWidth });
    doc.text(`  ₹${money(data.subtotal)}`, { align: 'right', width: rightWidth - doc.widthOfString('Sub Total') });
    ry += 14;
    doc.font('Helvetica-Bold').fontSize(9.5);
    doc.text('Total', rightX, ry, { continued: true, width: rightWidth });
    doc.text(`  ₹${money(data.totalAmount)}`, { align: 'right' });
    ry += 18;
    doc.font('Helvetica-Bold').fontSize(7.5).text('Invoice Amount in Words:', rightX, ry, { width: rightWidth });
    ry += 11;
    doc.font('Helvetica').fontSize(7.5).text(amountInWords(data.totalAmount), rightX, ry, { width: rightWidth, height: 28 });
    ry += 30;
    doc.font('Helvetica').fontSize(8.5);
    doc.text('Received', rightX, ry, { continued: true, width: rightWidth });
    doc.text(`  ₹${money(data.paidAmount)}`, { align: 'right' });
    ry += 14;
    doc.font('Helvetica-Bold');
    doc.text('Balance', rightX, ry, { continued: true, width: rightWidth });
    doc.text(`  ₹${money(data.balanceAmount)}`, { align: 'right' });
    ry += 14;

    y = Math.max(ty, ry) + 12;

    // ── 6. Description / Terms & Conditions row ─────────────────────────
    ensureSpace(60);
    const dtRowH = 60;
    doc.rect(tableX, y, colWidth, dtRowH).stroke(BORDER);
    doc.rect(tableX + colWidth, y, colWidth, dtRowH).stroke(BORDER);
    doc.rect(tableX, y, colWidth, 16).fill(GREY);
    doc.rect(tableX + colWidth, y, colWidth, 16).fill(GREY);
    doc.fillColor('black').font('Helvetica-Bold').fontSize(8);
    doc.text('Description:', tableX + 6, y + 4);
    doc.text('Terms & Conditions:', tableX + colWidth + 6, y + 4);
    doc.font('Helvetica').fontSize(8);
    doc.text(sanitize(data.description) || '-', tableX + 6, y + 22, { width: colWidth - 12, height: 34, ellipsis: true });
    doc.text(sanitize(data.termsAndConditions) || '-', tableX + colWidth + 6, y + 22, { width: colWidth - 12, height: 34, ellipsis: true });
    y += dtRowH + 10;

    // ── 7. Bank Details / Signature row ──────────────────────────────────
    ensureSpace(90);
    const bsRowH = 90;
    doc.rect(tableX, y, colWidth, bsRowH).stroke(BORDER);
    doc.rect(tableX + colWidth, y, colWidth, bsRowH).stroke(BORDER);
    doc.rect(tableX, y, colWidth, 16).fill(GREY);
    doc.rect(tableX + colWidth, y, colWidth, 16).fill(GREY);
    doc.fillColor('black').font('Helvetica-Bold').fontSize(8);
    doc.text('Bank Details:', tableX + 6, y + 4);
    doc.text(`For ${sanitize(data.company.companyName) || 'Company'}:`, tableX + colWidth + 6, y + 4);

    doc.font('Helvetica').fontSize(8);
    doc.text('Name:', tableX + 6, y + 22, { continued: true });
    doc.font('Helvetica-Bold').text(` ${sanitize(data.company.bankName) || '-'}`);
    doc.font('Helvetica').text('Account No.:', tableX + 6, y + 36, { continued: true });
    doc.font('Helvetica-Bold').text(` ${sanitize(data.company.bankAccountNumber) || '-'}`);
    doc.font('Helvetica').text('IFSC code:', tableX + 6, y + 50, { continued: true });
    doc.font('Helvetica-Bold').text(` ${sanitize(data.company.bankIfsc) || '-'}`);
    doc.font('Helvetica').text("Account holder's name:", tableX + 6, y + 64, { continued: true });
    doc.font('Helvetica-Bold').text(` ${sanitize(data.company.bankAccountHolderName) || '-'}`);

    const sigBuf = dataUrlToBuffer(data.company.signatureUrl);
    if (sigBuf) {
      try {
        doc.image(sigBuf, tableX + colWidth + 20, y + 20, { width: 100, height: 40, fit: [100, 40] });
      } catch {
        // ignore corrupt signature image
      }
    }
    doc.font('Helvetica').fontSize(8).text('Authorized Signatory', tableX + colWidth + 6, y + bsRowH - 16, { width: colWidth - 12, align: 'center' });

    y += bsRowH;

    // Outer box around the whole document body (drawn last so it sits on
    // top of the section borders visually, matching the reference layout).
    doc.rect(PAGE_MARGIN, boxTop, CONTENT_WIDTH, y - boxTop).stroke(BORDER);

    doc.end();
  });
}
