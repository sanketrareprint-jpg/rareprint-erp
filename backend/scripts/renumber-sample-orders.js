/**
 * renumber-sample-orders.js
 *
 * 1. Assigns S-001, S-002… to all isSample=true orders (sorted by createdAt).
 * 2. Renumbers regular orders sequentially (1201, 1202…) to close any gaps,
 *    also updating the linked Invoice.invoiceNumber.
 *
 * Run dry-run first:
 *   node scripts/renumber-sample-orders.js
 *
 * Apply changes:
 *   node scripts/renumber-sample-orders.js --apply
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

async function main() {
  console.log(APPLY ? '⚡ APPLYING changes...' : '🔍 DRY RUN — pass --apply to commit');

  // ── 1. Sample orders → S-001, S-002… ─────────────────────────────────────
  const sampleOrders = await prisma.$queryRaw`
    SELECT id, "orderNumber", "createdAt"
    FROM "Order"
    WHERE "isSample" = true
    ORDER BY "createdAt" ASC
  `;

  const sampleRenameMap = new Map(); // oldNumber → newNumber
  sampleOrders.forEach((o, i) => {
    const newNum = `S-${String(i + 1).padStart(3, '0')}`;
    sampleRenameMap.set(o.orderNumber, newNum);
  });

  console.log(`\n📦 Sample orders to rename (${sampleOrders.length}):`);
  sampleOrders.forEach(o => {
    console.log(`  ${o.orderNumber} → ${sampleRenameMap.get(o.orderNumber)}`);
  });

  // ── 2. Regular orders → sequential renumber ───────────────────────────────
  const regularOrders = await prisma.$queryRaw`
    SELECT id, "orderNumber", "createdAt"
    FROM "Order"
    WHERE "isSample" = false AND "isTest" = false
    ORDER BY "createdAt" ASC
  `;

  // Filter to only numeric ones (skip any already-weird ones)
  const numericOrders = regularOrders.filter(o => /^\d+$/.test(o.orderNumber));

  // Find current base (min numeric order number in DB)
  const minNum = Math.min(...numericOrders.map(o => parseInt(o.orderNumber)));
  const BASE = isNaN(minNum) ? 1201 : minNum;

  const regularRenameMap = new Map(); // oldNumber → newNumber
  numericOrders.forEach((o, i) => {
    const newNum = String(BASE + i);
    if (newNum !== o.orderNumber) {
      regularRenameMap.set(o.orderNumber, newNum);
    }
  });

  console.log(`\n📋 Regular orders needing renumber (${regularRenameMap.size}):`);
  regularRenameMap.forEach((newNum, oldNum) => {
    console.log(`  ${oldNum} → ${newNum}`);
  });

  if (!APPLY) {
    console.log('\n✅ Dry run complete. Run with --apply to make changes.');
    return;
  }

  // ── Apply sample renames ───────────────────────────────────────────────────
  console.log('\n🔄 Renaming sample orders...');
  for (const o of sampleOrders) {
    const newNum = sampleRenameMap.get(o.orderNumber);
    if (newNum && newNum !== o.orderNumber) {
      await prisma.order.update({ where: { id: o.id }, data: { orderNumber: newNum } });
      console.log(`  ✓ ${o.orderNumber} → ${newNum}`);
    }
  }

  // ── Apply regular renumbers (in two passes to avoid unique constraint conflicts) ──
  // Pass 1: rename to temp names (tmp-<id>) to free up numbers
  console.log('\n🔄 Pass 1: temp rename regular orders...');
  const toRename = numericOrders.filter(o => regularRenameMap.has(o.orderNumber));
  for (const o of toRename) {
    await prisma.order.update({ where: { id: o.id }, data: { orderNumber: `tmp-${o.id}` } });
  }

  // Pass 2: apply final numbers + update invoices
  console.log('🔄 Pass 2: applying final numbers + updating invoices...');
  for (const o of toRename) {
    const newNum = regularRenameMap.get(o.orderNumber);
    await prisma.order.update({ where: { id: o.id }, data: { orderNumber: newNum } });

    // Update linked invoice if exists
    const invoice = await prisma.invoice.findUnique({ where: { orderId: o.id } });
    if (invoice) {
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { invoiceNumber: newNum },
      });
      console.log(`  ✓ Order ${o.orderNumber} → ${newNum}  |  Invoice → ${newNum}`);
    } else {
      console.log(`  ✓ Order ${o.orderNumber} → ${newNum}`);
    }
  }

  console.log('\n🎉 Done! All sample orders have S-XXX numbers, regular orders are gap-free.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
