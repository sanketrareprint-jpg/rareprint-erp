// One-off helper: inserts a single dummy Product (+ its ProductCategory, if
// missing) directly into a database, so a brand-new, empty SaaS test
// customer has something orderable. This is a STOPGAP for manual testing —
// see saas-ops's test-customer walkthrough (2026-09-16). There is currently
// no UI or API in the app itself to create a Product (Cost Table's CSV
// import only sets cost/rate slabs on products that already exist; Design
// Studio's "Create Product" form only writes to local React state, never
// the database). Adding a real create-product feature is a separate,
// tracked gap — this script is only for unblocking today's test order.
//
// Usage: node scripts/seed-test-product.js
// (reads DATABASE_URL from the environment, same convention as
// provision-new-customer-migrate.js)

require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

// SAME SAFETY GUARD as provision-new-customer-migrate.js — see that file's
// header comment for why this exists (a real incident on 2026-09-15). This
// script writes directly to the database; it must never run against
// production.
const PRODUCTION_HOST_FRAGMENT = 'monorail.proxy.rlwy.net';

const databaseUrl = process.env.DATABASE_URL || '';
if (databaseUrl.includes(PRODUCTION_HOST_FRAGMENT)) {
  console.error(
    `[seed-test-product] REFUSING TO RUN: DATABASE_URL points at what looks like RarePrint's own production database (host contains "${PRODUCTION_HOST_FRAGMENT}"). This script is only for disposable SaaS test customer databases. Stopping before touching anything.`
  );
  process.exit(1);
}
if (!databaseUrl) {
  console.error('[seed-test-product] REFUSING TO RUN: DATABASE_URL is not set at all.');
  process.exit(1);
}

// Prisma ORM v7 needs a driver adapter passed explicitly instead of reading
// a connection string from schema.prisma — same setup as PrismaService.
const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

async function main() {
  const category = await prisma.productCategory.upsert({
    where: { name: 'Test Category' },
    update: {},
    create: { name: 'Test Category', description: 'Created by seed-test-product.js for manual SaaS testing.' },
  });

  const product = await prisma.product.upsert({
    where: { sku: 'TEST-STICKER-001' },
    update: {},
    create: {
      sku: 'TEST-STICKER-001',
      name: 'Test Sticker Roll',
      description: 'Dummy product created by seed-test-product.js for manual SaaS testing.',
      categoryId: category.id,
      gsm: 80,
      paperType: 'Sticker',
      sizeInches: '3x3',
      printingType: 'DIGITAL',
      sides: 'SINGLE_SIDE',
      isActive: true,
    },
  });

  console.log(`[seed-test-product] Category ready: "${category.name}" (${category.id})`);
  console.log(`[seed-test-product] Product ready: "${product.name}" — SKU ${product.sku} (${product.id})`);
  console.log('[seed-test-product] Done. This product should now be searchable in Create New Order.');
}

main()
  .catch((err) => {
    console.error('[seed-test-product] FATAL:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
