/**
 * BUSINESS RULE: salary tags for employees without a login (Expense Tracker)
 *
 *   - An HR employee with no login is tagged by employee
 *     (BankTransaction.salaryForEmployeeId); one with a login is still tagged
 *     by login (salaryForUserId), exactly as before.
 *   - A transaction carries at most one of the two; untagging clears both.
 *   - Expense Tracker "Paid" = login tags + employee tags for that employee,
 *     capped at the accrued salary; every employee row is taggable.
 *
 * If these tests fail after a code change, salary paid to staff without a
 * login stops being tracked, or gets double-counted.
 */

import { NotFoundException } from '@nestjs/common';
import { AccountsService } from './accounts.service';

function serviceWith(prisma: any, hr: any = {}, costTable: any = {}) {
  return new AccountsService(prisma, {} as any, costTable, {} as any, hr, {} as any, {} as any, {} as any);
}

describe('AccountsService.markSalaryPaidForEmployee', () => {
  const txn = { id: 't1' };

  it('tags an employee with no login by employee id and clears any login tag', async () => {
    const prisma = {
      employee: { findUnique: jest.fn().mockResolvedValue({ fullName: 'BOB', userId: null }) },
      bankTransaction: { findUnique: jest.fn().mockResolvedValue(txn), update: jest.fn().mockResolvedValue({}) },
    };
    await serviceWith(prisma).markSalaryPaidForEmployee('e3', 2026, 9, 't1', 'acct-user');
    const { data } = prisma.bankTransaction.update.mock.calls[0][0];
    expect(data).toMatchObject({
      reconcileStatus: 'MATCHED_SALARY', salaryForEmployeeId: 'e3', salaryForUserId: null, salaryYear: 2026, salaryMonth: 9,
      reconciledById: 'acct-user',
    });
  });

  it('tags a linked employee by login, as before, and clears any employee tag', async () => {
    const prisma = {
      employee: { findUnique: jest.fn().mockResolvedValue({ fullName: 'AMY', userId: 'u2' }) },
      user: { findUnique: jest.fn().mockResolvedValue({ fullName: 'AMY' }) },
      bankTransaction: { findUnique: jest.fn().mockResolvedValue(txn), update: jest.fn().mockResolvedValue({}) },
    };
    await serviceWith(prisma).markSalaryPaidForEmployee('e2', 2026, 9, 't1', 'acct-user');
    const { data } = prisma.bankTransaction.update.mock.calls[0][0];
    expect(data).toMatchObject({ salaryForUserId: 'u2', salaryForEmployeeId: null });
  });

  it('404s for an unknown employee without touching the transaction', async () => {
    const prisma = {
      employee: { findUnique: jest.fn().mockResolvedValue(null) },
      bankTransaction: { findUnique: jest.fn(), update: jest.fn() },
    };
    await expect(serviceWith(prisma).markSalaryPaidForEmployee('nope', 2026, 9, 't1', 'x')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.bankTransaction.update).not.toHaveBeenCalled();
  });

  it('untagging an employee-tagged transaction clears both tag fields', async () => {
    const prisma = {
      bankTransaction: {
        findUnique: jest.fn().mockResolvedValue({ id: 't1', salaryForUserId: null, salaryForEmployeeId: 'e3' }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    await serviceWith(prisma).unmarkSalaryPaid('t1');
    expect(prisma.bankTransaction.update.mock.calls[0][0].data).toMatchObject({
      reconcileStatus: 'UNMATCHED', salaryForUserId: null, salaryForEmployeeId: null, salaryYear: null, salaryMonth: null,
    });
  });
});

describe('AccountsService.getExpenseTracker — salary', () => {
  it('counts login and employee tags per employee, capped at accrued, all rows taggable', async () => {
    const tagged = [
      { id: 'a', amount: 5000, salaryForUserId: 'u2', salaryForEmployeeId: null, salaryForUser: { email: 'amy@x.com' } },
      { id: 'b', amount: 1000, salaryForUserId: null, salaryForEmployeeId: 'e2', salaryForUser: null },
      { id: 'c', amount: 9000, salaryForUserId: null, salaryForEmployeeId: 'e3', salaryForUser: null },
      { id: 'd', amount: 4000, salaryForUserId: null, salaryForEmployeeId: 'e3', salaryForUser: null },
    ];
    const prisma = {
      bankTransaction: {
        findMany: jest.fn().mockImplementation(({ where }: any) => Promise.resolve(where.salaryYear ? tagged : [])),
      },
      employee: { findMany: jest.fn().mockResolvedValue([{ id: 'e2', userId: 'u2' }, { id: 'e3', userId: null }]) },
      user: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const hr = {
      salarySummary: jest.fn().mockResolvedValue({
        employees: [
          { employeeId: 'e2', fullName: 'AMY', designation: 'DESIGNER', salary: 20000 },
          { employeeId: 'e3', fullName: 'BOB', designation: 'OFFICE BOY', salary: 10000 },
        ],
      }),
    };
    const costTable = { getAllAgentsCommissionSummary: jest.fn().mockResolvedValue({ agents: [] }) };

    const res = await serviceWith(prisma, hr, costTable).getExpenseTracker(2026, 9);

    const where = prisma.bankTransaction.findMany.mock.calls.find((c: any) => c[0].where.salaryYear)[0].where;
    expect(where.OR).toEqual([{ salaryForUserId: { not: null } }, { salaryForEmployeeId: { not: null } }]);
    expect(res.salary.byEmployee.map((r: any) => [r.fullName, r.paid, r.balance, r.taggable])).toEqual([
      ['AMY', 6000, 14000, true],   // 5000 by login + 1000 by employee
      ['BOB', 10000, 0, true],      // 13000 tagged, capped at 10000 accrued
    ]);
    expect(res.salary.paid).toBe(16000);
  });
});
