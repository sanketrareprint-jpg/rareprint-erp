// Sets up the schema for a BRAND-NEW, EMPTY customer database — used only
// by saas-ops/provision-customer.js when provisioning a new customer's SaaS
// instance.
//
// WHY THIS DOESN'T JUST RUN `prisma migrate deploy`:
// A first version of this script did exactly that, and it failed on a real
// test run (2026-09-15): migration `20260520000100_performance_indexes`
// tries to create an index on OrderItem.itemProductionStage, but no
// migration file anywhere in prisma/migrations actually creates that
// column — it's declared in schema.prisma and used throughout the app, but
// was evidently added to production by hand at some point outside the
// tracked migration history. Given this project's own documented history
// of exactly this kind of drift (see railway-migrate.js's
// RECOVERABLE_MIGRATIONS list and ensure-all-columns.js), there is no
// confidence this is the ONLY such gap — replaying all 89 migration files
// in order against a truly empty database is not a reliable way to build a
// correct schema, only production's own long, manually-patched history
// makes `migrate deploy` work there.
//
// THE FIX — build from current state, not replayed history:
// `prisma db push` syncs a database directly to match schema.prisma (the
// schema the app actually runs against in production right now) without
// touching the migrations folder or its history at all. For a brand-new
// database this is strictly better: schema.prisma IS the real, current,
// working target schema, so pushing straight to it produces a database
// that actually matches what the app needs, with no historical gaps.
//
// After db push, the migration history is "baselined": every existing
// migration folder is marked as applied via `prisma migrate resolve
// --applied <name>`, WITHOUT running its SQL (the schema is already
// correct from db push — this just tells Prisma's bookkeeping the same
// thing). This is Prisma's own documented baselining pattern
// (prisma.io/docs/orm/prisma-migrate/workflows/baselining), applied here to
// a fresh database instead of an existing production one. It matters
// because saas-ops/rollout-migration.js later applies NEW migrations to
// this same customer database through the normal `prisma migrate deploy`
// path — without baselining, that would try to re-run all 89 old
// migrations from scratch and hit the exact same gap.
//
// Usage: node provision-new-customer-migrate.js
// (reads DATABASE_URL from the environment, same convention as
// railway-migrate.js — provision-customer.js sets it via spawnSync's env
// option, pointed at the new customer's database)

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const PRISMA_BIN = path.join(__dirname, '..', 'node_modules', '.bin', 'prisma');
const MIGRATIONS_DIR = path.join(__dirname, '..', 'prisma', 'migrations');

// SAFETY GUARD — added 2026-09-15 after a real incident: this script was
// run with DATABASE_URL intended to point at a new customer's database, but
// something (env var precedence, a missed step, a stale shell) caused it to
// actually connect to RarePrint's OWN production database instead —
// backend/.env's DATABASE_URL was silently used. `prisma db push
// --accept-data-loss` then ran directly against production and dropped 5
// real columns with real data (Order.customFields, OrderItem.customFields,
// PaperPurchaseOrder.transportCharges/totalBillAmount,
// PaperPurchaseItem.ratePerUnit) — data that turned out to be unrecoverable
// (no PITR, only stale 24-day/3-month-old volume backups). This script
// touches the database with `db push`, which can silently apply destructive
// changes — it must never be allowed to run against production, under any
// circumstances, regardless of what the caller intended.
//
// PRODUCTION_HOST_FRAGMENT is the distinctive part of production's real
// Railway TCP proxy hostname (from backend/.env's DATABASE_URL). If this
// ever changes (e.g. production's database is migrated to a new Railway
// proxy), update this constant — do not delete this check.
const PRODUCTION_HOST_FRAGMENT = 'monorail.proxy.rlwy.net';

const databaseUrl = process.env.DATABASE_URL || '';
if (databaseUrl.includes(PRODUCTION_HOST_FRAGMENT)) {
  console.error(
    `[provision-new-customer-migrate] REFUSING TO RUN: DATABASE_URL points at what looks like RarePrint's own production database (host contains "${PRODUCTION_HOST_FRAGMENT}"). This script is ONLY for brand-new customer databases and uses \`prisma db push\`, which can silently drop columns. This exact mistake happened for real on 2026-09-15 — see this file's header comment. Stopping before touching anything.`
  );
  process.exit(1);
}
if (!databaseUrl) {
  console.error('[provision-new-customer-migrate] REFUSING TO RUN: DATABASE_URL is not set at all.');
  process.exit(1);
}

function run(command, args) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });
}

console.log('[provision-new-customer-migrate] Pushing current schema.prisma directly to the new database (prisma db push)...');
const pushResult = run(PRISMA_BIN, ['db', 'push', '--accept-data-loss']);
if (pushResult.status !== 0) {
  console.error(
    `[provision-new-customer-migrate] FATAL: \`prisma db push\` exited with status ${pushResult.status} against a brand-new database. Investigate before retrying — do not treat this customer as provisioned.`
  );
  process.exit(pushResult.status ?? 1);
}

console.log('[provision-new-customer-migrate] Schema applied. Baselining migration history so future rollouts work normally...');
const migrationFolders = fs
  .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

// Baselining loop is resumable and retries transient connection drops —
// added 2026-09-16 after a real run failed 47/48 migrations in, hitting a
// one-off P1001 ("can't reach database server") on the Railway TCP proxy
// mid-loop (each migration spawns a brand-new `prisma` process/connection,
// so a single dropped connection shouldn't be fatal). Without this, re-running
// the script from scratch would immediately fail on migration #1, since
// Prisma's `migrate resolve --applied` errors (P3008) on a migration that's
// already baselined instead of treating it as a no-op.
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

const ALREADY_APPLIED_PATTERN = /already recorded as applied|P3008/i;
const CONNECTION_ERROR_PATTERN = /P1001|can't reach database server/i;
const MAX_ATTEMPTS = 4;

let baselinedCount = 0;
let skippedCount = 0;

for (const migration of migrationFolders) {
  let attempt = 0;
  for (;;) {
    attempt += 1;
    const resolveResult = spawnSync(PRISMA_BIN, ['migrate', 'resolve', '--applied', migration], {
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
    const output = `${resolveResult.stdout || ''}${resolveResult.stderr || ''}`;
    if (resolveResult.stdout) process.stdout.write(resolveResult.stdout);
    if (resolveResult.stderr) process.stderr.write(resolveResult.stderr);

    if (resolveResult.status === 0) {
      baselinedCount += 1;
      break;
    }
    if (ALREADY_APPLIED_PATTERN.test(output)) {
      console.log(`[provision-new-customer-migrate] ${migration} was already baselined (from a prior run) — skipping.`);
      skippedCount += 1;
      break;
    }
    if (CONNECTION_ERROR_PATTERN.test(output) && attempt < MAX_ATTEMPTS) {
      const delayMs = 5000 * attempt;
      console.warn(
        `[provision-new-customer-migrate] transient connection error baselining ${migration}, retrying in ${delayMs / 1000}s (attempt ${attempt}/${MAX_ATTEMPTS - 1})...`
      );
      sleepSync(delayMs);
      continue;
    }
    console.error(
      `[provision-new-customer-migrate] FATAL: failed to baseline migration ${migration} (exit code ${resolveResult.status}). The database schema itself is correct (db push succeeded), but future rollouts via rollout-migration.js will not work correctly for this customer until baselining is fixed — investigate before treating this customer as fully provisioned. This script is safe to re-run: already-baselined migrations will be skipped automatically.`
    );
    process.exit(resolveResult.status ?? 1);
  }
}
console.log(`[provision-new-customer-migrate] Baselined ${baselinedCount} migrations as applied (${skippedCount} were already done from a prior run).`);

console.log('[provision-new-customer-migrate] Running ensure-all-columns.js as a defensive extra check (should be a no-op after db push)...');
run('node', ['scripts/ensure-all-columns.js']);

console.log('[provision-new-customer-migrate] Done — database schema fully applied and migration history baselined.');
process.exit(0);
