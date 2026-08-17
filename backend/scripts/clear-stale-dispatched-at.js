/**
 * clear-stale-dispatched-at.js
 *
 * WHY THIS EXISTS
 * ----------------
 * Root cause of "order returned to queue via '↩ Queue' but doesn't show up
 * in Dispatch > Queue": dispatch.service.ts returnToQueue() reset
 * itemProductionStage back to READY_FOR_DISPATCH but never cleared
 * OrderItem.dispatchedAt. listReadyForDispatch's readyItems filter excludes
 * any item with dispatchedAt still set (it means "already actually shipped"),
 * so the order silently disappeared from Queue with zero visible items.
 * Fixed in code (returnToQueue + autoReturnToQueueOnCancellation now clear
 * dispatchedAt too) — this script is the one-time data fix for items that
 * were returned to queue BEFORE that code fix, e.g. order 1393.
 *
 * HOW TO RUN (from your own machine, needs real DATABASE_URL to Railway):
 *   cd backend
 *   node scripts/clear-stale-dispatched-at.js 1393           # dry run
 *   node scripts/clear-stale-dispatched-at.js 1393 --apply    # actually fix
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

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const orderNumberArg = process.argv[2];
const apply = process.argv.includes('--apply');

async function main() {
  if (!orderNumberArg) {
    console.error('Usage: node scripts/clear-stale-dispatched-at.js <orderNumber> [--apply]');
    process.exitCode = 1;
    return;
  }

  const order = await prisma.order.findUnique({
    where: { orderNumber: orderNumberArg },
    include: { items: { select: { id: true, itemProductionStage: true, dispatchedAt: true } } },
  });

  if (!order) {
    console.error(`Order ${orderNumberArg} not found.`);
    process.exitCode = 1;
    return;
  }

  console.log(`Order ${order.orderNumber}  status: ${order.status}`);
  const stale = order.items.filter(
    (i) => i.itemProductionStage === 'READY_FOR_DISPATCH' && i.dispatchedAt !== null,
  );

  if (order.status !== 'READY_FOR_DISPATCH' && order.status !== 'PARTIALLY_DISPATCHED') {
    console.log(`Order status is ${order.status}, not back in the queue-eligible statuses — check that "↩ Queue" actually completed first.`);
    return;
  }
  if (stale.length === 0) {
    console.log('No items with itemProductionStage=READY_FOR_DISPATCH and a stale dispatchedAt — this is not the issue for this order.');
    return;
  }

  for (const i of stale) {
    console.log(`  item ${i.id}: itemProductionStage=READY_FOR_DISPATCH but dispatchedAt=${i.dispatchedAt.toISOString()} — this is why it's hidden from Queue`);
  }

  if (!apply) {
    console.log('\nRe-run with --apply to clear dispatchedAt on these items.');
    return;
  }

  await prisma.orderItem.updateMany({
    where: { id: { in: stale.map((i) => i.id) } },
    data: { dispatchedAt: null },
  });
  console.log('\nDone. Refresh Dispatch > Queue.');
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
