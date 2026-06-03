/**
 * audit-system-orders.js
 *
 * Finds every order touched by the System scripts (no changedById / "Returned from
 * dispatch queue" or "Corrected: restored" reason), shows their current state, and
 * — with --apply — moves eligible ones back into READY_FOR_DISPATCH so they appear
 * in the dispatch queue.
 *
 * An order is eligible if:
 *   1. It has AT LEAST ONE statusLog with fromStatus=PENDING_DISPATCH_APPROVAL
 *      toStatus=READY_FOR_DISPATCH  (i.e. accounts already approved the dispatch)
 *   2. Its current status is NOT already DISPATCHED / PARTIALLY_DISPATCHED / DELIVERED
 *
 * Usage:
 *   node scripts/audit-system-orders.js           # dry-run, just list
 *   node scripts/audit-system-orders.js --apply   # actually fix
 */

const path = require('path');
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch {}

const { PrismaClient, OrderStatus } = require('@prisma/client');
const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');

const SYSTEM_REASONS = [
  'Returned from dispatch queue for sales to resubmit COD/prepaid and courier amount',
  'Corrected: restored to READY_FOR_DISPATCH so sales can submit for dispatch approval',
];

const TERMINAL = new Set([
  OrderStatus.DISPATCHED,
  OrderStatus.PARTIALLY_DISPATCHED,
  OrderStatus.DELIVERED,
  OrderStatus.CANCELLED,
]);

async function main() {
  // 1. Find all orders that have any System-script log entry
  const affected = await prisma.order.findMany({
    where: {
      statusLogs: {
        some: { reason: { in: SYSTEM_REASONS } },
      },
    },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      customer: { select: { name: true } },
      statusLogs: {
        orderBy: { createdAt: 'asc' },
        select: {
          fromStatus: true,
          toStatus: true,
          reason: true,
          createdAt: true,
          changedById: true,
        },
      },
    },
    orderBy: { orderNumber: 'asc' },
  });

  if (affected.length === 0) {
    console.log('No orders found that were touched by System scripts.');
    return;
  }

  console.log(`\n=== ${affected.length} order(s) touched by System scripts ===\n`);

  const eligible = [];

  for (const order of affected) {
    const systemLogs = order.statusLogs.filter(l => SYSTEM_REASONS.includes(l.reason));
    const hasDispatchApproval = order.statusLogs.some(
      l => l.fromStatus === OrderStatus.PENDING_DISPATCH_APPROVAL &&
           l.toStatus === OrderStatus.READY_FOR_DISPATCH,
    );
    const isTerminal = TERMINAL.has(order.status);
    const alreadyReady = order.status === OrderStatus.READY_FOR_DISPATCH;
    const canFix = hasDispatchApproval && !isTerminal;

    console.log(`Order #${order.orderNumber} — ${order.customer.name}`);
    console.log(`  Current status  : ${order.status}`);
    console.log(`  Dispatch approved by accounts : ${hasDispatchApproval ? 'YES ✓' : 'NO ✗'}`);
    console.log(`  System log entries:`);
    for (const l of systemLogs) {
      console.log(`    [${l.createdAt.toISOString().slice(0,16)}] ${l.fromStatus} → ${l.toStatus}`);
      console.log(`    Reason: ${l.reason}`);
    }

    if (isTerminal) {
      console.log(`  Action: SKIP — already in terminal status (${order.status})`);
    } else if (!hasDispatchApproval) {
      console.log(`  Action: SKIP — accounts never approved dispatch; sales must resubmit`);
    } else if (alreadyReady) {
      console.log(`  Action: ALREADY in READY_FOR_DISPATCH — should appear in dispatch queue ✓`);
    } else {
      console.log(`  Action: ${apply ? 'FIXING' : 'WOULD FIX'} → READY_FOR_DISPATCH`);
      eligible.push(order);
    }
    console.log();
  }

  console.log(`\nSummary: ${eligible.length} order(s) ${apply ? 'to fix' : 'eligible for fix'}.`);

  if (!apply || eligible.length === 0) {
    if (!apply && eligible.length > 0) {
      console.log('Run with --apply to actually move them to READY_FOR_DISPATCH.');
    }
    return;
  }

  // 2. Fix eligible orders
  await prisma.$transaction(
    eligible.flatMap(order => [
      prisma.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.READY_FOR_DISPATCH },
      }),
      prisma.statusLog.create({
        data: {
          orderId: order.id,
          fromStatus: order.status,
          toStatus: OrderStatus.READY_FOR_DISPATCH,
          reason: 'System correction: accounts had previously approved dispatch; restored to READY_FOR_DISPATCH for dispatch team',
        },
      }),
    ])
  );

  console.log(`\n✓ Fixed ${eligible.length} order(s) → READY_FOR_DISPATCH. They now appear in the dispatch queue.`);
}

main()
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
