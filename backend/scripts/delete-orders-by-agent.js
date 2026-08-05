/**
 * delete-orders-by-agent.js
 *
 * Deletes every Order (and all its cascading child records — items, payments,
 * invoice, shipments, status logs, ledger entries, commissions, etc.) created
 * under a given sales agent's name. Built for cleaning up test data created
 * under a real staff account (e.g. Yash's Bigship integration testing, where
 * the "+ Test Order" button didn't actually create isTest=true orders, so
 * real orders were used instead).
 *
 * Two relations on Order are NOT cascade-deleted at the DB level
 * (Complaint.orderId, RemittanceRecord.matchedOrderId/suggestedOrderId) —
 * this script detaches those references (sets them to null) rather than
 * deleting the Complaint/RemittanceRecord rows themselves, since those belong
 * to real bank-statement/complaint records that must not be touched.
 *
 * Run dry-run first (default, no changes made):
 *   node scripts/delete-orders-by-agent.js "Yash Chunarkar"
 *
 * Apply for real:
 *   node scripts/delete-orders-by-agent.js "Yash Chunarkar" --apply
 *
 * After this, run the existing renumber script to close the resulting gaps:
 *   node scripts/renumber-sample-orders.js --apply
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');
const agentName = process.argv[2];

async function main() {
  if (!agentName || agentName.startsWith('--')) {
    console.error('Usage: node scripts/delete-orders-by-agent.js "Full Name" [--apply]');
    process.exit(1);
  }

  console.log(APPLY ? `⚡ APPLYING — deleting all orders for "${agentName}"...` : `🔍 DRY RUN for "${agentName}" — pass --apply to actually delete`);

  const users = await prisma.user.findMany({
    where: { fullName: { equals: agentName, mode: 'insensitive' } },
    select: { id: true, fullName: true, email: true },
  });

  if (users.length === 0) {
    console.error(`No user found with fullName "${agentName}". Aborting — nothing deleted.`);
    process.exit(1);
  }
  if (users.length > 1) {
    console.error(`Found ${users.length} users matching "${agentName}" — refusing to guess which one. Aborting.`);
    users.forEach(u => console.error(`  - ${u.fullName} <${u.email}> (${u.id})`));
    process.exit(1);
  }

  const agent = users[0];
  console.log(`\nMatched user: ${agent.fullName} <${agent.email}> (${agent.id})`);

  const orders = await prisma.order.findMany({
    where: { salesAgentId: agent.id },
    select: {
      id: true, orderNumber: true, status: true, grandTotal: true, isTest: true, isSample: true,
      customer: { select: { businessName: true } },
    },
    orderBy: { orderNumber: 'asc' },
  });

  if (orders.length === 0) {
    console.log('No orders found for this agent. Nothing to do.');
    return;
  }

  console.log(`\n📋 Orders to delete (${orders.length}):`);
  orders.forEach(o => {
    console.log(`  ${o.orderNumber}  ${o.status}  ₹${o.grandTotal}  ${o.customer.businessName}${o.isTest ? '  [isTest]' : ''}${o.isSample ? '  [isSample]' : ''}`);
  });

  const orderIds = orders.map(o => o.id);

  // Show what non-cascading references will be detached, for visibility.
  const complaints = await prisma.complaint.findMany({
    where: { orderId: { in: orderIds } },
    select: { id: true, orderId: true },
  });
  const remittances = await prisma.remittanceRecord.findMany({
    where: { OR: [{ matchedOrderId: { in: orderIds } }, { suggestedOrderId: { in: orderIds } }] },
    select: { id: true, matchedOrderId: true, suggestedOrderId: true },
  });

  if (complaints.length > 0) {
    console.log(`\n⚠️  ${complaints.length} Complaint record(s) reference these orders — will detach (set orderId = null), not delete the complaint itself.`);
  }
  if (remittances.length > 0) {
    console.log(`\n⚠️  ${remittances.length} RemittanceRecord(s) reference these orders — will detach the reference, not delete the bank-transaction match itself.`);
  }

  if (!APPLY) {
    console.log('\n✅ Dry run complete. Nothing was changed. Re-run with --apply to actually delete these orders.');
    console.log('   After deleting, run: node scripts/renumber-sample-orders.js --apply   (to close the number gaps)');
    return;
  }

  console.log('\n🔄 Detaching non-cascading references...');
  if (complaints.length > 0) {
    await prisma.complaint.updateMany({ where: { orderId: { in: orderIds } }, data: { orderId: null } });
  }
  if (remittances.length > 0) {
    await prisma.remittanceRecord.updateMany({ where: { matchedOrderId: { in: orderIds } }, data: { matchedOrderId: null } });
    await prisma.remittanceRecord.updateMany({ where: { suggestedOrderId: { in: orderIds } }, data: { suggestedOrderId: null } });
  }

  console.log('🔄 Deleting orders (cascades to items, payments, invoice, shipments, status logs, ledger entries, commissions)...');
  let deleted = 0;
  for (const o of orders) {
    try {
      await prisma.order.delete({ where: { id: o.id } });
      deleted++;
      console.log(`  ✓ Deleted ${o.orderNumber}`);
    } catch (e) {
      console.error(`  ✗ Failed to delete ${o.orderNumber}: ${e.message}`);
    }
  }

  console.log(`\n🎉 Done. Deleted ${deleted}/${orders.length} orders.`);
  console.log('   Now run: node scripts/renumber-sample-orders.js --apply   (to close the number gaps left behind)');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
