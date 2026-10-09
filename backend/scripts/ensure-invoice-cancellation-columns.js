// Adds Invoice."cancelledAt"/"cancellationReason"/"cancelledSnapshot" if
// missing — same SQL as prisma/migrations/20261006120000_add_invoice_cancellation.
// A script rather than `prisma migrate deploy` for the same reason as
// ensure-invoice-courier-charge-column.js (production's _prisma_migrations
// has a failed row, so migrate deploy won't run).
// Run locally BEFORE deploying the code that reads these columns, never in
// the Railway boot path:
//   node scripts/ensure-invoice-cancellation-columns.js
// backend/.env is PRODUCTION — set $env:DATABASE_URL to target another DB.
require('dotenv/config');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const COLUMNS = ['cancelledAt', 'cancellationReason', 'cancelledSnapshot'];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('[ensure-invoice-cancellation-columns] DATABASE_URL is not set — nothing done.');
    process.exit(1);
  }
  const host = (() => { try { return new URL(connectionString).host; } catch { return '?'; } })();
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const existing = async () => new Set((await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='Invoice' AND column_name = ANY($1)`,
      [COLUMNS],
    )).rows.map((r) => r.column_name));
    const before = await existing();
    const sql = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'migrations', '20261006120000_add_invoice_cancellation', 'migration.sql'), 'utf8');
    await client.query(sql);
    const after = await existing();
    for (const col of COLUMNS) {
      console.log(`[ensure-invoice-cancellation-columns] ${host}: Invoice.${col} ${before.has(col) ? 'already exists' : after.has(col) ? 'added' : 'MISSING — check errors above'}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error('[ensure-invoice-cancellation-columns] FAILED:', e.message); process.exit(1); });
