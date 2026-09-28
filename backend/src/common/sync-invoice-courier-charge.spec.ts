/**
 * BUSINESS RULE: courier charge taken from the customer is billed on the invoice
 *
 * RULE 1 — Invoice total and balance go up/down by exactly the courier change.
 * RULE 2 — The courier charge INCLUDES 18% GST, carved out into taxable/GST
 *   (IGST inter-state, CGST+SGST intra-state).
 * RULE 3 — Every change posts a balanced ledger set.
 * RULE 4 — No invoice yet, or nothing changed → nothing written.
 */
import { syncInvoiceCourierCharge, courierGstSplit } from './sync-invoice-courier-charge';

function makeDb(invoice: any, shipments: { courierChargeCollected: number | null }[]) {
  const ledger: any[] = [];
  let updated: any = null;
  const db: any = {
    invoice: {
      findUnique: jest.fn(async () => invoice),
      update: jest.fn(async ({ data }: any) => { updated = data; return { ...invoice, ...data }; }),
    },
    shipment: { findMany: jest.fn(async () => shipments) },
    accountingLedgerEntry: { createMany: jest.fn(async ({ data }: any) => { ledger.push(...data); return data; }) },
  };
  return { db, ledger, getUpdate: () => updated };
}

// Invoice 1635-style: ₹1,500 of goods at 0% GST, fully paid, no courier yet.
const baseInvoice = (over: any = {}) => ({
  id: 'inv', invoiceNumber: '1635', courierCharge: 0, gstTreatment: 'INTER_STATE',
  totalAmount: 1500, balanceAmount: 0, taxableAmount: 1500, taxAmount: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0,
  order: { customerId: 'c1' }, ...over,
});

const balanced = (ledger: any[]) => Math.round(ledger.reduce((s, l) => s + l.debitAmount - l.creditAmount, 0) * 100) / 100 + 0;

describe('courier charge on the invoice (incl. 18% GST)', () => {
  it('₹500 courier, inter-state: total +500, balance +500, IGST 76.27, ledger balanced', async () => {
    const { db, ledger, getUpdate } = makeDb(baseInvoice(), [{ courierChargeCollected: 500 }]);
    await syncInvoiceCourierCharge(db, 'o1');
    expect(getUpdate()).toEqual({
      courierCharge: 500, totalAmount: 2000, balanceAmount: 500,
      taxableAmount: 1923.73, taxAmount: 76.27, cgstAmount: 0, sgstAmount: 0, igstAmount: 76.27,
    });
    expect(ledger).toEqual([
      expect.objectContaining({ entryType: 'DEBIT_NOTE', accountName: 'Customer Receivable', debitAmount: 500, creditAmount: 0 }),
      expect.objectContaining({ entryType: 'ADJUSTMENT', accountName: 'Courier Charges', debitAmount: 0, creditAmount: 423.73 }),
      expect.objectContaining({ entryType: 'GST', accountName: 'Output GST', debitAmount: 0, creditAmount: 76.27 }),
    ]);
    expect(balanced(ledger)).toBe(0);
  });

  it('intra-state splits the courier GST into CGST + SGST', () => {
    expect(courierGstSplit(500, 'INTRA_STATE')).toEqual({ gstRatePct: 18, taxableAmount: 423.73, taxAmount: 76.27, cgstAmount: 38.14, sgstAmount: 38.13, igstAmount: 0 });
  });

  it('several parcels add up; lowering the charge moves everything back down', async () => {
    const inv = baseInvoice({ courierCharge: 500, totalAmount: 2000, balanceAmount: 500, taxableAmount: 1923.73, taxAmount: 76.27, igstAmount: 76.27 });
    const { db, ledger, getUpdate } = makeDb(inv, [{ courierChargeCollected: 200 }, { courierChargeCollected: 100 }]);
    await syncInvoiceCourierCharge(db, 'o1');
    expect(getUpdate()).toMatchObject({ courierCharge: 300, totalAmount: 1800, balanceAmount: 300, taxableAmount: 1754.24, taxAmount: 45.76, igstAmount: 45.76 });
    expect(ledger[0]).toMatchObject({ entryType: 'CREDIT_NOTE', creditAmount: 200 });
    expect(balanced(ledger)).toBe(0);
  });

  it('no invoice yet, or charge unchanged → nothing written', async () => {
    const none = makeDb(null, [{ courierChargeCollected: 500 }]);
    expect(await syncInvoiceCourierCharge(none.db, 'o1')).toBeNull();
    const same = makeDb(baseInvoice({ courierCharge: 500 }), [{ courierChargeCollected: 500 }]);
    await syncInvoiceCourierCharge(same.db, 'o1');
    expect(same.db.invoice.update).not.toHaveBeenCalled();
    expect(same.ledger).toHaveLength(0);
  });
});
