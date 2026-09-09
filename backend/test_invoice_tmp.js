const PDFDocument = require('pdfkit');
const fs = require('fs');

function sanitizePdfText(value) {
  return String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim();
}

async function generateInvoicePdf(params) {
  const amount = Number.isFinite(params.amount) ? params.amount : 0;
  const doc = new PDFDocument({ size: 'A4', margin: 50, compress: false });
  const chunks = [];
  return await new Promise((resolve, reject) => {
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    doc.rect(50, 50, 495, 60).fill('#1a1a2e');
    doc.fillColor('white').font('Helvetica-Bold').fontSize(22).text('TAX INVOICE', 60, 68);
    doc.fillColor('#cccccc').font('Helvetica').fontSize(10).text('RarePrint — Dispatch Invoice', 60, 95);

    doc.fillColor('black').rect(50, 125, 495, 90).stroke('#cccccc');
    doc.font('Helvetica-Bold').fontSize(11);
    doc.text('Invoice No:', 65, 140);
    doc.text('Order No:', 65, 158);
    doc.text('Date:', 65, 176);
    doc.text('Bill To:', 65, 194);
    doc.font('Helvetica').fontSize(11);
    doc.text(sanitizePdfText(params.invoiceNo), 160, 140);
    doc.text(sanitizePdfText(params.orderNumber), 160, 158);
    doc.text(sanitizePdfText(params.date), 160, 176);
    doc.text(sanitizePdfText(params.customerName).slice(0, 50), 160, 194);

    doc.rect(50, 230, 495, 28).fill('#f0f0f0').stroke('#cccccc');
    doc.fillColor('black').font('Helvetica-Bold').fontSize(11);
    doc.text('Description', 65, 239);
    doc.text('Qty', 320, 239);
    doc.text('Amount (INR)', 390, 239);

    doc.rect(50, 258, 495, 32).stroke('#cccccc');
    doc.font('Helvetica').fontSize(11);
    doc.text('Print Order / Stationery', 65, 268);
    doc.text('1', 320, 268);
    doc.text(amount.toFixed(2), 390, 268);

    doc.rect(50, 290, 495, 32).fill('#f8f8f8').stroke('#cccccc');
    doc.fillColor('black').font('Helvetica-Bold').fontSize(12);
    doc.text('TOTAL', 65, 300);
    doc.text(`INR ${amount.toFixed(2)}`, 390, 300);

    let footerY = 350;
    const notesText = sanitizePdfText(params.notes ?? '');
    if (notesText) {
      const notesY = 330;
      doc.rect(50, notesY, 495, 45).stroke('#cccccc');
      doc.fillColor('black').font('Helvetica-Bold').fontSize(10).text('Notes:', 60, notesY + 8);
      doc.font('Helvetica').fontSize(9).text(notesText.slice(0, 300), 60, notesY + 21, { width: 475, height: 20, ellipsis: true });
      footerY = notesY + 55;
    }

    doc.fillColor('#666666').font('Helvetica').fontSize(8);
    doc.text('This is a system-generated invoice for courier dispatch purposes.', 50, footerY, { align: 'center', width: 495 });
    doc.text('RarePrint — Print Solutions', 50, footerY + 12, { align: 'center', width: 495 });

    doc.end();
  });
}

(async () => {
  const withNotes = await generateInvoicePdf({
    invoiceNo: 'RP1234', orderNumber: 'ORD-1234', customerName: 'Test Customer',
    amount: 1500, date: '2026-08-14',
    notes: 'Please pack carefully, fragile items inside. Deliver before 6pm.',
  });
  fs.writeFileSync('/tmp/invoice_with_notes.pdf', withNotes);

  const withoutNotes = await generateInvoicePdf({
    invoiceNo: 'RP1235', orderNumber: 'ORD-1235', customerName: 'Test Customer 2',
    amount: 2200, date: '2026-08-14',
  });
  fs.writeFileSync('/tmp/invoice_without_notes.pdf', withoutNotes);

  console.log('Generated both PDFs OK');
})().catch(e => { console.error('FAILED', e); process.exit(1); });
