// One-off script to permanently delete a SINGLE line item from an order
// (not the whole order) — for cases like order 1265 where only one of
// several products needs to be removed (e.g. added by mistake, or the
// customer cancelled just that product).
//
// Handles the same non-cascading foreign key that delete-order.js does:
// PrintSheetItem.orderItemId has no ON DELETE CASCADE, so it has to be
// cleared first or the OrderItem delete would fail. JobWork, ItemStageLog,
// and CommissionOverride all do cascade automatically (confirmed against
// schema.prisma), so those don't need manual handling.
//
// After deleting the item, the order's subtotal and grandTotal are reduced
// by that item's lineTotal so the order's totals/balance-due stay accurate
// for the remaining items. Nothing else about the order (status, payments,
// other items) is touched.
//
// Requires typing an exact confirmation phrase before anything is deleted.
//
// Usage (from backend/, on your machine, with production DATABASE_URL
// available the same way `npx prisma migrate deploy` picks it up):
//   node delete-order-item.js <orderNumber> <productNameContains>
//   e.g. node delete-order-item.js 1265 "VISITING CARD"

require('dotenv/config');
const { PrismaClient, Prisma } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const readline = require('readline');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const p = new PrismaClient({ adapter });

const ORDER_NUMBER = process.argv[2];
const PRODUCT_MATCH = process.argv[3];

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans); }));
}

async function main() {
  if (!ORDER_NUMBER || !PRODUCT_MATCH) {
    console.log('Usage: node delete-order-item.js <orderNumber> <productNameContains>');
    console.log('e.g.:  node delete-order-item.js 1265 "VISITING CARD"');
    return;
  }

  const order = await p.order.findUnique({
    where: { orderNumber: ORDER_NUMBER },
    include: { items: { include: { product: true } }, customer: true },
  });
  if (!order) {
    console.log(`No order found with orderNumber "${ORDER_NUMBER}". Nothing to do.`);
    return;
  }

  const matches = order.items.filter((i) =>
    i.product.name.toUpperCase().includes(PRODUCT_MATCH.toUpperCase()),
  );

  if (matches.length === 0) {
    console.log(`No item matching "${PRODUCT_MATCH}" found on order ${ORDER_NUMBER}.`);
    console.log('Items on this order:');
    order.items.forEach((i) => console.log(`  - ${i.product.name} (qty ${i.quantity}, ₹${i.lineTotal})`));
    return;
  }
  if (matches.length > 1) {
    console.log(`Multiple items match "${PRODUCT_MATCH}" — be more specific:`);
    matches.forEach((i) => console.log(`  - ${i.product.name} (id: ${i.id}, qty ${i.quantity}, ₹${i.lineTotal})`));
    return;
  }
  if (order.items.length === 1) {
    console.log(`This is the only item on order ${ORDER_NUMBER}. Use delete-order.js instead if you want to delete the whole order.`);
    return;
  }

  const item = matches[0];
  const printSheetItems = await p.printSheetItem.findMany({ where: { orderItemId: item.id } });

  console.log('──────────────────────────────────────────');
  console.log(`Order:                   ${order.orderNumber} (${order.customer?.businessName ?? '—'})`);
  console.log(`Item to delete:          ${item.product.name}`);
  console.log(`  Quantity:              ${item.quantity}`);
  console.log(`  Line total:            ₹${item.lineTotal}`);
  console.log(`  Print-sheet placements:${printSheetItems.length}`);
  console.log(`Order subtotal:          ₹${order.subtotal} → ₹${Number(order.subtotal) - Number(item.lineTotal)}`);
  console.log(`Order grandTotal:        ₹${order.grandTotal} → ₹${Number(order.grandTotal) - Number(item.lineTotal)}`);
  console.log(`Remaining items after:  ${order.items.length - 1}`);
  console.log('──────────────────────────────────────────');
  console.log('This PERMANENTLY deletes only this one item (and its sheet');
  console.log('placements/job-work/commission records). The rest of the order');
  console.log('and its other items are untouched. Cannot be undone.');
  console.log('');

  // Confirmation phrase names the exact item, not just the order number —
  // so what you're confirming matches what's about to be deleted, with no
  // ambiguity about whether this could touch the whole order.
  const confirmPhrase = `DELETE ${item.product.name} FROM ${ORDER_NUMBER}`;
  const answer = await ask(`Type "${confirmPhrase}" to confirm: `);
  if (answer.trim() !== confirmPhrase) {
    console.log('Confirmation text did not match — aborted, nothing was deleted.');
    return;
  }

  await p.$transaction(async (tx) => {
    await tx.printSheetItem.deleteMany({ where: { orderItemId: item.id } });
    await tx.orderItem.delete({ where: { id: item.id } });
    await tx.order.update({
      where: { id: order.id },
      data: {
        subtotal: new Prisma.Decimal(order.subtotal).minus(item.lineTotal),
        grandTotal: new Prisma.Decimal(order.grandTotal).minus(item.lineTotal),
      },
    });
  }, { maxWait: 20000, timeout: 20000 }); // generous headroom for a slow/remote DB connection

  console.log(`Done — "${item.product.name}" (item id: ${item.id}) removed from order ${ORDER_NUMBER}.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => p.$disconnect());
