// Creates the Billing > Estimates tables (Estimate, EstimateItem) if they are
// missing. Same idempotent SQL as prisma/migrations/20260925120000_add_estimates.
//
// Why a script and not `prisma migrate deploy`: production's _prisma_migrations
// has a FAILED row (20260907140000_add_tenant_id_rollout, from the reverted
// multi-tenant work), and `migrate deploy` refuses to apply anything new while
// a failed migration exists. Resolving that row is a separate decision, so
// this script applies just the estimates tables directly.
//
// Run locally, never in the Railway boot path (see team-history gotcha #1):
//   node scripts/ensure-estimate-tables.js
// backend/.env points at PRODUCTION — set $env:DATABASE_URL first to target
// another database. Safe to re-run: every statement is IF NOT EXISTS.
require('dotenv/config');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('[ensure-estimate-tables] DATABASE_URL is not set — nothing done.');
    process.exit(1);
  }
  const host = (() => { try { return new URL(connectionString).host; } catch { return '?'; } })();
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const before = await client.query(`SELECT to_regclass('public."Estimate"') AS e, to_regclass('public."EstimateItem"') AS i`);
    const sql = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'migrations', '20260925120000_add_estimates', 'migration.sql'), 'utf8');
    await client.query(sql);
    const after = await client.query(`SELECT to_regclass('public."Estimate"') AS e, to_regclass('public."EstimateItem"') AS i`);
    const status = (b, a) => (b ? 'already exists' : a ? 'added' : 'MISSING — check errors above');
    console.log(`[ensure-estimate-tables] ${host}: Estimate ${status(before.rows[0].e, after.rows[0].e)}, EstimateItem ${status(before.rows[0].i, after.rows[0].i)}`);
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error('[ensure-estimate-tables] FAILED:', e.message); process.exit(1); });
