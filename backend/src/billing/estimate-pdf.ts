// backend/src/billing/estimate-pdf.ts
//
// Renders the Estimate PDF. Same visual language as the tax invoice and the
// receipt voucher (page geometry, Segoe UI 'Body'/'Body-Bold', grey label bars,
// border colour, company header, signature) — self-contained like
// receipt-pdf.ts, because invoice-pdf.ts is pixel-tuned against a reference
// bill and must not be edited for other documents.
import PDFDocument from 'pdfkit';
import { amountInWords } from './amount-in-words';
import { registerInvoiceFonts } from './pdf-fonts';
import { dataUrlToBuffer, InvoicePdfCompanyProfile, money } from './invoice-pdf';

export interface EstimatePdfData {
  estimateNumber: string;
  estimateDate: string; // pre-formatted
  validUntil: string | null;
  customerName: string;
  customerAddress: string;
  customerPhone: string;
  customerGstin: string;
  notes: string;
  items: Array<{ productName: string; details: string; quantity: number; unitPrice: number; lineTotal: number }>;
  totalAmount: number;
  company: InvoicePdfCompanyProfile;
}

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

// Rates can carry paise beyond 2 places (e.g. ₹0.8450 per piece) — show up to
// 4 decimals, trimming trailing zeros, instead of rounding them away.
function rate(n: number): string {
  const fixed = Number.isFinite(n) ? n.toFixed(4).replace(/(\.\d\d\d*?)0+$/, '$1') : '0.00';
  const [i, d = '00'] = fixed.split('.');
  return `₹${money(Number(i))}`.replace(/\.00$/, '') + '.' + d.padEnd(2, '0');
}

export async function buildEstimatePdf(data: EstimatePdfData): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN });
  const chunks: Buffer[] = [];
  registerInvoiceFonts(doc);

  return new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    const left = PAGE_MARGIN;
    const right = PAGE_MARGIN + CONTENT_WIDTH;
    const colWidth = CONTENT_WIDTH / 2;
    const innerW = colWidth - 12;
    let y = PAGE_MARGIN;

    function ensureSpace(needed: number) {
      if (y + needed > PAGE_HEIGHT - PAGE_MARGIN) {
        doc.addPage();
        y = PAGE_MARGIN;
      }
    }

    // PDFKit word-wraps whenever a width is passed (even with
    // lineBreak:false), so single-line fields are measured and cut here.
    function oneLine(text: string, width: number): string {
      if (doc.widthOfString(text) <= width) return text;
      let cut = text;
      while (cut.length > 0 && doc.widthOfString(cut + '…') > width) cut = cut.slice(0, -1);
      return cut.trimEnd() + '…';
    }

    function labelValue(label: string, value: string, x: number, y0: number, width: number) {
      doc.font('Body').fontSize(8.5).fillColor(BORDER).text(label, x, y0, { lineBreak: false });
      const labelW = doc.widthOfString(label);
      doc.font('Body-Bold').fontSize(8.5);
      doc.text(oneLine(value || '-', Math.max(10, width - labelW)), x + labelW, y0, { lineBreak: false });
    }

    function greyBars(top: number, titles: [string, string?]) {
      if (titles[1] !== undefined) {
        doc.rect(left, top, colWidth, 17).fill(GREY);
        doc.rect(left + colWidth, top, colWidth, 17).fill(GREY);
      } else {
        doc.rect(left, top, CONTENT_WIDTH, 17).fill(GREY);
      }
      doc.font('Body-Bold').fontSize(9).fillColor(BORDER);
      doc.text(titles[0], left + 6, top + 4, { lineBreak: false });
      if (titles[1]) doc.text(titles[1], left + colWidth + 6, top + 4, { lineBreak: false });
    }

    // ── 1. Title ──────────────────────────────────────────────────────────
    doc.font('Body-Bold').fontSize(17).fillColor(BORDER).text('Estimate', left, y, { width: CONTENT_WIDTH, align: 'center' });
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
        // Corrupt/unsupported image — text-only header.
      }
    }
    const headerTextWidth = right - headerTextX - 10;
    doc.font('Body-Bold').fontSize(14.5).fillColor(BORDER);
    doc.text(oneLine(sanitize(data.company.companyName) || 'Company Name Not Set', headerTextWidth), headerTextX, y + 5, { lineBreak: false });
    doc.font('Body').fontSize(8.5)
      .text(sanitize(data.company.companyAddress) || 'Company address not set — fill in Billing > Company Profile', headerTextX, y + 25, { width: headerTextWidth, height: 24, ellipsis: true, lineGap: -1 });
    const halfHeader = headerTextWidth / 2;
    labelValue('Phone: ', sanitize(data.company.companyPhone), headerTextX, y + 51, halfHeader);
    labelValue('Email: ', sanitize(data.company.companyEmail), headerTextX + halfHeader, y + 51, halfHeader);
    labelValue('GSTIN: ', sanitize(data.company.companyGstin), headerTextX, y + 64, halfHeader);
    labelValue('State: ', sanitize(data.company.companyState), headerTextX + halfHeader, y + 64, halfHeader);
    y += headerHeight + 0.4;

    // ── 3. Estimate For / Estimate Details ────────────────────────────────
    const detailsHeight = 82;
    greyBars(y, ['Estimate For:', 'Estimate Details:']);
    doc.rect(left, y, CONTENT_WIDTH, detailsHeight).stroke(BORDER);
    doc.moveTo(left + colWidth, y).lineTo(left + colWidth, y + detailsHeight).stroke(BORDER);
    doc.font('Body-Bold').fontSize(9.5).fillColor(BORDER);
    doc.text(oneLine(sanitize(data.customerName) || '-', innerW), left + 6, y + 21, { lineBreak: false });
    doc.font('Body').fontSize(8.5).text(sanitize(data.customerAddress) || '-', left + 6, y + 34, { width: innerW, height: 24, ellipsis: true, lineGap: -1 });
    labelValue('Contact No.: ', sanitize(data.customerPhone), left + 6, y + 56, innerW);
    if (sanitize(data.customerGstin)) labelValue('GSTIN: ', sanitize(data.customerGstin), left + 6, y + 67, innerW);
    const rx = left + colWidth + 6;
    labelValue('Estimate No.: ', data.estimateNumber, rx, y + 22, innerW);
    labelValue('Date: ', data.estimateDate, rx, y + 35, innerW);
    if (data.validUntil) labelValue('Valid Until: ', data.validUntil, rx, y + 48, innerW);
    y += detailsHeight + 0.4;

    // ── 4. Items table ────────────────────────────────────────────────────
    const cols = [
      { title: '#', width: 24, align: 'center' as const },
      { title: 'Item', width: 265.1, align: 'left' as const },
      { title: 'Quantity', width: 70, align: 'right' as const },
      { title: 'Rate', width: 75, align: 'right' as const },
      { title: 'Amount', width: 95, align: 'right' as const },
    ];
    const padY = 4.5;

    // Rows grow to fit wrapped text; the Item cell holds the product name in
    // bold with its size/GSM/paper/sides line underneath.
    function drawRow(cells: Array<{ text: string; sub?: string }>, bold: boolean, fill?: string) {
      doc.fontSize(8.5);
      const heights = cols.map((col, i) => {
        const w = col.width - 8;
        doc.font(bold ? 'Body-Bold' : i === 1 ? 'Body-Bold' : 'Body');
        let h = doc.heightOfString(cells[i]?.text || ' ', { width: w });
        if (cells[i]?.sub) {
          doc.font('Body').fontSize(7.5);
          h += doc.heightOfString(cells[i].sub!, { width: w }) + 1;
          doc.fontSize(8.5);
        }
        return h;
      });
      const rowH = Math.max(18, Math.ceil(Math.max(...heights) + padY * 2));
      ensureSpace(rowH);
      if (fill) doc.rect(left, y, CONTENT_WIDTH, rowH).fillAndStroke(fill, BORDER);
      else doc.rect(left, y, CONTENT_WIDTH, rowH).stroke(BORDER);
      let x = left;
      cols.forEach((col, i) => {
        if (i > 0) doc.moveTo(x, y).lineTo(x, y + rowH).stroke(BORDER);
        const w = col.width - 8;
        doc.fillColor(BORDER).font(bold || i === 1 ? 'Body-Bold' : 'Body').fontSize(8.5);
        doc.text(cells[i]?.text ?? '', x + 4, y + padY, { width: w, align: col.align });
        if (cells[i]?.sub) {
          doc.font('Body').fontSize(7.5).text(cells[i].sub!, x + 4, doc.y + 1, { width: w, align: col.align });
        }
        x += col.width;
      });
      y += rowH;
    }

    drawRow(cols.map((c) => ({ text: c.title })), true, GREY);
    data.items.forEach((item, idx) => {
      drawRow([
        { text: String(idx + 1) },
        { text: sanitize(item.productName), sub: sanitize(item.details) || undefined },
        { text: item.quantity.toLocaleString('en-IN') },
        { text: rate(item.unitPrice) },
        { text: rupee(item.lineTotal) },
      ], false);
    });
    drawRow([{ text: '' }, { text: 'Total' }, { text: data.items.reduce((s, i) => s + i.quantity, 0).toLocaleString('en-IN') }, { text: '' }, { text: rupee(data.totalAmount) }], true, '#f8f8f8');
    y += 0.4;

    // ── 5. Amount in words / Total ────────────────────────────────────────
    const summaryHeight = 52;
    ensureSpace(summaryHeight);
    greyBars(y, ['Estimate Amount in Words:', 'Summary:']);
    doc.rect(left, y, CONTENT_WIDTH, summaryHeight).stroke(BORDER);
    doc.moveTo(left + colWidth, y).lineTo(left + colWidth, y + summaryHeight).stroke(BORDER);
    doc.font('Body').fontSize(8.5).fillColor(BORDER).text(amountInWords(data.totalAmount), left + 6, y + 23, { width: innerW, height: 26, ellipsis: true });
    doc.font('Body-Bold').fontSize(9).text('Total', rx, y + 25, { width: innerW / 2, lineBreak: false });
    doc.text(rupee(data.totalAmount), rx + innerW / 2, y + 25, { width: innerW / 2, align: 'right', lineBreak: false });
    y += summaryHeight + 0.4;

    // ── 6. Notes / Terms ──────────────────────────────────────────────────
    const terms = [sanitize(data.notes), sanitize(data.company.defaultTermsAndConditions)].filter(Boolean).join('\n');
    if (terms) {
      doc.font('Body').fontSize(8.5);
      const termsH = Math.max(36, Math.ceil(doc.heightOfString(terms, { width: CONTENT_WIDTH - 12 }) + 26));
      ensureSpace(termsH);
      greyBars(y, ['Notes & Terms:']);
      doc.rect(left, y, CONTENT_WIDTH, termsH).stroke(BORDER);
      doc.font('Body').fontSize(8.5).fillColor(BORDER).text(terms, left + 6, y + 22, { width: CONTENT_WIDTH - 12 });
      y += termsH + 0.4;
    }

    // ── 7. Bank Details / Signature ───────────────────────────────────────
    const signHeight = 88;
    ensureSpace(signHeight);
    greyBars(y, ['Bank Details:', '']);
    doc.rect(left, y, CONTENT_WIDTH, signHeight).stroke(BORDER);
    doc.moveTo(left + colWidth, y).lineTo(left + colWidth, y + signHeight).stroke(BORDER);
    labelValue('Name: ', sanitize(data.company.bankName), left + 6, y + 23, innerW);
    labelValue('Account No.: ', sanitize(data.company.bankAccountNumber), left + 6, y + 36, innerW);
    labelValue('IFSC code: ', sanitize(data.company.bankIfsc), left + 6, y + 49, innerW);
    labelValue("Account Holder's Name: ", sanitize(data.company.bankAccountHolderName), left + 6, y + 62, innerW);
    const signX = left + colWidth;
    doc.font('Body').fontSize(8.5).fillColor(BORDER);
    doc.text(oneLine(`For ${sanitize(data.company.companyName) || 'Company'}:`, colWidth - 12), signX + 6, y + 4, { width: colWidth - 12, align: 'center', lineBreak: false });
    const sigBuf = dataUrlToBuffer(data.company.signatureUrl);
    if (sigBuf) {
      try {
        doc.image(sigBuf, signX + (colWidth - 110) / 2, y + 20, { fit: [110, 45], align: 'center', valign: 'center' });
      } catch {
        // Corrupt/unsupported image — leave the signature space blank.
      }
    }
    doc.font('Body-Bold').fontSize(8.5).text('Authorized Signatory', signX, y + signHeight - 16, { width: colWidth, align: 'center', lineBreak: false });

    doc.end();
  });
}
