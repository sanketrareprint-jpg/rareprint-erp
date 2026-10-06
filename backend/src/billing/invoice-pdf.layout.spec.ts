/**
 * BUSINESS RULE: fixed "pre-printed" invoice layout (Billing > invoice PDF)
 *
 * Every invoice page has the same header at the top, the same Terms And
 * Conditions + Bank Details boxes pinned to the bottom, and a fixed-size item
 * box between them holding a fixed number of rows. Invoices with more items
 * continue onto further pages with the same frame; totals print on the last
 * page only.
 *
 * If these tests fail after a code change, invoices will paginate wrongly
 * (items lost or squeezed) or the Tax Summary block will no longer line up
 * with the pinned Terms row.
 */

import { buildInvoicePdf, InvoicePdfData } from './invoice-pdf';

const TERMS = [
  '1. Shipping/Transportation charges, if any, shall be extra as actual.',
  '2. Goods once sold will not be taken back or exchanged, except in case of manufacturing defect or damage in transit.',
  '3. Damaged/defective goods will be replaced only if reported within 3 days of delivery, along with photographic proof.',
  '4. Payment due within15 days from the date of delivery; interest @18% p.a. will be charged on delayed payments.',
  '5. Interest and legal costs, if any, incurred in recovery of dues shall be borne by the buyer.',
  '6. Goods remain the property of the seller until full payment is received.',
  '7. Subject to Chandrapur jurisdiction only.',
  '8. E. & O.E. (Errors and Omissions Excepted).',
].join('\n');

function invoice(itemCount: number, hsnCount = 1, terms = TERMS): InvoicePdfData {
  const items = Array.from({ length: itemCount }, (_, i) => ({
    productName: `PRODUCT ${i + 1}`,
    hsnSac: String(4911 + (i % hsnCount)),
    productDetails: 'Size: A4, GSM: 130, Paper: Art, Sides: Single',
    size: 'A4',
    quantity: 100,
    unit: 'PCS',
    unitPrice: 10,
    gstRatePct: 18,
    cgstAmount: 90,
    sgstAmount: 90,
    igstAmount: 0,
    taxableAmount: 1000,
    lineTotal: 1180,
  }));
  const total = items.reduce((sum, item) => sum + item.lineTotal, 0);
  return {
    invoiceNumber: 'RP/TEST/1',
    issueDate: '05/10/2026',
    gstTreatment: 'INTRA_STATE',
    subtotal: total,
    totalAmount: total,
    paidAmount: 0,
    balanceAmount: total,
    previousBalance: 0,
    currentBalance: total,
    agentName: 'AGENT',
    termsAndConditions: terms,
    customerName: 'CUSTOMER',
    customerAddress: 'THANE, MAHARASHTRA, 401107',
    customerPhone: '9999999999',
    customerState: 'MAHARASHTRA',
    customerGstin: '',
    items,
    company: {
      companyName: 'RAREPRINT.IN',
      companyAddress: 'CHANDRAPUR, MAHARASHTRA 442402',
      companyPhone: '9999999999',
      companyEmail: 'test@example.com',
      companyGstin: '27AAAAA0000A1Z5',
      companyState: 'Maharashtra',
      bankName: 'IDBI BANK',
      bankAccountNumber: '0000000000000000',
      bankIfsc: 'IBKL0000000',
      bankAccountHolderName: 'RAREPRINT IN',
      defaultTermsAndConditions: terms,
      logoUrl: null,
      signatureUrl: null,
    },
  };
}

// Counts page objects ("/Type /Page", not "/Type /Pages") in the PDF.
function pageCount(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type \/Page(?!s)/g) ?? []).length;
}

describe('invoice PDF fixed layout', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  it.each([
    [0, 1],
    [1, 1],
    [7, 1],
    [8, 2],
    [14, 2],
    [15, 3],
    [25, 4],
  ])('%i items with 8 terms lines -> %i page(s) (7 rows per page)', async (items, pages) => {
    expect(pageCount(await buildInvoicePdf(invoice(items)))).toBe(pages);
  });

  it('fits more rows per page when the terms are shorter', async () => {
    expect(pageCount(await buildInvoicePdf(invoice(8, 1, '')))).toBe(1);
  });

  it.each([1, 2, 4, 6, 9])('Tax Summary block ends exactly where the layout reserved (%i HSN codes)', async (hsnCount) => {
    await buildInvoicePdf(invoice(hsnCount * 2, hsnCount));
    expect(warn).not.toHaveBeenCalled();
  });
});
