/**
 * BUSINESS RULE: one party = one phone number (Billing > Parties)
 *
 * The same party can exist as several Customer rows whose phone is the same
 * number in different formats ("9140580244" vs "+91 91405 80244"). The
 * Parties list and the party statement must treat every row whose phone
 * normalises (sanitizePhone) to the same 10-digit number as ONE party:
 * one list row with combined totals, and a statement covering all its rows.
 * Rows without a valid 10-digit phone are never grouped.
 *
 * If these tests fail after a code change, duplicate parties will reappear
 * in Billing > Parties or a party statement will miss invoices.
 */

import { BillingService } from './billing.service';

const invoice = (id: string, customer: { id: string; businessName: string; phone: string | null }, total: number, paid: number) => ({
  id,
  totalAmount: total,
  paidAmount: paid,
  balanceAmount: total - paid,
  order: { customer },
});

const CLEAN = { id: 'c-clean', businessName: 'HUSSAIN DAWA KENDRA', phone: '9140580244' };
const DUP = { id: 'c-dup', businessName: 'HUSSAIN DAWA KENDRA ', phone: '+91 91405 80244' };

function serviceWith(prisma: any) {
  return new BillingService(prisma, {} as any);
}

describe('listParties — groups rows by normalised phone', () => {
  it('shows two rows with the same number in different formats as one party with combined totals', async () => {
    const svc = serviceWith({
      invoice: { findMany: jest.fn().mockResolvedValue([invoice('i1', CLEAN, 8500, 1000), invoice('i2', DUP, 12500, 12500)]) },
    });
    const parties = await svc.listParties();
    expect(parties).toHaveLength(1);
    expect(parties[0]).toMatchObject({
      customerId: 'c-clean', phone: '9140580244',
      totalBilled: 21000, totalReceived: 13500, balanceDue: 7500, invoiceCount: 2,
    });
  });

  it('represents the party by the row whose phone is stored as plain 10 digits, whichever comes first', async () => {
    const svc = serviceWith({
      invoice: { findMany: jest.fn().mockResolvedValue([invoice('i2', DUP, 12500, 12500), invoice('i1', CLEAN, 8500, 1000)]) },
    });
    const [party] = await svc.listParties();
    expect(party.customerId).toBe('c-clean');
    expect(party.customerName).toBe('HUSSAIN DAWA KENDRA');
  });

  it('keeps different numbers, and rows without a valid phone, as separate parties', async () => {
    const noPhoneA = { id: 'n1', businessName: 'WALK IN', phone: null };
    const noPhoneB = { id: 'n2', businessName: 'WALK IN', phone: null };
    const shortPhone = { id: 's1', businessName: 'SHORT', phone: '12345' };
    const other = { id: 'o1', businessName: 'OTHER', phone: '9876543210' };
    const svc = serviceWith({
      invoice: {
        findMany: jest.fn().mockResolvedValue([
          invoice('a', CLEAN, 100, 0), invoice('b', other, 100, 0),
          invoice('c', noPhoneA, 100, 0), invoice('d', noPhoneB, 100, 0), invoice('e', shortPhone, 100, 0),
        ]),
      },
    });
    expect(await svc.listParties()).toHaveLength(5);
  });
});

describe('getPartyLedger — statement covers every row of the party', () => {
  function ledgerPrisma(customer: any, candidates: any[]) {
    return {
      customer: { findUnique: jest.fn().mockResolvedValue(customer) },
      $queryRaw: jest.fn().mockResolvedValue(candidates),
      invoice: { findMany: jest.fn().mockResolvedValue([]) },
      payment: { findMany: jest.fn().mockResolvedValue([]) },
      systemConfig: { findMany: jest.fn().mockResolvedValue([]) },
    };
  }

  it('loads invoices and receipts for all rows with the same normalised phone, dropping false suffix matches', async () => {
    // "19140580244" ends with the same digits but normalises to a different number.
    const prisma = ledgerPrisma(DUP, [CLEAN, DUP, { id: 'c-other', phone: '19140580244' }]);
    await serviceWith(prisma).getPartyLedger('c-dup');
    const ids = ['c-clean', 'c-dup'];
    expect(prisma.invoice.findMany.mock.calls[0][0].where.order.customerId).toEqual({ in: ids });
    expect(prisma.payment.findMany.mock.calls[0][0].where.order.customerId).toEqual({ in: ids });
  });

  it('uses only the party itself when it has no valid phone (no lookup)', async () => {
    const prisma = ledgerPrisma({ id: 'n1', businessName: 'WALK IN', phone: null }, []);
    await serviceWith(prisma).getPartyLedger('n1');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.invoice.findMany.mock.calls[0][0].where.order.customerId).toEqual({ in: ['n1'] });
  });
});
