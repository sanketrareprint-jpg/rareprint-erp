/**
 * repair-manual-dispatch-unfinished-items.js
 *
 * WHY THIS EXISTS
 * ----------------
 * Dispatch > "Mark as dispatched" (dispatch.service.ts markManuallyDispatched)
 * used to stamp dispatchedAt on EVERY item of the order and set the order to
 * DISPATCHED, even when only some items were ready and approved. Any item
 * still in production on such an order vanished from every Production queue.
 * Example: order 1686 (THAKUR MEDICAL STORE) -- only the envelope shipped,
 * the NON WOVEN D CUT BAG still printing at SN PRINTER disappeared.
 * The code is fixed (2026-10-22); this script is the one-time data fix for
 * orders hit BEFORE that fix.
 *
 * WHAT IT CHANGES (only with --apply)
 * For each order that is DISPATCHED, whose latest move to DISPATCHED was a
 * manual "Manually marked as dispatched", and that still has items which are
 * NOT ready for dispatch and not cancelled (so they cannot have shipped):
 *   - clears dispatchedAt on those unfinished items only
 *   - sets the order to PARTIALLY_DISPATCHED
 *   - adds an Order Journey entry explaining the repair
 * Items that were ready are left exactly as they are (treated as shipped).
 * Shipments, invoices, payments and courier charges are not touched.
 *
 * HOW TO RUN (from your own machine, needs real DATABASE_URL to Railway):
 *   cd backend
 *   node scripts/repair-manual-dispatch-unfinished-items.js               # dry run, all orders
 *   node scripts/repair-manual-dispatch-unfinished-items.js 1686          # dry run, one order
 *   node scripts/repair-manual-dispatch-unfinished-items.js 1686 --apply  # actually fix
 * Always read the dry-run list first.
 */

if (!process.env.DATABASE_URL) {
  const fs = require('fs');
  const path = require('path');
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}

if (!process.env.DATABASE_URL) {
  console.error('No DATABASE_URL set (env or backend/.env) -- nothing checked.');
  process.exit(1);
}

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const apply = process.argv.includes('--apply');
const orderNumbers = process.argv.slice(2).filter((a) => a !== '--apply');
const MANUAL_REASON_PREFIX = 'Manually marked as dispatched';

async function main() {
  const orders = await prisma.order.findMany({
    where: {
      status: 'DISPATCHED',
      ...(orderNumbers.length > 0 ? { orderNumber: { in: orderNumbers } } : {}),
    },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      customer: { select: { businessName: true } },
      items: {
        select: {
          id: true,
          itemProductionStage: true,
          dispatchedAt: true,
          cancelledAt: true,
          quantity: true,
          product: { select: { name: true } },
        },
      },
      statusLogs: {
        where: { toStatus: 'DISPATCHED' },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { reason: true, createdAt: true },
      },
    },
  });

  if (orderNumbers.length > 0) {
    const found = new Set(orders.map((o) => o.orderNumber));
    for (const n of orderNumbers) {
      if (!found.has(n)) console.log(`Order ${n}: not found or not in DISPATCHED status -- skipped.`);
    }
  }

  const affected = [];
  for (const o of orders) {
    const lastDispatch = o.statusLogs[0];
    if (!lastDispatch || !(lastDispatch.reason || '').startsWith(MANUAL_REASON_PREFIX)) continue;
    const unfinished = o.items.filter((i) => i.itemProductionStage !== 'READY_FOR_DISPATCH' && !i.cancelledAt);
    if (unfinished.length === 0) continue;
    affected.push({ order: o, unfinished, lastDispatch });
  }

  if (affected.length === 0) {
    console.log('No manually dispatched orders with unfinished items found. Nothing to repair.');
    return;
  }

  console.log(`${affected.length} order(s) to repair${apply ? '' : ' (dry run)'}:\n`);
  for (const { order, unfinished, lastDispatch } of affected) {
    console.log(`Order ${order.orderNumber}  ${order.customer.businessName}  (manually dispatched ${lastDispatch.createdAt.toISOString()})`);
    for (const i of order.items) {
      const tag = unfinished.includes(i) ? 'RESTORE to production' : 'leave as shipped';
      console.log(`   - ${i.product.name} x${i.quantity}  stage=${i.itemProductionStage}  -> ${tag}`);
    }
    console.log(`   order status: DISPATCHED -> PARTIALLY_DISPATCHED\n`);
  }

  if (!apply) {
    console.log('Re-run with --apply to make these changes.');
    return;
  }

  for (const { order, unfinished } of affected) {
    await prisma.$transaction(async (tx) => {
      await tx.orderItem.updateMany({
        where: { id: { in: unfinished.map((i) => i.id) } },
        data: { dispatchedAt: null },
      });
      await tx.order.update({
        where: { id: order.id },
        data: { status: 'PARTIALLY_DISPATCHED' },
      });
      await tx.statusLog.create({
        data: {
          orderId: order.id,
          fromStatus: 'DISPATCHED',
          toStatus: 'PARTIALLY_DISPATCHED',
          changedById: null,
          reason: `Data repair: manual dispatch had also marked unfinished item(s) as shipped. Restored to production: ${unfinished.map((i) => i.product.name).join(', ')}`,
          metadata: { repair: 'manual-dispatch-unfinished-items', restoredItemIds: unfinished.map((i) => i.id) },
        },
      });
    });
    console.log(`Repaired order ${order.orderNumber}.`);
  }
  console.log('\nDone. Refresh Production.');
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
