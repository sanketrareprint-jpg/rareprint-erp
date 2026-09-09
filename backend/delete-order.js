// One-off script to permanently delete a single order by its order number,
// bypassing the app's normal "only PENDING_APPROVAL orders can be deleted"
// rule (see OrdersService.deleteOrder in orders.service.ts) — that rule
// exists because later-stage orders have production/dispatch/financial
// history attached, so this script handles that properly instead of just
// ignoring it:
//
//   1. Deletes PrintSheetItem rows for this order's items first — that's
//      the one table with a hard (non-cascading) foreign key to OrderItem,
//      so it would block the delete otherwise.
//   2. Deletes the Order itself. Everything else that references it
//      (OrderItem, Payment, Invoice, AccountingLedgerEntry, Commission,
//      ProductionJob, Shipment, StatusLog, OrderReassuranceLog, and
//      JobWork/CommissionOverride via OrderItem) cascades automatically —
//      confirmed against schema.prisma's ON DELETE CASCADE relations.
//      RemittanceRecord/Complaint links to this order just get nulled out
//      (ON DELETE SET NULL), not blocked.
//
// Requires typing an exact confirmation phrase before anything is deleted.
//
// Usage (from backend/, on your machine, with production DATABASE_URL
// available the same way `npx prisma migrate deploy` picks it up):
//   node delete-order.js 1424
//   (or just `node delete-order.js` — defaults to 1424)

require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const readline = require('readline');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const p = new PrismaClient({ adapter });

const ORDER_NUMBER = process.argv[2] || '1424';

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans); }));
}

async function main() {
  const order = await p.order.findUnique({
    where: { orderNumber: ORDER_NUMBER },
    include: { customer: true, items: true, payments: true, productionJobs: true, shipments: true },
  });
  if (!order) {
    console.log(`No order found with orderNumber "${ORDER_NUMBER}". Nothing to do.`);
    return;
  }

  const itemIds = order.items.map((i) => i.id);
  const printSheetItems = itemIds.length
    ? await p.printSheetItem.findMany({ where: { orderItemId: { in: itemIds } } })
    : [];

  console.log('──────────────────────────────────────────');
  console.log(`Order:                   ${order.orderNumber}`);
  console.log(`Customer:                ${order.customer?.businessName ?? '(none)'}`);
  console.log(`Status:                  ${order.status}`);
  console.log(`Grand total:             ${order.grandTotal}`);
  console.log(`Items:                   ${order.items.length}`);
  console.log(`Payments:                ${order.payments.length}`);
  console.log(`Production jobs:         ${order.productionJobs.length}`);
  console.log(`Shipments:               ${order.shipments.length}`);
  console.log(`Print-sheet placements:  ${printSheetItems.length}`);
  console.log('──────────────────────────────────────────');
  console.log('This PERMANENTLY deletes this order and everything directly');
  console.log('attached to it (items, payments, invoice, production jobs,');
  console.log('shipments, status logs, sheet placements). Cannot be undone.');
  console.log('');

  const answer = await ask(`Type "DELETE ${ORDER_NUMBER}" to confirm: `);
  if (answer.trim() !== `DELETE ${ORDER_NUMBER}`) {
    console.log('Confirmation text did not match — aborted, nothing was deleted.');
    return;
  }

  await p.$transaction(async (tx) => {
    await tx.printSheetItem.deleteMany({ where: { orderItemId: { in: itemIds } } });
    await tx.order.delete({ where: { id: order.id } });
  });

  console.log(`Done — order ${ORDER_NUMBER} (id: ${order.id}) has been deleted.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => p.$disconnect());
