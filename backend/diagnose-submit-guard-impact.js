/**
 * Diagnostic (read-only, makes NO changes): replays submitDispatchBatch's
 * eligibility decision for every order that currently has a
 * READY_FOR_DISPATCH item, under the OLD rules and the NEW ones, and prints
 * only the orders whose outcome changes. Mirrors resolveLockedItemIds and the
 * guard from orders.service.ts.
 *
 * Run from backend/:  node diagnose-submit-guard-impact.js
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

function resolveLockedItemIds(order) {
  const submittedIds = order.pendingDispatchItemIds ?? [];
  if (order.status === 'DISPATCHED' && order.latestShipmentCreatedAt !== undefined) {
    const locked = new Set(submittedIds);
    if (order.latestShipmentCreatedAt === null) {
      order.items.forEach(i => locked.add(i.id));
    } else {
      const cutoff = order.latestShipmentCreatedAt;
      order.items.forEach(i => {
        if (locked.has(i.id)) return;
        if (!i.createdAt || i.createdAt <= cutoff) locked.add(i.id);
      });
    }
    return locked;
  }
  if (submittedIds.length > 0) return new Set(submittedIds);
  if (order.status === 'PENDING_DISPATCH_APPROVAL') return new Set(order.items.map(i => i.id));
  return new Set();
}

const ALLOWED = ['APPROVED','IN_PRODUCTION','READY_FOR_DISPATCH','PARTIALLY_DISPATCHED','PENDING_DISPATCH_APPROVAL','DISPATCHED'];

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  const orders = await prisma.order.findMany({
    where: { status: { notIn: ['DELIVERED','CANCELLED'] }, items: { some: { itemProductionStage: 'READY_FOR_DISPATCH' } } },
    include: {
      items: { include: { product: { select: { name: true } } } },
      shipments: { select: { createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });

  const approvedOrderIds = new Set(
    (await prisma.statusLog.findMany({
      where: { fromStatus: 'PENDING_DISPATCH_APPROVAL', toStatus: 'READY_FOR_DISPATCH', orderId: { in: orders.map(o => o.id) } },
      select: { orderId: true },
      distinct: ['orderId'],
    })).map(r => r.orderId),
  );

  let changed = 0, sameAllow = 0, sameBlock = 0;
  const rows = [];
  for (const o of orders) {
    if (!ALLOWED.includes(o.status)) continue;
    const ctx = {
      status: o.status, items: o.items,
      pendingDispatchItemIds: o.pendingDispatchItemIds,
      latestShipmentCreatedAt: o.shipments?.[0]?.createdAt ?? null,
    };
    const locked = resolveLockedItemIds(ctx);
    const readyStage = o.items.filter(i => i.itemProductionStage === 'READY_FOR_DISPATCH' && !i.dispatchedAt);

    // OLD: guard fires for any approved READY_FOR_DISPATCH order; readyItems
    // only excluded locked ids when status was DISPATCHED.
    const oldGuardBlocks = o.status === 'READY_FOR_DISPATCH' && approvedOrderIds.has(o.id);
    const oldLocked = o.status === 'DISPATCHED' ? locked : new Set();
    const oldReady = readyStage.filter(i => !oldLocked.has(i.id));
    const oldAllows = !oldGuardBlocks && oldReady.length > 0;

    // NEW: guard only for orders with no per-item record; readyItems always
    // excludes locked ids.
    const hasPerItemTracking = (o.pendingDispatchItemIds ?? []).length > 0;
    const newGuardBlocks = o.status === 'READY_FOR_DISPATCH' && !hasPerItemTracking && approvedOrderIds.has(o.id);
    const newReady = readyStage.filter(i => !locked.has(i.id));
    const newAllows = !newGuardBlocks && newReady.length > 0;

    if (oldAllows === newAllows) { newAllows ? sameAllow++ : sameBlock++; continue; }
    changed++;
    rows.push({
      orderNo: o.orderNumber, status: o.status,
      was: oldAllows ? 'ALLOWED' : 'BLOCKED', now: newAllows ? 'ALLOWED' : 'BLOCKED',
      pendingIds: (o.pendingDispatchItemIds ?? []).length,
      freeNow: newReady.map(i => i.product.name + ' x' + i.quantity).join(', ') || '-',
      freeBefore: oldReady.map(i => i.product.name + ' x' + i.quantity).join(', ') || '-',
    });
  }

  console.log('orders examined:', orders.length);
  console.log('unchanged - still submittable :', sameAllow);
  console.log('unchanged - still blocked     :', sameBlock);
  console.log('CHANGED                       :', changed);
  console.log('');
  for (const r of rows) {
    console.log(`#${r.orderNo} [${r.status}] ${r.was} -> ${r.now} | pendingIds=${r.pendingIds}`);
    console.log(`     free items before: ${r.freeBefore}`);
    console.log(`     free items now   : ${r.freeNow}`);
  }
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
