/**
 * BUSINESS RULE: Sundry Creditors (Billing > Parties > Sundry Creditors)
 *
 *   - Vendors/suppliers: Billed = non-cancelled purchase bills; Paid = those
 *     bills' paid amounts + "on account" payments (no bill, or bill later
 *     cancelled); Balance = Billed − Paid − issued vendor notes (negative =
 *     advance). Inactive vendors with nothing on record are hidden.
 *   - Employees: listed with no balance; Salary Paid = bank transactions
 *     tagged to the employee's login (salaryForUserId) + those tagged to the
 *     employee directly (salaryForEmployeeId, when there is no login).
 *     Tagged logins with no Employee record still appear, except the
 *     superadmin (owner's own pay).
 *   - Only ADMIN / ACCOUNTS / the superadmin may see it.
 *
 * If these tests fail after a code change, vendor payables or salary
 * payouts shown under Sundry Creditors are wrong or hidden.
 */

import { ForbiddenException } from '@nestjs/common';
import { BillingService } from './billing.service';

function serviceWith(vendors: any[], employees: any[], salaryRows: any[], users: any[] = [], employeeSalaryRows: any[] = []) {
  const prisma = {
    vendor: { findMany: jest.fn().mockResolvedValue(vendors) },
    employee: { findMany: jest.fn().mockResolvedValue(employees) },
    bankTransaction: {
      groupBy: jest.fn().mockImplementation(({ by }: any) => Promise.resolve(by[0] === 'salaryForEmployeeId' ? employeeSalaryRows : salaryRows)),
    },
    user: { findMany: jest.fn().mockResolvedValue(users) },
  };
  return { service: new BillingService(prisma as any, {} as any), prisma };
}

const bill = (total: number, paid: number) => ({ totalAmount: total, paidAmount: paid });
const amt = (amount: number) => ({ amount });
const note = (totalAmount: number) => ({ totalAmount });
const vendor = (id: string, name: string, extra: Partial<any> = {}) => ({
  id, name, phone: null, gstNumber: null, isActive: true, isPress: false,
  purchaseBills: [], vendorPayments: [], creditDebitNotes: [], ...extra,
});

describe('BillingService.listCreditors — vendors', () => {
  it('sums bills, adds on-account payments to Paid, and deducts notes from Balance', async () => {
    const { service, prisma } = serviceWith([
      vendor('v1', 'PAPER CO', {
        purchaseBills: [bill(10000, 4000), bill(2500.5, 0)],
        vendorPayments: [amt(1000), amt(0.1)],
        creditDebitNotes: [note(500.2)],
      }),
    ], [], []);
    const { vendors } = await service.listCreditors({ role: 'ACCOUNTS' });
    // 12500.50 − (4000 + 1000.10) − 500.20 = 7000.20
    expect(vendors[0]).toMatchObject({
      billCount: 2, totalBilled: 12500.5, onAccountPaid: 1000.1, totalPaid: 5000.1, notesAdjusted: 500.2, balanceDue: 7000.2,
    });

    const select = prisma.vendor.findMany.mock.calls[0][0].select;
    expect(select.purchaseBills.where).toEqual({ status: { not: 'CANCELLED' } });
    expect(select.vendorPayments.where).toEqual({ OR: [{ purchaseBillId: null }, { purchaseBill: { status: 'CANCELLED' } }] });
    expect(select.creditDebitNotes.where).toEqual({ status: 'ISSUED' });
  });

  it('shows an overpaid vendor as a negative balance (advance)', async () => {
    const { service } = serviceWith([vendor('v1', 'ADVANCE CO', { vendorPayments: [amt(3000)] })], [], []);
    const { vendors } = await service.listCreditors({ role: 'ADMIN' });
    expect(vendors[0]).toMatchObject({ totalBilled: 0, totalPaid: 3000, balanceDue: -3000 });
  });

  it('hides inactive vendors only when nothing is on record, and sorts by balance', async () => {
    const { service } = serviceWith([
      vendor('v1', 'OLD PRESS', { isActive: false }),
      vendor('v2', 'OLD PAID', { isActive: false, vendorPayments: [amt(200)] }),
      vendor('v3', 'ACME INKS'),
      vendor('v4', 'BIG DUE', { purchaseBills: [bill(900, 0)] }),
    ], [], []);
    const { vendors } = await service.listCreditors({ role: 'ADMIN' });
    expect(vendors.map((v) => v.name)).toEqual(['BIG DUE', 'ACME INKS', 'OLD PAID']);
  });
});

describe('BillingService.listCreditors — employees', () => {
  const employees = [
    { id: 'e1', employeeCode: 'RP02', fullName: 'ZED', designation: 'SELLER', mobileNumber: null, status: 'RESIGNED', userId: 'u1' },
    { id: 'e2', employeeCode: 'RP01', fullName: 'AMY', designation: 'DESIGNER', mobileNumber: '9000000002', status: 'ACTIVE', userId: 'u2' },
    { id: 'e3', employeeCode: 'RP03', fullName: 'BOB', designation: 'OFFICE BOY', mobileNumber: null, status: 'ACTIVE', userId: null },
    { id: 'e4', employeeCode: 'RP04', fullName: 'CAT', designation: 'PACKER', mobileNumber: null, status: 'ACTIVE', userId: 'u4' },
  ];
  const salaryRows = [
    { salaryForUserId: 'u1', _sum: { amount: 15000 } },
    { salaryForUserId: 'u2', _sum: { amount: 22000.75 } },
    { salaryForUserId: 'u9', _sum: { amount: 8000 } },
    { salaryForUserId: 'owner', _sum: { amount: 50000 } },
  ];
  const users = [
    { id: 'u9', fullName: 'DEV (NO HR)', email: 'dev@x.com', phone: '9000000009' },
    { id: 'owner', fullName: 'Sanket', email: 'sanket.rareprint@gmail.com', phone: null },
  ];

  it('adds login and employee tags, and lists non-HR tagged logins except the owner', async () => {
    const employeeSalaryRows = [
      { salaryForEmployeeId: 'e3', _sum: { amount: 9000.5 } }, // BOB, no login
      { salaryForEmployeeId: 'e2', _sum: { amount: 1000 } },   // AMY, tagged before her login was linked
    ];
    const { service, prisma } = serviceWith([], employees, salaryRows, users, employeeSalaryRows);
    const { employees: rows } = await service.listCreditors({ role: 'ADMIN' });
    expect(rows.map((r) => [r.name, r.status, r.salaryPaid])).toEqual([
      ['AMY', 'ACTIVE', 23000.75],
      ['BOB', 'ACTIVE', 9000.5],
      ['CAT', 'ACTIVE', 0],
      ['DEV (NO HR)', 'NO_HR_RECORD', 8000],
      ['ZED', 'RESIGNED', 15000],
    ]);
    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['u9', 'owner'] } });
    expect(rows[0]).not.toHaveProperty('balanceDue');
  });

  it('skips the user lookup when every tagged login has an Employee record', async () => {
    const { service, prisma } = serviceWith([], employees, salaryRows.slice(0, 2));
    await service.listCreditors({ role: 'ADMIN' });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
});

describe('BillingService.listCreditors — access', () => {
  it('allows the superadmin regardless of role', async () => {
    const { service } = serviceWith([], [], []);
    await expect(service.listCreditors({ role: 'SALES_AGENT', email: 'Sanket.RarePrint@gmail.com' })).resolves.toEqual({ vendors: [], employees: [] });
  });

  it('rejects other roles before querying', async () => {
    const { service, prisma } = serviceWith([], [], []);
    await expect(service.listCreditors({ role: 'SALES_AGENT', email: 'agent@x.com' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.vendor.findMany).not.toHaveBeenCalled();
  });
});
