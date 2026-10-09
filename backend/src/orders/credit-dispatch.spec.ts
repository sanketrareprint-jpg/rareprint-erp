/**
 * BUSINESS RULE: Dispatch on credit (Book Shipment → "On Credit")
 *
 * RULE 1 — Only the super admin (OWNER_EMAIL) may submit a dispatch on credit.
 * RULE 2 — A shipment cannot be both COD and on credit.
 * RULE 3 — A credit submission writes CREDIT_DISPATCH_NOTE (never "COD"/"Prepaid")
 *   into order.notes and tags the StatusLog with metadata.creditDispatch = true,
 *   which Accounts → Outstanding reads. A normal submission does neither.
 *
 * Exercises the real OrdersController / OrdersService with a mocked Prisma.
 */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { OrderProductionStage, OrderStatus } from '@prisma/client';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { CREDIT_DISPATCH_NOTE, isCreditDispatchLog } from '../common/credit-dispatch';
import { SUPER_ADMIN_EMAIL } from '../common/super-admin';

const baseBody = { orderIds: ['o1'], courierCharges: 0, isCod: false, dispatchType: 'BY_HAND' };

describe('Dispatch on credit — controller authorization', () => {
  const submit = jest.fn().mockResolvedValue({ success: true });
  const controller = new OrdersController({ submitDispatchBatch: submit } as any, {} as any);
  const req = (email: string) => ({ user: { id: 'u1', role: 'ADMIN', email } }) as any;

  beforeEach(() => submit.mockClear());

  it('rejects credit from a non-super-admin, even an ADMIN', () => {
    expect(() => controller.submitDispatchBatch(req('someone@else.com'), { ...baseBody, isCredit: true } as any))
      .toThrow(ForbiddenException);
    expect(submit).not.toHaveBeenCalled();
  });

  it('rejects COD + credit together', () => {
    expect(() => controller.submitDispatchBatch(req(SUPER_ADMIN_EMAIL), { ...baseBody, isCod: true, isCredit: true } as any))
      .toThrow(BadRequestException);
    expect(submit).not.toHaveBeenCalled();
  });

  it('allows credit for the super admin (email case-insensitive)', async () => {
    await controller.submitDispatchBatch(req(SUPER_ADMIN_EMAIL.toUpperCase()), { ...baseBody, isCredit: true } as any);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('leaves non-credit submissions from anyone unchanged', async () => {
    await controller.submitDispatchBatch(req('agent@else.com'), { ...baseBody } as any);
    expect(submit).toHaveBeenCalledTimes(1);
  });
});

describe('Dispatch on credit — submitDispatchBatch writes', () => {
  function makeService() {
    const tx = {
      order: { update: jest.fn().mockResolvedValue({}), findUnique: jest.fn().mockResolvedValue(null) },
      statusLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'o1', orderNumber: '1662', status: OrderStatus.READY_FOR_DISPATCH,
          pendingDispatchItemIds: ['old'],
          items: [{ id: 'i1', itemProductionStage: OrderProductionStage.READY_FOR_DISPATCH, dispatchedAt: null, product: { name: 'BOX' } }],
          shipments: [],
        }),
      },
      statusLog: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
    };
    const service = new OrdersService(prisma as any, { sendOrderUpdate: jest.fn() } as any, {} as any);
    return { service, tx };
  }

  it('credit: CREDIT note, no COD/Prepaid, StatusLog tagged', async () => {
    const { service, tx } = makeService();
    const res = await service.submitDispatchBatch(['o1'], 'u1', { ...baseBody, isCredit: true });
    expect(res.processedOrders).toBe(1);
    const notes: string = tx.order.update.mock.calls[0][0].data.notes;
    expect(notes).toContain(CREDIT_DISPATCH_NOTE);
    expect(notes).not.toMatch(/\bCOD[:\s]/i); // dispatch.service COD detection
    expect(notes).not.toMatch(/\bPrepaid\b/);
    expect(tx.statusLog.create.mock.calls[0][0].data.metadata).toEqual({ creditDispatch: true });
    // What Accounts' Dispatch Approval card and the Dispatch queue read back.
    expect(isCreditDispatchLog(tx.statusLog.create.mock.calls[0][0].data.metadata)).toBe(true);
  });

  it('isCreditDispatchLog only accepts a real boolean flag', () => {
    for (const m of [null, undefined, {}, { creditDispatch: 'true' }, { creditDispatch: false }, 'creditDispatch', []]) {
      expect(isCreditDispatchLog(m)).toBe(false);
    }
  });

  it('normal prepaid submission is unchanged: "Prepaid", no metadata', async () => {
    const { service, tx } = makeService();
    await service.submitDispatchBatch(['o1'], 'u1', { ...baseBody });
    const notes: string = tx.order.update.mock.calls[0][0].data.notes;
    expect(notes).toMatch(/\bPrepaid\b/);
    expect(notes).not.toContain(CREDIT_DISPATCH_NOTE);
    expect(tx.statusLog.create.mock.calls[0][0].data).not.toHaveProperty('metadata');
  });

  it('COD submission is unchanged', async () => {
    const { service, tx } = makeService();
    await service.submitDispatchBatch(['o1'], 'u1', { ...baseBody, isCod: true, codAmount: 24000 });
    expect(tx.order.update.mock.calls[0][0].data.notes).toContain('COD: ₹24000 to be collected on delivery');
  });
});
