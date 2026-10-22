/**
 * BUSINESS RULE: Dispatching part of an order must not hide the rest of it.
 *
 * RULE 1 — Dispatch > "Mark as dispatched" only marks the items on the
 *   Dispatch card as shipped (ready, not already shipped, approved by
 *   Accounts), and the order becomes PARTIALLY_DISPATCHED while other items
 *   are still unfinished. DISPATCHED only once every item has shipped.
 * RULE 2 — Production > Clubbing keeps showing a clubbing item that is still
 *   at the vendor even after a sibling item was submitted / dispatched.
 * RULE 3 — Production lists drop items that have already shipped.
 *
 * Regression for order 1686 (THAKUR MEDICAL STORE), 2026-10-22: only the
 * envelope shipped, but the bag still printing at SN PRINTER vanished from
 * every Production queue. If these tests fail, that bug is back.
 */

import { OrderProductionStage, OrderStatus } from '@prisma/client';
import { DispatchService } from './dispatch.service';
import { ClubbingSheetService } from '../production/clubbing-sheet.service';
import { ProductionService } from '../production/production.service';

const READY = OrderProductionStage.READY_FOR_DISPATCH;

function item(id: string, name: string, stage: OrderProductionStage, extra: Record<string, unknown> = {}) {
  return {
    id, itemProductionStage: stage, dispatchedAt: null, cancelledAt: null, quantity: 1000,
    productionNotes: null, artworkNotes: null, productionCategory: 'CLUBBING', unitPrice: 1, lineTotal: 1,
    processingFollowUpDate: null, jobWorks: [],
    product: { name, sku: name, sizeInches: '8*10', gsm: 70, sides: 'DOUBLE' },
    ...extra,
  };
}

function order(items: any[], extra: Record<string, unknown> = {}) {
  return {
    id: 'o1', orderNumber: '1686', status: OrderStatus.READY_FOR_DISPATCH, isSample: false,
    pendingDispatchItemIds: [] as string[], orderDate: new Date('2026-09-18'), notes: null, productionStage: null,
    customer: { businessName: 'THAKUR MEDICAL STORE', phone: '8219862509' },
    salesAgent: { id: 'a1', fullName: 'AGENT' },
    items, ...extra,
  };
}

function dispatchHarness(fixture: any) {
  const db: any = {
    order: {
      findUnique: jest.fn(async (args: any) => (args.select?.courierChargeQuoted ? { courierChargeQuoted: null } : fixture)),
      update: jest.fn(async () => ({})),
    },
    shipment: { create: jest.fn(async () => ({})), findMany: jest.fn(async () => []) },
    orderItem: { updateMany: jest.fn(async () => ({ count: 1 })) },
    statusLog: { create: jest.fn(async () => ({})) },
    invoice: { findUnique: jest.fn(async () => null) },
  };
  db.$transaction = jest.fn(async (fn: any) => fn(db));
  const whatsapp = { sendOrderUpdate: jest.fn(async () => undefined) };
  const service = new DispatchService(db, {} as any, {} as any, {} as any, {} as any, whatsapp as any);
  return { db, whatsapp, service };
}

describe('Manual "Mark as dispatched" — partial orders (order 1686)', () => {
  it('ships only the approved envelope; the printing bag stays in production', async () => {
    const fixture = order(
      [item('env', 'ENVELOPE', READY), item('bag', 'NON WOVEN D CUT BAG', OrderProductionStage.PRINTING)],
      { pendingDispatchItemIds: ['env'] },
    );
    const { db, whatsapp, service } = dispatchHarness(fixture);

    await service.markManuallyDispatched('o1', 'u1', { carrierName: 'Manual' });

    expect(db.orderItem.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['env'] } }, data: { dispatchedAt: expect.any(Date) } });
    expect(db.order.update.mock.calls[0][0].data.status).toBe(OrderStatus.PARTIALLY_DISPATCHED);
    expect(db.statusLog.create.mock.calls[0][0].data.toStatus).toBe(OrderStatus.PARTIALLY_DISPATCHED);
    expect((whatsapp.sendOrderUpdate.mock.calls[0] as any[])[0].product).toBe('ENVELOPE');
  });

  it('marks the order DISPATCHED when every item is ready (legacy empty approval list)', async () => {
    const { db, service } = dispatchHarness(order([item('a', 'A', READY), item('b', 'B', READY)]));
    await service.markManuallyDispatched('o1', 'u1', {});
    expect(db.orderItem.updateMany.mock.calls[0][0].where).toEqual({ id: { in: ['a', 'b'] } });
    expect(db.order.update.mock.calls[0][0].data.status).toBe(OrderStatus.DISPATCHED);
  });

  it('second round: shipping the bag later completes the order', async () => {
    const fixture = order(
      [item('env', 'ENVELOPE', READY, { dispatchedAt: new Date() }), item('bag', 'BAG', READY)],
      { status: OrderStatus.PARTIALLY_DISPATCHED, pendingDispatchItemIds: ['bag'] },
    );
    const { db, service } = dispatchHarness(fixture);
    await service.markManuallyDispatched('o1', 'u1', {});
    expect(db.orderItem.updateMany.mock.calls[0][0].where).toEqual({ id: { in: ['bag'] } });
    expect(db.order.update.mock.calls[0][0].data.status).toBe(OrderStatus.DISPATCHED);
  });

  it('a ready item Accounts did not approve is not marked shipped', async () => {
    const fixture = order([item('a', 'A', READY), item('b', 'B', READY)], { pendingDispatchItemIds: ['a'] });
    const { db, service } = dispatchHarness(fixture);
    await service.markManuallyDispatched('o1', 'u1', {});
    expect(db.orderItem.updateMany.mock.calls[0][0].where).toEqual({ id: { in: ['a'] } });
    expect(db.order.update.mock.calls[0][0].data.status).toBe(OrderStatus.PARTIALLY_DISPATCHED);
  });

  it('refuses (and writes nothing) when no item is ready to ship', async () => {
    const { db, service } = dispatchHarness(order([item('bag', 'BAG', OrderProductionStage.PRINTING)]));
    await expect(service.markManuallyDispatched('o1', 'u1', {})).rejects.toThrow('No items on this order are ready');
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.shipment.create).not.toHaveBeenCalled();
  });
});

describe('Production > Clubbing keeps unfinished items of partly dispatched orders', () => {
  function clubbingHarness(orders: any[]) {
    const db: any = {
      order: { findMany: jest.fn(async () => orders) },
      $queryRawUnsafe: jest.fn(async () => []),
    };
    return { db, service: new ClubbingSheetService(db, {} as any) };
  }

  it('shows the bag of a PARTIALLY_DISPATCHED order, not its shipped envelope', async () => {
    const partly = order(
      [item('env', 'ENVELOPE', READY, { dispatchedAt: new Date() }), item('bag', 'BAG', OrderProductionStage.PRINTING)],
      { status: OrderStatus.PARTIALLY_DISPATCHED },
    );
    const { db, service } = clubbingHarness([partly]);
    const result = await service.getClubbingOrders();
    expect(result).toHaveLength(1);
    expect(result[0].items.map((i: any) => i.id)).toEqual(['bag']);
    expect(db.order.findMany.mock.calls[0][0].where.OR[1].status.in).toEqual(
      [OrderStatus.PENDING_DISPATCH_APPROVAL, OrderStatus.READY_FOR_DISPATCH, OrderStatus.PARTIALLY_DISPATCHED],
    );
  });

  it('leaves APPROVED / IN_PRODUCTION orders exactly as before (ready items still listed)', async () => {
    const inProd = order([item('x', 'X', READY), item('y', 'Y', OrderProductionStage.PRINTING)], { status: OrderStatus.IN_PRODUCTION });
    const { service } = clubbingHarness([inProd]);
    const result = await service.getClubbingOrders();
    expect(result[0].items.map((i: any) => i.id)).toEqual(['x', 'y']);
  });

  it('drops a later-status order with no clubbing work left', async () => {
    const done = order([item('x', 'X', READY, { dispatchedAt: new Date() })], { status: OrderStatus.PARTIALLY_DISPATCHED });
    const { service } = clubbingHarness([done]);
    expect(await service.getClubbingOrders()).toEqual([]);
  });

  it('design-file lookup passes one value per placeholder beyond 50 items', async () => {
    const many = order(Array.from({ length: 60 }, (_, n) => item(`i${n}`, 'X', OrderProductionStage.PRINTING)), { status: OrderStatus.IN_PRODUCTION });
    const { db, service } = clubbingHarness([many]);
    await service.getClubbingOrders();
    const [sql, ...params] = db.$queryRawUnsafe.mock.calls[0];
    expect((sql.match(/\$\d+/g) ?? []).length).toBe(60);
    expect(params).toHaveLength(60);
  });
});

describe('Production > All hides shipped items, keeps unfinished ones', () => {
  it('lists the bag but not the dispatched envelope', async () => {
    const partly = order(
      [item('env', 'ENVELOPE', READY, { dispatchedAt: new Date() }), item('bag', 'BAG', OrderProductionStage.PRINTING)],
      { status: OrderStatus.PARTIALLY_DISPATCHED },
    );
    const db: any = { order: { findMany: jest.fn(async () => [partly]) } };
    const service = new ProductionService(db, {} as any);
    const result = await service.listInProduction();
    expect(result[0].items.map((i: any) => i.id)).toEqual(['bag']);
  });
});
