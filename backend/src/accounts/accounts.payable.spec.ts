/**
 * BUSINESS RULE: Accounts > Payable card == Billing > Sundry Creditors total
 *
 * Payable = non-cancelled purchase bills' unpaid balance − "on account"
 * vendor payments (no bill, or bill later cancelled) − ISSUED vendor notes.
 * Both screens use common/vendor-payable.ts. Customer notes must not touch it.
 *
 * If these tests fail after a code change, the two screens show different
 * amounts owed to vendors.
 */

import { AccountsService } from './accounts.service';
import { BillingService } from '../billing/billing.service';
import { LIVE_PURCHASE_BILL_WHERE, ON_ACCOUNT_VENDOR_PAYMENT_WHERE } from '../common/vendor-payable';

const bills = [
  { totalAmount: 10000, paidAmount: 4000, balanceAmount: 6000, taxAmount: 0 },
  { totalAmount: 2500.5, paidAmount: 0, balanceAmount: 2500.5, taxAmount: 0 },
];
const notes = [
  { noteType: 'DEBIT_NOTE', totalAmount: 500.2, taxAmount: 0, vendorId: 'v1' },
  { noteType: 'CREDIT_NOTE', totalAmount: 999, taxAmount: 0, vendorId: null }, // customer note
];

function accountsWith(onAccount: number) {
  const prisma = {
    invoice: { findMany: jest.fn().mockResolvedValue([]) },
    purchaseBill: { findMany: jest.fn().mockResolvedValue(bills) },
    accountingNote: { findMany: jest.fn().mockResolvedValue(notes) },
    accountingLedgerEntry: { findMany: jest.fn().mockResolvedValue([]) },
    vendorPayment: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: onAccount } }) },
  };
  const service = new AccountsService(prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
  return { service, prisma };
}

describe('AccountsService.getAccountingSummary — payable', () => {
  it('deducts on-account payments and vendor notes only', async () => {
    const { service, prisma } = accountsWith(1000.1);
    const { purchases } = await service.getAccountingSummary();
    // 8500.50 − 1000.10 − 500.20 (customer note ignored) = 7000.20
    expect(purchases).toMatchObject({ billCount: 2, total: 12500.5, paid: 5000.1, payable: 7000.2 });
    expect(prisma.purchaseBill.findMany.mock.calls[0][0].where).toBe(LIVE_PURCHASE_BILL_WHERE);
    expect(prisma.vendorPayment.aggregate.mock.calls[0][0].where).toBe(ON_ACCOUNT_VENDOR_PAYMENT_WHERE);
  });

  it('is unchanged from the old bills-only figure when there are no on-account payments or vendor notes', async () => {
    const { service } = accountsWith(0);
    (service as any).prisma.accountingNote.findMany.mockResolvedValue([notes[1]]);
    const { purchases } = await service.getAccountingSummary();
    expect(purchases.payable).toBe(8500.5);
    expect(purchases.paid).toBe(4000);
  });

  it('matches the Sundry Creditors total for the same data', async () => {
    const { service } = accountsWith(1000.1);
    const { purchases } = await service.getAccountingSummary();

    const billing = new BillingService({
      vendor: { findMany: jest.fn().mockResolvedValue([{
        id: 'v1', name: 'PAPER CO', phone: null, gstNumber: null, isActive: true, isPress: false,
        purchaseBills: bills, vendorPayments: [{ amount: 1000.1 }], creditDebitNotes: [{ totalAmount: 500.2 }],
      }]) },
      employee: { findMany: jest.fn().mockResolvedValue([]) },
      bankTransaction: { groupBy: jest.fn().mockResolvedValue([]) },
    } as any, {} as any);
    const { vendors } = await billing.listCreditors({ role: 'ADMIN' });
    expect(vendors.reduce((s, v) => s + v.balanceDue, 0)).toBe(purchases.payable);
  });
});
