/**
 * BUSINESS RULE: one party, several Customer rows (Billing > Parties)
 *
 * The same party can exist as several Customer rows whose phone is the same
 * number in different formats ("9140580244" vs "+91 91405 80244"). The
 * Parties list and the party statement must treat rows as ONE party (one list
 * row with combined totals, a statement covering all its rows) only when:
 *   - the phone normalises (sanitizePhone) to the same 10-digit number,
 *   - the name matches ignoring case, spaces and punctuation, and
 *   - their GSTINs don't conflict (a blank GSTIN doesn't block the match).
 * Different businesses sharing one number, and rows without a valid 10-digit
 * phone, are never grouped.
 *
 * If these tests fail after a code change, duplicate parties will reappear
 * in Billing > Parties, different parties will be merged, or a party
 * statement will miss invoices.
 */

import { BillingService } from './billing.service';

type Cust = { id: string; businessName: string; phone: string | null; gstNumber: string | null };

const invoice = (id: string, customer: Cust, total: number, paid: number) => ({
  id,
  totalAmount: total,
  paidAmount: paid,
  balanceAmount: total - paid,
  order: { customer },
});

const CLEAN: Cust = { id: 'c-clean', businessName: 'HUSSAIN DAWA KENDRA', phone: '9140580244', gstNumber: null };
const DUP: Cust = { id: 'c-dup', businessName: 'HUSSAIN DAWA KENDRA ', phone: '+91 91405 80244', gstNumber: null };
const SAME_NO_OTHER_SHOP: Cust = { id: 'c-shop', businessName: 'CITY MEDICALS', phone: '91405 80244', gstNumber: null };

function serviceWith(prisma: any) {
  return new BillingService(prisma, {} as any);
}

const list = (invoices: any[]) => serviceWith({ invoice: { findMany: jest.fn().mockResolvedValue(invoices) } }).listParties();

describe('listParties — same party saved with different phone formats', () => {
  it('shows two rows with the same number in different formats as one party with combined totals', async () => {
    const parties = await list([invoice('i1', CLEAN, 8500, 1000), invoice('i2', DUP, 12500, 12500)]);
    expect(parties).toHaveLength(1);
    expect(parties[0]).toMatchObject({
      customerId: 'c-clean', phone: '9140580244',
      totalBilled: 21000, totalReceived: 13500, balanceDue: 7500, invoiceCount: 2,
    });
  });

  it('represents the party by the row whose phone is stored as plain 10 digits, whichever comes first', async () => {
    const [party] = await list([invoice('i2', DUP, 12500, 12500), invoice('i1', CLEAN, 8500, 1000)]);
    expect(party.customerId).toBe('c-clean');
    expect(party.customerName).toBe('HUSSAIN DAWA KENDRA');
  });

  it('matches names ignoring case, spaces and punctuation', async () => {
    const lower: Cust = { id: 'c-lower', businessName: 'Hussain  Dawa-Kendra.', phone: '09140580244', gstNumber: null };
    expect(await list([invoice('i1', CLEAN, 100, 0), invoice('i2', lower, 100, 0)])).toHaveLength(1);
  });

  it('merges when one row has a GSTIN and the other is blank', async () => {
    const withGst: Cust = { ...DUP, gstNumber: '27AAAAA0000A1Z5' };
    expect(await list([invoice('i1', CLEAN, 100, 0), invoice('i2', withGst, 100, 0)])).toHaveLength(1);
  });
});

describe('listParties — different parties are never merged', () => {
  it('keeps two different businesses that share one phone number apart', async () => {
    const parties = await list([invoice('i1', CLEAN, 8500, 1000), invoice('i3', SAME_NO_OTHER_SHOP, 3000, 0)]);
    expect(parties).toHaveLength(2);
    expect(parties.map((p) => p.customerName).sort()).toEqual(['CITY MEDICALS', 'HUSSAIN DAWA KENDRA']);
  });

  it('keeps same name + number apart when the GSTINs differ', async () => {
    const gstA: Cust = { ...CLEAN, gstNumber: '27AAAAA0000A1Z5' };
    const gstB: Cust = { ...DUP, gstNumber: '27BBBBB0000B1Z5' };
    expect(await list([invoice('i1', gstA, 100, 0), invoice('i2', gstB, 100, 0)])).toHaveLength(2);
  });

  it('with two different GSTINs under one name+number, a blank-GSTIN row joins neither', async () => {
    const gstA: Cust = { ...CLEAN, gstNumber: '27AAAAA0000A1Z5' };
    const gstB: Cust = { ...DUP, gstNumber: '27BBBBB0000B1Z5' };
    const blank: Cust = { id: 'c-blank', businessName: 'HUSSAIN DAWA KENDRA', phone: '9140580244', gstNumber: '' };
    expect(await list([invoice('i1', gstA, 100, 0), invoice('i2', gstB, 100, 0), invoice('i3', blank, 100, 0)])).toHaveLength(3);
  });

  it('keeps different numbers, and rows without a valid phone, as separate parties', async () => {
    const noPhoneA: Cust = { id: 'n1', businessName: 'WALK IN', phone: null, gstNumber: null };
    const noPhoneB: Cust = { id: 'n2', businessName: 'WALK IN', phone: null, gstNumber: null };
    const shortPhone: Cust = { id: 's1', businessName: 'SHORT', phone: '12345', gstNumber: null };
    const other: Cust = { id: 'o1', businessName: 'OTHER', phone: '9876543210', gstNumber: null };
    expect(await list([
      invoice('a', CLEAN, 100, 0), invoice('b', other, 100, 0),
      invoice('c', noPhoneA, 100, 0), invoice('d', noPhoneB, 100, 0), invoice('e', shortPhone, 100, 0),
    ])).toHaveLength(5);
  });
});

describe('getPartyLedger — statement covers exactly the rows of the party', () => {
  function ledgerPrisma(customer: Cust, candidates: Cust[]) {
    return {
      customer: { findUnique: jest.fn().mockResolvedValue(customer) },
      $queryRaw: jest.fn().mockResolvedValue(candidates),
      invoice: { findMany: jest.fn().mockResolvedValue([]) },
      payment: { findMany: jest.fn().mockResolvedValue([]) },
      systemConfig: { findMany: jest.fn().mockResolvedValue([]) },
    };
  }
  const customerIdFilter = (prisma: ReturnType<typeof ledgerPrisma>) => ({
    invoices: prisma.invoice.findMany.mock.calls[0][0].where.order.customerId,
    payments: prisma.payment.findMany.mock.calls[0][0].where.order.customerId,
  });

  it('loads invoices and receipts for every row of the same party only', async () => {
    // "19140580244" ends with the same digits but normalises to a different
    // number; CITY MEDICALS shares the number but is a different business.
    const falseSuffix: Cust = { id: 'c-other', businessName: 'HUSSAIN DAWA KENDRA', phone: '19140580244', gstNumber: null };
    const prisma = ledgerPrisma(DUP, [CLEAN, DUP, falseSuffix, SAME_NO_OTHER_SHOP]);
    await serviceWith(prisma).getPartyLedger('c-dup');
    const ids = { in: ['c-clean', 'c-dup'] };
    expect(customerIdFilter(prisma)).toEqual({ invoices: ids, payments: ids });
  });

  it('opened from the other business sharing the number, shows only that business', async () => {
    const prisma = ledgerPrisma(SAME_NO_OTHER_SHOP, [CLEAN, DUP, SAME_NO_OTHER_SHOP]);
    await serviceWith(prisma).getPartyLedger('c-shop');
    expect(customerIdFilter(prisma).invoices).toEqual({ in: ['c-shop'] });
  });

  it('uses only the party itself when it has no valid phone (no lookup)', async () => {
    const prisma = ledgerPrisma({ id: 'n1', businessName: 'WALK IN', phone: null, gstNumber: null }, []);
    await serviceWith(prisma).getPartyLedger('n1');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(customerIdFilter(prisma).invoices).toEqual({ in: ['n1'] });
  });
});
