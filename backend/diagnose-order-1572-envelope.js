/**
 * Diagnostic (read-only, makes NO changes): why order 1572's ENVELOPE item
 * can be selected in Book Shipment but is refused on submit with
 * "Already approved by accounts". Prints the order's status, its
 * pendingDispatchItemIds, every item's stage/dispatchedAt, shipments, and
 * the dispatch-related StatusLog history.
 *
 * Run from backend/:  node diagnose-order-1572-envelope.js
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  const order = await prisma.order.findFirst({
    where: { orderNumber: '1572' },
    include: {
      items: { include: { product: { select: { name: true } } }, orderBy: { createdAt: 'asc' } },
      shipments: { select: { id: true, createdAt: true, shipmentNumber: true, status: true }, orderBy: { createdAt: 'desc' } },
    },
  });
  if (!order) { console.log('order 1572 not found'); await prisma.$disconnect(); return; }

  const pending = order.pendingDispatchItemIds ?? [];
  console.log('ORDER      :', order.orderNumber, '| status =', order.status);
  console.log('pendingDispatchItemIds:', JSON.stringify(pending));
  console.log('');
  console.log('ITEMS:');
  for (const i of order.items) {
    console.log([
      '  ' + i.product.name.padEnd(18),
      'qty=' + String(i.quantity).padEnd(6),
      'stage=' + String(i.itemProductionStage).padEnd(20),
      'dispatchedAt=' + (i.dispatchedAt ? i.dispatchedAt.toISOString().slice(0, 10) : 'null').padEnd(11),
      'inPending=' + (pending.includes(i.id) ? 'YES' : 'no ').padEnd(4),
      'created=' + i.createdAt.toISOString().slice(0, 16),
      'cancelled=' + (i.cancelledAt ? 'YES' : 'no'),
    ].join(' '));
  }
  console.log('');
  console.log('SHIPMENTS:', order.shipments.length);
  for (const s of order.shipments) console.log('  ', s.shipmentNumber, s.status, s.createdAt.toISOString().slice(0, 16));

  const logs = await prisma.statusLog.findMany({
    where: { orderId: order.id },
    orderBy: { createdAt: 'asc' },
    select: { fromStatus: true, toStatus: true, createdAt: true, reason: true },
  });
  console.log('');
  console.log('STATUS LOG:');
  for (const l of logs) {
    console.log('  ', l.createdAt.toISOString().slice(0, 16), l.fromStatus, '->', l.toStatus, '|', (l.reason ?? '').slice(0, 70));
  }

  const approvedLog = logs.find(l => l.fromStatus === 'PENDING_DISPATCH_APPROVAL' && l.toStatus === 'READY_FOR_DISPATCH');
  console.log('');
  console.log('GUARD CHECK (orders.service.ts:1828-1840):');
  console.log('  order.status === READY_FOR_DISPATCH ?', order.status === 'READY_FOR_DISPATCH');
  console.log('  has PENDING_DISPATCH_APPROVAL -> READY_FOR_DISPATCH log ?', !!approvedLog);
  console.log('  => submit is BLOCKED ?', order.status === 'READY_FOR_DISPATCH' && !!approvedLog);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
