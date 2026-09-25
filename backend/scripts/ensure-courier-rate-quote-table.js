// Creates the Courier Calculator history table (CourierRateQuote) if it is
// missing. Same idempotent SQL as
// prisma/migrations/20260925130000_add_courier_rate_quotes.
//
// Why a script and not `prisma migrate deploy`: see ensure-estimate-tables.js
// (production's _prisma_migrations has a FAILED row that blocks migrate deploy).
//
// Run locally, never in the Railway boot path (see team-history gotcha #1):
//   node scripts/ensure-courier-rate-quote-table.js
// backend/.env points at PRODUCTION — set $env:DATABASE_URL first to target
// another database. Safe to re-run: every statement is IF NOT EXISTS.
require('dotenv/config');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('[ensure-courier-rate-quote-table] DATABASE_URL is not set — nothing done.');
    process.exit(1);
  }
  const host = (() => { try { return new URL(connectionString).host; } catch { return '?'; } })();
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const before = await client.query(`SELECT to_regclass('public."CourierRateQuote"') AS t`);
    const sql = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'migrations', '20260925130000_add_courier_rate_quotes', 'migration.sql'), 'utf8');
    await client.query(sql);
    const after = await client.query(`SELECT to_regclass('public."CourierRateQuote"') AS t`);
    const status = before.rows[0].t ? 'already exists' : after.rows[0].t ? 'added' : 'MISSING — check errors above';
    console.log(`[ensure-courier-rate-quote-table] ${host}: CourierRateQuote ${status}`);
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error('[ensure-courier-rate-quote-table] FAILED:', e.message); process.exit(1); });
