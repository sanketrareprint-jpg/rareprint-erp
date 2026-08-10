/**
 * renumber-orders-after-1465.js
 *
 * Closes gaps in Order.orderNumber for every regular (non-sample, non-test)
 * order numbered above 1465. Orders are sorted by their CURRENT orderNumber
 * (numeric) so relative order is preserved — only the gaps disappear.
 *
 *   1465, 1467, 1470, 1471, 1472, 1474   →   1465, 1466, 1467, 1468, 1469, 1470
 *
 * Linked Invoice.invoiceNumber is updated to match, same as
 * renumber-sample-orders.js does.
 *
 * Run dry-run first:
 *   node scripts/renumber-orders-after-1465.js
 *
 * Apply changes:
 *   node scripts/renumber-orders-after-1465.js --apply
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const CUTOFF = 1465; // last order number to leave untouched

async function main() {
  console.log(APPLY ? '⚡ APPLYING changes...' : '🔍 DRY RUN — pass --apply to commit');

  const regularOrders = await prisma.$queryRaw`
    SELECT id, "orderNumber", "createdAt"
    FROM "Order"
    WHERE "isSample" = false AND "isTest" = false
  `;

  // Only numeric order numbers above the cutoff
  const candidates = regularOrders
    .filter((o) => /^\d+$/.test(o.orderNumber) && parseInt(o.orderNumber, 10) > CUTOFF)
    .sort((a, b) => parseInt(a.orderNumber, 10) - parseInt(b.orderNumber, 10));

  const renameMap = new Map(); // oldNumber -> newNumber
  candidates.forEach((o, i) => {
    const newNum = String(CUTOFF + 1 + i);
    if (newNum !== o.orderNumber) {
      renameMap.set(o.orderNumber, newNum);
    }
  });

  console.log(`\n📋 Orders after ${CUTOFF} needing renumber (${renameMap.size} of ${candidates.length} scanned):`);
  renameMap.forEach((newNum, oldNum) => {
    console.log(`  ${oldNum} → ${newNum}`);
  });

  if (renameMap.size === 0) {
    console.log('\n✅ Nothing to do — already sequential.');
    return;
  }

  if (!APPLY) {
    console.log('\n✅ Dry run complete. Run with --apply to make changes.');
    return;
  }

  const toRename = candidates.filter((o) => renameMap.has(o.orderNumber));

  // Pass 1: temp rename to dodge the unique constraint
  console.log('\n🔄 Pass 1: temp rename...');
  for (const o of toRename) {
    await prisma.order.update({ where: { id: o.id }, data: { orderNumber: `tmp-${o.id}` } });
  }

  // Pass 2: apply final numbers + update linked invoices
  console.log('🔄 Pass 2: applying final numbers + updating invoices...');
  for (const o of toRename) {
    const newNum = renameMap.get(o.orderNumber);
    await prisma.order.update({ where: { id: o.id }, data: { orderNumber: newNum } });

    const invoice = await prisma.invoice.findUnique({ where: { orderId: o.id } });
    if (invoice) {
      await prisma.invoice.update({ where: { id: invoice.id }, data: { invoiceNumber: newNum } });
      console.log(`  ✓ Order ${o.orderNumber} → ${newNum}  |  Invoice → ${newNum}`);
    } else {
      console.log(`  ✓ Order ${o.orderNumber} → ${newNum}`);
    }
  }

  console.log(`\n🎉 Done! Orders after ${CUTOFF} are now gap-free.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
