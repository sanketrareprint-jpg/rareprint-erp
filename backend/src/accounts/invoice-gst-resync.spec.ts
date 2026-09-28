/**
 * BUSINESS RULE: invoice GST on edit / cancellation re-sync
 * (reconcileInvoiceToRemainingItems — runs the real method on a mocked tx).
 *
 * RULE 1 — Order rates include GST: totals never change because of GST.
 * RULE 2 — A product already on the invoice keeps the GST % it was billed at
 *   (an old 0% invoice stays 0% even if the product now has 18%).
 * RULE 3 — A product newly added to the invoice uses the product's current rate.
 * RULE 4 — Any GST change posts a Sales / Output GST ADJUSTMENT pair.
 */
import { AccountsService } from './accounts.service';

function makeTx(existingLines: { sku: string; gstRatePct: number }[]) {
  const ledger: any[] = [];
  const created: any[] = [];
  let invoiceUpdate: any = null;
  const tx = {
    invoiceItem: {
      findMany: jest.fn(async () => existingLines),
      deleteMany: jest.fn(async () => ({})),
      create: jest.fn(async ({ data }: any) => { created.push(data); return data; }),
    },
    invoice: {
      update: jest.fn(async ({ data }: any) => { invoiceUpdate = data; return data; }),
      findUnique: jest.fn(async () => invoiceUpdate),
    },
    accountingLedgerEntry: {
      create: jest.fn(async ({ data }: any) => { ledger.push(data); return data; }),
      createMany: jest.fn(async ({ data }: any) => { ledger.push(...data); return data; }),
    },
  };
  return { tx, ledger, created, getInvoice: () => invoiceUpdate };
}

const service = Object.create(AccountsService.prototype) as any;
const order = { id: 'o1', customerId: 'c1', shippingCharge: 0 };
const envelope = (gstRatePct: number) => ({
  quantity: 60000, unitPrice: 0.75, lineDiscount: 0, lineTotal: 45000, productionNotes: null,
  product: { name: 'ENVELOPE 4*7', sku: 'ENV-4X7', hsnCode: '4817', gstRatePct },
});
const invoice = (taxAmount: number) => ({
  id: 'inv1', invoiceNumber: '1717', gstTreatment: 'INTER_STATE',
  totalAmount: 45000, discountAmount: 0, paidAmount: 25000, taxAmount,
});

describe('invoice re-sync keeps GST correct', () => {
  it('old 0% line stays 0% after the product gets 18% (no ledger adjustment)', async () => {
    const { tx, ledger, created, getInvoice } = makeTx([{ sku: 'ENV-4X7', gstRatePct: 0 }]);
    await service.reconcileInvoiceToRemainingItems(tx, invoice(0), order, [envelope(18)], 'Order edited and re-approved');
    expect(created[0]).toMatchObject({ gstRatePct: 0, taxableAmount: 45000, igstAmount: 0 });
    expect(getInvoice()).toMatchObject({ totalAmount: 45000, taxAmount: 0, balanceAmount: 20000 });
    expect(ledger).toHaveLength(0);
  });

  it('newly added product uses current 18% — total unchanged, GST carved out, ledger adjusted', async () => {
    const { tx, ledger, created, getInvoice } = makeTx([]);
    await service.reconcileInvoiceToRemainingItems(tx, invoice(0), order, [envelope(18)], 'Order edited and re-approved');
    expect(created[0]).toMatchObject({ gstRatePct: 18, taxableAmount: 38135.59, igstAmount: 6864.41, lineTotal: 45000 });
    expect(getInvoice()).toMatchObject({ totalAmount: 45000, taxableAmount: 38135.59, taxAmount: 6864.41, balanceAmount: 20000 });
    expect(ledger).toEqual([
      expect.objectContaining({ entryType: 'ADJUSTMENT', accountName: 'Sales', debitAmount: 6864.41, creditAmount: 0 }),
      expect.objectContaining({ entryType: 'ADJUSTMENT', accountName: 'Output GST', debitAmount: 0, creditAmount: 6864.41 }),
    ]);
  });

  it('cancelling a GST item reverses its GST and posts a credit note for the total', async () => {
    const { tx, ledger, getInvoice } = makeTx([{ sku: 'ENV-4X7', gstRatePct: 18 }]);
    await service.reconcileInvoiceToRemainingItems(tx, invoice(6864.41), order, [], 'Whole order cancelled');
    expect(getInvoice()).toMatchObject({ totalAmount: 0, taxAmount: 0 });
    expect(ledger).toEqual([
      expect.objectContaining({ accountName: 'Sales', debitAmount: 0, creditAmount: 6864.41 }),
      expect.objectContaining({ accountName: 'Output GST', debitAmount: 6864.41, creditAmount: 0 }),
      expect.objectContaining({ entryType: 'CREDIT_NOTE', creditAmount: 45000 }),
    ]);
  });
});
