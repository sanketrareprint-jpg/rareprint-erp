// Temporary diagnostic script (not part of the app) — constructs an
// InvoicePdfData matching the reference PDF (uploads/Invoice_1542 (32).pdf)
// as closely as possible, so pdftotext -bbox-layout output can be diffed
// value-run-by-value-run against the reference for the reported "values
// sitting too low" bug. Mirrors the existing _diag_invoice_repro.ts pattern.
import * as fs from 'fs';
import { buildInvoicePdf, InvoicePdfData } from './src/billing/invoice-pdf';

const data: InvoicePdfData = {
  invoiceNumber: '1542',
  issueDate: '20/08/2026',
  gstTreatment: 'INTRA_STATE',
  subtotal: 2500,
  totalAmount: 2500,
  paidAmount: 1000,
  balanceAmount: 1500,
  previousBalance: 0,
  currentBalance: 1500,
  agentName: 'VAISHALI DHAKATE',
  termsAndConditions: 'Goods once sold will not be taken back. Subject to Nagpur jurisdiction.',
  customerName: 'MAHARASHTRA MEDICAL STORE',
  customerAddress: 'VITTHAL RUKHMINI MANDIR,WARD NO 1,BUS STAND AT POST TUKUM CHANDRAPUR,CHANDRAPUR,MAHARASHTRA,442401',
  customerPhone: '9421773374',
  customerState: 'MAHARASHTRA',
  customerGstin: '-',
  items: [
    {
      productName: 'STICKER',
      hsnSac: '-',
      quantity: 20000,
      unit: 'PCS',
      unitPrice: 0.13,
      gstRatePct: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      taxableAmount: 2500,
      lineTotal: 2500,
    },
  ],
  company: {
    companyName: 'RAREPRINT.IN',
    companyAddress: 'RAREPRINT.IN, BEHIND NUTAN GYM, TUKDOJI CHOWK, GHUTKALA WARD, CHANDRAPUR,',
    companyPhone: '9637318960',
    companyEmail: 'sales.rareprint@gmail.com',
    companyGstin: '27GEKPP2259Q1ZI',
    companyState: 'Maharashtra',
    bankName: 'IDBI BANK',
    bankAccountNumber: '0513102000013378',
    bankIfsc: 'IBKL0000513',
    bankAccountHolderName: 'RAREPRINT IN',
    defaultTermsAndConditions: 'Goods once sold will not be taken back. Subject to Nagpur jurisdiction.',
    logoUrl: null,
    signatureUrl: null,
  },
};

buildInvoicePdf(data).then((buf) => {
  fs.writeFileSync('/tmp/test-invoice-current.pdf', buf);
  console.log('wrote /tmp/test-invoice-current.pdf', buf.length, 'bytes');
}).catch((e) => {
  console.error('FAILED', e);
  process.exit(1);
});
