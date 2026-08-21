/**
 * fix-product-code-order-1184.js
 *
 * One-off: order 1184 (SIRI GIRI CLINIC) has a single line item whose
 * product's SKU/product code needs to become "FL300SS".
 *
 * Note: Product.sku is shared across every order that uses this same
 * product row, not just order 1184 — this changes the code everywhere that
 * product appears (Orders, Cost Table, Dispatch, etc.), which is the normal
 * effect of renaming a product's code. Product.sku is also @unique, so this
 * will refuse to apply if another product already uses "FL300SS".
 *
 * HOW TO RUN (from your own machine, needs real DATABASE_URL to Railway):
 *   cd backend
 *   node scripts/fix-product-code-order-1184.js           # dry run — shows what would change
 *   node scripts/fix-product-code-order-1184.js --apply    # actually renames it
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

const ORDER_NUMBER = '1184';
const NEW_SKU = 'FL300SS';
const apply = process.argv.includes('--apply');

async function main() {
  const order = await prisma.order.findFirst({
    where: { orderNumber: ORDER_NUMBER },
    include: {
      customer: { select: { businessName: true } },
      items: { include: { product: true } },
    },
  });

  if (!order) {
    console.log(`Order ${ORDER_NUMBER} not found.`);
    return;
  }

  console.log(`Order ${ORDER_NUMBER} — ${order.customer?.businessName ?? '(no customer)'}`);
  console.log(`Line items: ${order.items.length}`);
  for (const item of order.items) {
    console.log(`  - productId=${item.productId}  currentSku="${item.product?.sku}"  name="${item.product?.name}"  qty=${item.quantity}`);
  }

  if (order.items.length !== 1) {
    console.log('\nThis order does not have exactly one line item — stopping. Tell me which productId to rename.');
    return;
  }

  const product = order.items[0].product;
  if (!product) {
    console.log('\nLine item has no linked product — nothing to rename.');
    return;
  }

  if (product.sku === NEW_SKU) {
    console.log(`\nProduct already has SKU "${NEW_SKU}" — nothing to do.`);
    return;
  }

  const clash = await prisma.product.findUnique({ where: { sku: NEW_SKU } });
  if (clash && clash.id !== product.id) {
    console.log(`\nRefusing to apply: another product already uses SKU "${NEW_SKU}" (id=${clash.id}, name="${clash.name}"). Pick a different code or fix that product first.`);
    return;
  }

  console.log(`\nWould rename product ${product.id} ("${product.name}") from "${product.sku}" to "${NEW_SKU}".`);
  console.log('This affects every order that uses this product, not just 1184.');

  if (!apply) {
    console.log('\nDry run only — re-run with --apply to make the change.');
    return;
  }

  await prisma.product.update({
    where: { id: product.id },
    data: { sku: NEW_SKU },
  });
  console.log(`\nDone — product ${product.id} SKU is now "${NEW_SKU}".`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
