/**
 * BUSINESS RULE: cancelled invoices (whole order cancelled)
 *
 * When Accounts approves a whole-order cancellation, the invoice is still
 * zeroed exactly as before (reconcileInvoiceToRemainingItems), and ALSO:
 *   - marked status CANCELLED with cancelledAt,
 *   - keeps the cancel request's reason as its cancellation remark,
 *   - keeps a snapshot of the items/totals billed before it was zeroed.
 * Billing > Invoices lets admin/accounts set or correct that remark, only on
 * a cancelled invoice. The PDF prints "CANCELLED INVOICE", a watermark and
 * the remark, and reserves one item row for the remark.
 *
 * If these tests fail after a code change, cancelled invoices will print as
 * normal tax invoices, lose their reason, or lose what was originally billed.
 */

jest.mock('../common/cancel-item-assignments', () => ({
  assertItemsCancellable: jest.fn().mockResolvedValue(undefined),
  releaseItemAssignments: jest.fn().mockResolvedValue({ sheetsFreed: 0, jobWorksRemoved: 0 }),
}));

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AccountsService } from '../accounts/accounts.service';
import { BillingService } from './billing.service';
import { buildInvoicePdf, InvoicePdfData } from './invoice-pdf';

describe('approveCancellation (whole order) — invoice', () => {
  function setup() {
    const order = {
      id: 'o1',
      status: 'APPROVED',
      customerId: 'c1',
      cancellationRequestedAt: new Date(),
      cancellationReason: '  Customer changed the design  ',
      pendingCancelItemIds: [],
      items: [{ id: 'oi1', product: { name: 'CARD' } }],
    };
    const invoice = { id: 'inv1', invoiceNumber: '1781', subtotal: 1000, totalAmount: 1180 };
    const billedItems = [{
      productName: 'CARD', sku: 'C1', hsnSac: '4911', productionNotes: 'GSM: 300', quantity: 100,
      unitPrice: 10, taxableAmount: 1000, gstRatePct: 18, cgstAmount: 90, sgstAmount: 90, igstAmount: 0, lineTotal: 1180,
    }];
    const calls: string[] = [];
    const tx: any = {
      orderItem: { updateMany: jest.fn() },
      order: { update: jest.fn().mockResolvedValue({ ...order, status: 'CANCELLED' }) },
      invoiceItem: { findMany: jest.fn(async () => { calls.push('snapshot'); return billedItems; }) },
      invoice: { update: jest.fn(async () => { calls.push('mark-cancelled'); }) },
      statusLog: { create: jest.fn() },
    };
    const prisma: any = {
      order: { findUnique: jest.fn().mockResolvedValue(order) },
      invoice: { findUnique: jest.fn().mockResolvedValue(invoice) },
      $transaction: (fn: any) => fn(tx),
    };
    const loyalty = { reverseForOrder: jest.fn().mockResolvedValue(undefined) };
    const service = new AccountsService(prisma, {} as any, {} as any, loyalty as any, {} as any, {} as any, {} as any, {} as any);
    const reconcile = jest.spyOn(service as any, 'reconcileInvoiceToRemainingItems').mockImplementation(async () => { calls.push('reconcile'); });
    return { service, tx, reconcile, calls };
  }

  it('snapshots the billed items, still zeroes the invoice, then marks it cancelled with the request reason', async () => {
    const { service, tx, reconcile, calls } = setup();
    await service.approveCancellation('o1', { id: 'u1', role: 'ACCOUNTS' } as any);

    expect(calls).toEqual(['snapshot', 'reconcile', 'mark-cancelled']);
    expect(reconcile).toHaveBeenCalledWith(tx, expect.objectContaining({ id: 'inv1' }), expect.anything(), [], 'Whole order cancelled');
    const data = tx.invoice.update.mock.calls[0][0].data;
    expect(data.status).toBe('CANCELLED');
    expect(data.cancelledAt).toBeInstanceOf(Date);
    expect(data.cancellationReason).toBe('Customer changed the design');
    expect(data.cancelledSnapshot).toEqual({
      subtotal: 1000,
      totalAmount: 1180,
      items: [expect.objectContaining({ productName: 'CARD', quantity: 100, lineTotal: 1180, gstRatePct: 18 })],
    });
  });
});

describe('BillingService.updateCancellationRemark', () => {
  function billingWith(invoice: any) {
    const prisma: any = {
      invoice: { findUnique: jest.fn().mockResolvedValue(invoice), update: jest.fn().mockResolvedValue({}) },
    };
    return { service: new BillingService(prisma, {} as any), prisma };
  }
  const cancelled = { id: 'inv1', status: 'CANCELLED', order: { status: 'CANCELLED' } };

  it('saves a trimmed remark on a cancelled invoice', async () => {
    const { service, prisma } = billingWith(cancelled);
    await expect(service.updateCancellationRemark('inv1', '  Duplicate bill  ', { role: 'ACCOUNTS' })).resolves.toEqual({ id: 'inv1', cancellationReason: 'Duplicate bill' });
    expect(prisma.invoice.update).toHaveBeenCalledWith({ where: { id: 'inv1' }, data: { cancellationReason: 'Duplicate bill' } });
  });

  it('accepts an older cancellation whose Invoice.status was never set (order cancelled)', async () => {
    const { service } = billingWith({ id: 'inv1', status: 'ISSUED', order: { status: 'CANCELLED' } });
    await expect(service.updateCancellationRemark('inv1', 'Order cancelled', { role: 'ADMIN' })).resolves.toBeTruthy();
  });

  it('rejects other roles, a blank or too-long remark, and a live invoice', async () => {
    await expect(billingWith(cancelled).service.updateCancellationRemark('inv1', 'x', { role: 'SALES_AGENT' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(billingWith(cancelled).service.updateCancellationRemark('inv1', '   ', { role: 'ACCOUNTS' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(billingWith(cancelled).service.updateCancellationRemark('inv1', 'x'.repeat(251), { role: 'ACCOUNTS' })).rejects.toBeInstanceOf(BadRequestException);
    const live = billingWith({ id: 'inv1', status: 'ISSUED', order: { status: 'APPROVED' } });
    await expect(live.service.updateCancellationRemark('inv1', 'x', { role: 'ACCOUNTS' })).rejects.toBeInstanceOf(BadRequestException);
    expect(live.prisma.invoice.update).not.toHaveBeenCalled();
  });
});

describe('Cancelled Invoice PDF', () => {
  function invoice(itemCount: number, cancelled: boolean): InvoicePdfData {
    const items = Array.from({ length: itemCount }, (_, i) => ({
      productName: `P${i + 1}`, hsnSac: '4911', productDetails: null, size: null, quantity: 1, unit: 'PCS', unitPrice: 100,
      gstRatePct: 18, cgstAmount: 9, sgstAmount: 9, igstAmount: 0, taxableAmount: 100, lineTotal: 118,
    }));
    const terms = Array.from({ length: 8 }, (_, i) => `${i + 1}. A term line.`).join('\n');
    return {
      invoiceNumber: '1', issueDate: '01/10/2026', gstTreatment: 'INTRA_STATE', subtotal: 0, totalAmount: 0, paidAmount: 0,
      balanceAmount: 0, previousBalance: 0, currentBalance: 0, agentName: '', termsAndConditions: terms, customerName: 'C',
      customerAddress: 'A', customerPhone: '', customerState: '', customerGstin: '', items, cancelled,
      cancellationReason: cancelled ? 'Duplicate bill' : null,
      company: {
        companyName: 'X', companyAddress: '', companyPhone: '', companyEmail: '', companyGstin: '', companyState: '', bankName: '',
        bankAccountNumber: '', bankIfsc: '', bankAccountHolderName: '', defaultTermsAndConditions: terms, logoUrl: null, signatureUrl: null,
      },
    };
  }
  const pages = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type \/Page(?!s)/g) ?? []).length;

  it('reserves one item row for the remark (7 rows per page -> 6)', async () => {
    expect(pages(await buildInvoicePdf(invoice(7, false)))).toBe(1);
    expect(pages(await buildInvoicePdf(invoice(6, true)))).toBe(1);
    expect(pages(await buildInvoicePdf(invoice(7, true)))).toBe(2);
  });
});
