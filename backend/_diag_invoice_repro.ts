import * as fs from 'fs';
import { buildInvoicePdf, InvoicePdfData } from './src/billing/invoice-pdf';

const data: InvoicePdfData = {
  invoiceNumber: 'INV-TEST-0001',
  issueDate: '27-08-2026',
  gstTreatment: 'INTRA_STATE',
  subtotal: 9500,
  totalAmount: 9500,
  paidAmount: 0,
  balanceAmount: 9500,
  previousBalance: 0,
  currentBalance: 9500,
  agentName: 'SANKET',
  termsAndConditions: 'Goods once sold will not be taken back. Subject to Nagpur jurisdiction.',
  customerName: 'Test Customer Pvt Ltd',
  customerAddress: '123 Test Road, Nagpur, Maharashtra, 440001',
  customerPhone: '9999999999',
  customerState: 'Maharashtra',
  customerGstin: '',
  items: [
    {
      productName: 'ENVELOPE',
      hsnSac: '4820',
      quantity: 5000,
      unit: 'PCS',
      unitPrice: 1.9,
      gstRatePct: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      taxableAmount: 9500,
      lineTotal: 9500,
    },
  ],
  company: {
    companyName: 'RarePrint',
    companyAddress: 'Ajni Nagar, Near Meera Tiles, Nagpur, Maharashtra',
    companyPhone: '9999999999',
    companyEmail: 'info@rareprint.in',
    companyGstin: '',
    companyState: 'Maharashtra',
    bankName: 'Test Bank',
    bankAccountNumber: '000111222333',
    bankIfsc: 'TEST0000001',
    bankAccountHolderName: 'RarePrint',
    defaultTermsAndConditions: 'Goods once sold will not be taken back.',
    logoUrl: null,
    signatureUrl: null,
  },
};

buildInvoicePdf(data).then((buf) => {
  fs.writeFileSync('/tmp/repro_invoice.pdf', buf);
  console.log('wrote /tmp/repro_invoice.pdf', buf.length, 'bytes');
}).catch((e) => {
  console.error('FAILED', e);
  process.exit(1);
});
