/**
 * fix-order-1540-unitprice.js
 *
 * Order #1540 (Nikita Paul, Aug 2026) has an ENVELOPE (4x7, 70gsm) line item
 * with unitPrice=5227 and lineTotal=5227 for qty=5000 -- unitPrice should be
 * lineTotal/quantity = 1.0454, matching every other order of this same
 * product+quantity (see diagnose-nikita-profit.js output). This corrupted
 * unitPrice is what fed a cost-slab heuristic (in 4 different backend files)
 * that inflated this one line's cost 5000x, producing a -Rs.1.45 crore
 * phantom loss that dragged down the whole month's reported profit.
 *
 * SAFE BY DEFAULT: prints the item it found and the correction it WOULD
 * make, without writing anything. Only writes when run with --apply.
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes('--apply');

(async () => {
  const order = await prisma.order.findFirst({
    where: { orderNumber: 1540 },
    include: { items: { include: { product: { select: { name: true, sizeInches: true, gsm: true } } } } },
  });
  if (!order) { console.log('Order #1540 not found'); await prisma.$disconnect(); return; }

  const bad = order.items.find((i) => Number(i.unitPrice) === Number(i.lineTotal) && i.quantity > 1);
  if (!bad) {
    console.log('No line item on Order #1540 looks like the known bug (unitPrice === lineTotal with qty > 1). Nothing to do -- has this already been fixed?');
    await prisma.$disconnect();
    return;
  }

  const correctUnitPrice = Number(bad.lineTotal) / bad.quantity;
  console.log(`Order #1540, item ${bad.id}: ${bad.product.name} (${bad.product.sizeInches}, ${bad.product.gsm}gsm)`);
  console.log(`  quantity=${bad.quantity}  lineTotal=${bad.lineTotal}  current unitPrice=${bad.unitPrice}`);
  console.log(`  -> correct unitPrice = lineTotal / quantity = ${correctUnitPrice}`);

  if (!APPLY) {
    console.log('\nDRY RUN ONLY -- no changes made. Re-run as: node fix-order-1540-unitprice.js --apply');
  } else {
    await prisma.orderItem.update({ where: { id: bad.id }, data: { unitPrice: correctUnitPrice } });
    console.log('\nDone. unitPrice corrected. lineTotal/order totals were already correct and are untouched.');
    console.log('Note: this only fixes the stored data -- dashboards that cache/precompute figures may need a refresh (reload the page) to show the corrected profit.');
  }

  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
