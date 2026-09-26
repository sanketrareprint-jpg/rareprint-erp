// Adds Product."hsnCode" if missing — same SQL as
// prisma/migrations/20260926130000_add_product_hsn_code.
// A script rather than `prisma migrate deploy` for the same reason as
// ensure-estimate-tables.js: production's _prisma_migrations has a failed
// 20260907140000_add_tenant_id_rollout row, so migrate deploy won't run.
// Run locally, never in the Railway boot path:
//   node scripts/ensure-product-hsn-code-column.js
// backend/.env is PRODUCTION — set $env:DATABASE_URL to target another DB.
require('dotenv/config');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('[ensure-product-hsn-code-column] DATABASE_URL is not set — nothing done.');
    process.exit(1);
  }
  const host = (() => { try { return new URL(connectionString).host; } catch { return '?'; } })();
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const has = async () => (await client.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Product' AND column_name='hsnCode'`,
    )).rowCount > 0;
    const before = await has();
    const sql = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'migrations', '20260926130000_add_product_hsn_code', 'migration.sql'), 'utf8');
    await client.query(sql);
    const after = await has();
    console.log(`[ensure-product-hsn-code-column] ${host}: Product.hsnCode ${before ? 'already exists' : after ? 'added' : 'MISSING — check errors above'}`);
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error('[ensure-product-hsn-code-column] FAILED:', e.message); process.exit(1); });
