/**
 * fix-missing-approval-log.js
 *
 * WHY THIS EXISTS
 * ----------------
 * Dispatch > Queue only shows non-sample orders that have a StatusLog entry
 * PENDING_DISPATCH_APPROVAL → READY_FOR_DISPATCH (see the "SECURITY GUARD"
 * comment in dispatch.service.ts listReadyForDispatch). Clicking "↩ Queue"
 * (dispatch.service.ts returnToQueue) correctly resets order.status and every
 * item's itemProductionStage back to READY_FOR_DISPATCH, but it does NOT
 * create that approval log — it only logs fromStatus: <previous status>,
 * toStatus: READY_FOR_DISPATCH ("Returned to dispatch queue by user").
 *
 * So an order that never went through the normal Sales-submit → Accounts-
 * approve flow (e.g. it was pushed straight to READY_FOR_DISPATCH by hand,
 * for testing) will vanish from History after "↩ Queue" but never reappear
 * in the Queue tab, because it's missing the one log entry the queue query
 * requires. This script finds exactly that mismatch for a given order and,
 * with --apply, adds the missing log so the order reappears in Queue.
 *
 * This does NOT touch order.status or item stages (returnToQueue already set
 * those correctly) — it only adds the missing audit log entry.
 *
 * HOW TO RUN (from your own machine, needs real DATABASE_URL to Railway):
 *   cd backend
 *   node scripts/fix-missing-approval-log.js 1393          # dry run
 *   node scripts/fix-missing-approval-log.js 1393 --apply   # actually fix
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

const { PrismaClient, OrderStatus } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const orderNumberArg = process.argv[2];
const apply = process.argv.includes('--apply');

async function main() {
  if (!orderNumberArg) {
    console.error('Usage: node scripts/fix-missing-approval-log.js <orderNumber> [--apply]');
    process.exitCode = 1;
    return;
  }

  const order = await prisma.order.findUnique({
    where: { orderNumber: orderNumberArg },
    include: {
      items: { select: { id: true, itemProductionStage: true } },
      statusLogs: { select: { fromStatus: true, toStatus: true, createdAt: true }, orderBy: { createdAt: 'desc' } },
    },
  });

  if (!order) {
    console.error(`Order ${orderNumberArg} not found.`);
    process.exitCode = 1;
    return;
  }

  const readyItems = order.items.filter((i) => i.itemProductionStage === 'READY_FOR_DISPATCH');
  const hasApprovalLog = order.statusLogs.some(
    (l) => l.fromStatus === 'PENDING_DISPATCH_APPROVAL' && l.toStatus === 'READY_FOR_DISPATCH',
  );

  console.log(`Order ${order.orderNumber}`);
  console.log(`  status: ${order.status}`);
  console.log(`  isSample: ${order.isSample}`);
  console.log(`  readyItems: ${readyItems.length}/${order.items.length}`);
  console.log(`  hasApprovalLog: ${hasApprovalLog}`);
  console.log(`  recent statusLogs: ${order.statusLogs.slice(0, 5).map((l) => `${l.fromStatus}→${l.toStatus}`).join(', ')}`);

  if (order.isSample) {
    console.log('\nOrder is marked isSample — it should already be exempt from the approval-log gate. Not a fix candidate.');
    return;
  }
  if (order.status !== 'READY_FOR_DISPATCH' && order.status !== 'PARTIALLY_DISPATCHED') {
    console.log(`\nOrder status is ${order.status}, not READY_FOR_DISPATCH/PARTIALLY_DISPATCHED — Queue gate isn't the issue here.`);
    return;
  }
  if (readyItems.length === 0) {
    console.log('\nNo items are at READY_FOR_DISPATCH stage — that, not the approval log, is why it is missing from Queue.');
    return;
  }
  if (hasApprovalLog) {
    console.log('\nApproval log already present — this is not the cause. Queue visibility issue lies elsewhere.');
    return;
  }

  console.log(`\n${apply ? 'Fixing' : 'Would fix'}: adding missing PENDING_DISPATCH_APPROVAL → READY_FOR_DISPATCH log so order reappears in Queue.`);
  if (!apply) {
    console.log('Re-run with --apply to make the change.');
    return;
  }

  await prisma.statusLog.create({
    data: {
      orderId: order.id,
      fromStatus: OrderStatus.PENDING_DISPATCH_APPROVAL,
      toStatus: OrderStatus.READY_FOR_DISPATCH,
      reason: 'Backfilled: order was manually returned to queue via "↩ Queue" but had no prior Accounts-approval log, so it was invisible in Dispatch > Queue — added by fix-missing-approval-log.js',
    },
  });
  console.log('Done. Refresh Dispatch > Queue.');
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
