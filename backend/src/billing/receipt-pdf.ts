// backend/src/billing/receipt-pdf.ts
//
// Renders the Receipt Voucher PDF — one per order, listing every VERIFIED
// payment received against that order's invoice. Follows the Tax Invoice's
// visual language (same page size/margins, Segoe UI 'Body'/'Body-Bold'
// fonts, grey label bars, border colour, company header, signature block —
// see invoice-pdf.ts) but is a plain, self-contained layout: invoice-pdf.ts
// is pixel-tuned against a reference bill, so it is deliberately NOT edited
// or reused section-by-section here (any change there risks shifting the
// tax invoice's measured layout).
import PDFDocument from 'pdfkit';
import { amountInWords } from './amount-in-words';
import { registerInvoiceFonts } from './pdf-fonts';
import { dataUrlToBuffer, InvoicePdfCompanyProfile, money } from './invoice-pdf';

export interface ReceiptPdfPayment {
  paymentDate: string; // pre-formatted, e.g. "23/06/2026"
  method: string; // human label, e.g. "Bank Transfer"
  referenceNumber: string | null;
  accountName: string | null;
  amount: number;
}

export interface ReceiptPdfData {
  receiptNumber: string;
  receiptDate: string; // pre-formatted — date of the latest payment on this voucher
  invoiceNumber: string;
  invoiceDate: string;
  invoiceAmount: number;
  receivedAmount: number; // sum of payments[].amount
  balanceAmount: number;
  customerName: string;
  customerAddress: string;
  customerPhone: string;
  customerGstin: string;
  payments: ReceiptPdfPayment[];
  company: InvoicePdfCompanyProfile;
}

// Same page geometry and colours as invoice-pdf.ts.
const PAGE_MARGIN = 33.7;
const PAGE_HEIGHT = 841.92;
const CONTENT_WIDTH = 529.1;
const GREY = '#f4f4f4';
const BORDER = '#3f4155';

function sanitize(value: string | null | undefined): string {
  return String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim();
}

function rupee(n: number): string {
  return `₹${money(n)}`;
}

export async function buildReceiptVoucherPdf(data: ReceiptPdfData): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN });
  const chunks: Buffer[] = [];
  registerInvoiceFonts(doc);

  return new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    const left = PAGE_MARGIN;
    const right = PAGE_MARGIN + CONTENT_WIDTH;
    let y = PAGE_MARGIN;

    function ensureSpace(needed: number) {
      if (y + needed > PAGE_HEIGHT - PAGE_MARGIN) {
        doc.addPage();
        y = PAGE_MARGIN;
      }
    }

    function labelValue(label: string, value: string, x: number, y0: number, width: number) {
      doc.font('Body').fontSize(8.5).fillColor(BORDER).text(label, x, y0, { lineBreak: false });
      const labelW = doc.widthOfString(label);
      doc.font('Body-Bold').fontSize(8.5).text(value || '-', x + labelW, y0, { width: Math.max(10, width - labelW), lineBreak: false, ellipsis: true });
    }

    // ── 1. Title ──────────────────────────────────────────────────────────
    doc.font('Body-Bold').fontSize(17).fillColor(BORDER).text('Receipt Voucher', left, y, { width: CONTENT_WIDTH, align: 'center' });
    y += 30;

    // ── 2. Company header ─────────────────────────────────────────────────
    const headerHeight = 85.5;
    doc.rect(left, y, CONTENT_WIDTH, headerHeight).stroke(BORDER);
    let headerTextX = left + 12;
    const logoBuf = dataUrlToBuffer(data.company.logoUrl);
    if (logoBuf) {
      try {
        doc.image(logoBuf, left + 6, y + 6.4, { width: 73, height: 73 });
        headerTextX = 120;
      } catch {
        // Corrupt/unsupported image — text-only header, same as the invoice.
      }
    }
    const headerTextWidth = right - headerTextX - 10;
    doc.font('Body-Bold').fontSize(14.5).fillColor(BORDER)
      .text(sanitize(data.company.companyName) || 'Company Name Not Set', headerTextX, y + 6, { width: headerTextWidth, lineBreak: false, ellipsis: true });
    doc.font('Body').fontSize(8.5)
      .text(sanitize(data.company.companyAddress) || 'Company address not set — fill in Billing > Company Profile', headerTextX, y + 27, { width: headerTextWidth, height: 22, ellipsis: true });
    const halfHeader = headerTextWidth / 2;
    labelValue('Phone: ', sanitize(data.company.companyPhone), headerTextX, y + 51, halfHeader);
    labelValue('Email: ', sanitize(data.company.companyEmail), headerTextX + halfHeader, y + 51, halfHeader);
    labelValue('GSTIN: ', sanitize(data.company.companyGstin), headerTextX, y + 64, halfHeader);
    labelValue('State: ', sanitize(data.company.companyState), headerTextX + halfHeader, y + 64, halfHeader);
    y += headerHeight + 0.4;

    // ── 3. Received From / Receipt Details ────────────────────────────────
    const detailsHeight = 82;
    const colWidth = CONTENT_WIDTH / 2;
    doc.rect(left, y, colWidth, 17).fill(GREY);
    doc.rect(left + colWidth, y, colWidth, 17).fill(GREY);
    doc.rect(left, y, CONTENT_WIDTH, detailsHeight).stroke(BORDER);
    doc.moveTo(left + colWidth, y).lineTo(left + colWidth, y + detailsHeight).stroke(BORDER);
    doc.font('Body-Bold').fontSize(9).fillColor(BORDER);
    doc.text('Received From:', left + 6, y + 4, { lineBreak: false });
    doc.text('Receipt Details:', left + colWidth + 6, y + 4, { lineBreak: false });

    const innerW = colWidth - 12;
    doc.font('Body-Bold').fontSize(9.5).text(sanitize(data.customerName) || '-', left + 6, y + 22, { width: innerW, lineBreak: false, ellipsis: true });
    doc.font('Body').fontSize(8.5).text(sanitize(data.customerAddress) || '-', left + 6, y + 35, { width: innerW, height: 20, ellipsis: true });
    labelValue('Contact No.: ', sanitize(data.customerPhone), left + 6, y + 55, innerW);
    if (sanitize(data.customerGstin)) labelValue('GSTIN: ', sanitize(data.customerGstin), left + 6, y + 67, innerW);

    const rx = left + colWidth + 6;
    labelValue('Receipt No.: ', data.receiptNumber, rx, y + 22, innerW);
    labelValue('Date: ', data.receiptDate, rx, y + 35, innerW);
    labelValue('Against Invoice No.: ', data.invoiceNumber, rx, y + 48, innerW);
    labelValue('Invoice Date: ', data.invoiceDate, rx, y + 61, innerW);
    y += detailsHeight + 0.4;

    // ── 4. Payments table ─────────────────────────────────────────────────
    const cols = [
      { title: '#', width: 24, align: 'center' as const },
      { title: 'Payment Date', width: 72, align: 'left' as const },
      { title: 'Payment Mode', width: 82, align: 'left' as const },
      { title: 'Reference No.', width: 130, align: 'left' as const },
      { title: 'Received In', width: 121.1, align: 'left' as const },
      { title: 'Amount', width: 100, align: 'right' as const },
    ];
    const rowH = 18;

    function drawRow(values: string[], bold: boolean, fill?: string) {
      ensureSpace(rowH);
      if (fill) doc.rect(left, y, CONTENT_WIDTH, rowH).fillAndStroke(fill, BORDER);
      else doc.rect(left, y, CONTENT_WIDTH, rowH).stroke(BORDER);
      doc.fillColor(BORDER).font(bold ? 'Body-Bold' : 'Body').fontSize(8.5);
      let x = left;
      cols.forEach((col, i) => {
        if (i > 0) doc.moveTo(x, y).lineTo(x, y + rowH).stroke(BORDER);
        doc.text(values[i] ?? '', x + 4, y + 4.5, { width: col.width - 8, align: col.align, lineBreak: false, ellipsis: true });
        x += col.width;
      });
      y += rowH;
    }

    drawRow(cols.map((c) => c.title), true, GREY);
    data.payments.forEach((p, idx) => {
      drawRow([
        String(idx + 1),
        p.paymentDate,
        p.method,
        sanitize(p.referenceNumber) || '-',
        sanitize(p.accountName) || '-',
        rupee(p.amount),
      ], false);
    });
    drawRow(['', '', '', '', 'Total', rupee(data.receivedAmount)], true, '#f8f8f8');
    y += 0.4;

    // ── 5. Amount in words / Summary ──────────────────────────────────────
    const summaryHeight = 66;
    ensureSpace(summaryHeight);
    doc.rect(left, y, colWidth, 17).fill(GREY);
    doc.rect(left + colWidth, y, colWidth, 17).fill(GREY);
    doc.rect(left, y, CONTENT_WIDTH, summaryHeight).stroke(BORDER);
    doc.moveTo(left + colWidth, y).lineTo(left + colWidth, y + summaryHeight).stroke(BORDER);
    doc.font('Body-Bold').fontSize(9).fillColor(BORDER);
    doc.text('Amount Received in Words:', left + 6, y + 4, { lineBreak: false });
    doc.text('Summary:', left + colWidth + 6, y + 4, { lineBreak: false });
    doc.font('Body').fontSize(8.5).text(amountInWords(data.receivedAmount), left + 6, y + 23, { width: innerW, height: 38, ellipsis: true });

    const summaryRows: [string, number][] = [
      ['Invoice Amount', data.invoiceAmount],
      ['Received', data.receivedAmount],
      ['Balance Due', data.balanceAmount],
    ];
    summaryRows.forEach(([label, value], i) => {
      const sy = y + 22 + i * 14;
      doc.font(i === 1 ? 'Body-Bold' : 'Body').fontSize(8.5).text(label, rx, sy, { width: innerW / 2, lineBreak: false });
      doc.font('Body-Bold').fontSize(8.5).text(rupee(value), rx + innerW / 2, sy, { width: innerW / 2, align: 'right', lineBreak: false });
    });
    y += summaryHeight + 0.4;

    // ── 6. Signature ──────────────────────────────────────────────────────
    const signHeight = 88;
    ensureSpace(signHeight);
    doc.rect(left, y, CONTENT_WIDTH, signHeight).stroke(BORDER);
    const signX = left + colWidth;
    doc.font('Body').fontSize(8.5).fillColor(BORDER)
      .text(`For ${sanitize(data.company.companyName) || 'Company'}:`, signX, y + 6, { width: colWidth - 6, align: 'center', lineBreak: false });
    const sigBuf = dataUrlToBuffer(data.company.signatureUrl);
    if (sigBuf) {
      try {
        doc.image(sigBuf, signX + (colWidth - 110) / 2, y + 20, { fit: [110, 45], align: 'center', valign: 'center' });
      } catch {
        // Corrupt/unsupported image — leave the signature space blank.
      }
    }
    doc.font('Body-Bold').fontSize(8.5).text('Authorized Signatory', signX, y + signHeight - 16, { width: colWidth - 6, align: 'center', lineBreak: false });

    doc.end();
  });
}
