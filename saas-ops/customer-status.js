// Fleet status: one row per customer in the registry, read straight from each
// customer's own database. This is the first increment of the superadmin
// console described in docs/SaaS_Conversion_Roadmap_v3.md, Section 5 — the
// silo model has no shared database to query, so cross-customer visibility
// means connecting to each customer in turn. Strictly read-only.
//
// Reports, per customer: whether the database is reachable, migrations
// applied vs. the repo (pending = in repo but not applied), stuck migration
// rows, table/user/order counts, last order date as a proxy for "is anyone
// actually using this instance", and whether the backend answers its own
// /health endpoint (which also checks the app's DB connection from inside
// Railway — a different path than our direct connection here).
//
// The backend's public hostname isn't stored in the registry (provisioning
// never recorded it), so it's looked up from Railway each run. That needs
// RAILWAY_API_TOKEN and RAILWAY_CUSTOMERS_PROJECT_ID in saas-ops/.env; without
// them the backend column is skipped rather than failing the whole report.
//
// Exit code is 1 if any customer is unreachable, has pending migrations, has
// a stuck migration row, or has a backend that isn't healthy — so this can
// gate a rollout, not just inform.
//
// Usage:
//   node customer-status.js                    # every customer
//   node customer-status.js --only demo-test-co

import 'dotenv/config';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRegistry, selectCustomers } from './lib/registry.js';
import { getServiceDomains } from './lib/railway-api.js';

// Same guard as rollout-migration.js — if production's URL ever lands in
// registry.json, refuse to touch anything, even read-only.
const PRODUCTION_HOST_FRAGMENT = 'monorail.proxy.rlwy.net';
const CONNECT_TIMEOUT_MS = 10_000;
const HEALTH_TIMEOUT_MS = 15_000;
const canCheckBackend = Boolean(process.env.RAILWAY_API_TOKEN && process.env.RAILWAY_CUSTOMERS_PROJECT_ID);

const registry = loadRegistry();
if (registry.customers.length === 0) {
  console.log('No customers in registry.json yet — nothing to report.');
  process.exit(0);
}
const productionEntries = registry.customers.filter((c) => (c.databaseUrl || '').includes(PRODUCTION_HOST_FRAGMENT));
if (productionEntries.length > 0) {
  console.error(`[customer-status] REFUSING TO RUN: registry.json contains ${productionEntries.length} entry/entries whose databaseUrl looks like RarePrint's own production database: ${productionEntries.map((c) => c.name).join(', ')}. Fix registry.json first.`);
  process.exit(1);
}

let targets;
try {
  targets = selectCustomers(registry, process.argv);
} catch (e) {
  console.error(`[customer-status] ${e.message}`);
  process.exit(1);
}

const migrationsDir = path.join(import.meta.dirname, '..', 'backend', 'prisma', 'migrations');
const repoMigrations = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

async function inspectCustomer(customer) {
  const host = (customer.databaseUrl || '').replace(/.*@/, '').replace(/\/.*/, '');
  const row = { name: customer.name, slug: customer.slug, host, reachable: false };
  const client = new pg.Client({ connectionString: customer.databaseUrl, connectionTimeoutMillis: CONNECT_TIMEOUT_MS });
  try {
    await client.connect();
    row.reachable = true;

    const migrations = await client.query(`
      select migration_name, finished_at, rolled_back_at
      from _prisma_migrations`);
    const applied = new Set(migrations.rows.filter((m) => m.finished_at && !m.rolled_back_at).map((m) => m.migration_name));
    row.applied = applied.size;
    row.pending = repoMigrations.filter((m) => !applied.has(m));
    row.stuck = migrations.rows.filter((m) => !m.finished_at || m.rolled_back_at).length;

    const counts = await client.query(`
      select
        (select count(*) from information_schema.tables where table_schema = 'public')::int as tables,
        (select count(*) from "User")::int as users,
        (select count(*) from "Order")::int as orders,
        (select max("createdAt") from "Order") as last_order`);
    Object.assign(row, {
      tables: counts.rows[0].tables,
      users: counts.rows[0].users,
      orders: counts.rows[0].orders,
      lastOrder: counts.rows[0].last_order,
    });
  } catch (e) {
    row.error = e.message;
  } finally {
    try { await client.end(); } catch {}
  }
  return row;
}

// Resolves the backend's public hostname via Railway, then asks the app
// itself whether it's healthy. Returns { label, healthy } — healthy is null
// when the check couldn't be performed (no token, no domain), so callers can
// tell "not checked" apart from "down".
async function checkBackend(customer) {
  if (!canCheckBackend) return { label: 'skipped (no Railway token)', healthy: null };
  let domain;
  try {
    [domain] = await getServiceDomains(customer.environmentId, customer.backendServiceId);
  } catch (e) {
    return { label: `DOMAIN LOOKUP FAILED`, healthy: false, error: e.message };
  }
  if (!domain) return { label: 'no public domain', healthy: null };
  try {
    const res = await fetch(`https://${domain}/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    if (!res.ok) return { label: `DOWN (HTTP ${res.status})`, healthy: false, domain };
    const body = await res.json();
    if (body.status !== 'ok') return { label: `DOWN (${JSON.stringify(body)})`, healthy: false, domain };
    return { label: `ok (up ${Math.floor(body.uptime / 3600)}h)`, healthy: true, domain };
  } catch (e) {
    return { label: `DOWN (${e.name === 'TimeoutError' ? 'timeout' : e.message})`, healthy: false, domain };
  }
}

const daysAgo = (date) => (date ? `${Math.floor((Date.now() - new Date(date).getTime()) / 86400000)}d ago` : 'never');

console.log(`Repo has ${repoMigrations.length} migrations. Checking ${targets.length} customer(s)...${canCheckBackend ? '' : ' (backend check skipped: set RAILWAY_API_TOKEN + RAILWAY_CUSTOMERS_PROJECT_ID in saas-ops/.env)'}\n`);
const rows = [];
for (const customer of targets) {
  const [db, backend] = await Promise.all([inspectCustomer(customer), checkBackend(customer)]);
  rows.push({ ...db, backend });
}

const columns = ['customer', 'db', 'migrations', 'stuck', 'tables', 'users', 'orders', 'last order', 'backend'];
const table = rows.map((r) => r.reachable
  ? [r.name, 'ok', `${r.applied}/${repoMigrations.length}${r.pending.length ? ` (${r.pending.length} pending)` : ''}`, String(r.stuck), String(r.tables), String(r.users), String(r.orders), daysAgo(r.lastOrder), r.backend.label]
  : [r.name, 'UNREACHABLE', '-', '-', '-', '-', '-', '-', r.backend.label]);
const widths = columns.map((c, i) => Math.max(c.length, ...table.map((t) => t[i].length)));
console.log(columns.map((c, i) => c.padEnd(widths[i])).join('  '));
console.log(widths.map((w) => '-'.repeat(w)).join('  '));
for (const t of table) console.log(t.map((v, i) => v.padEnd(widths[i])).join('  '));

let needsAttention = false;
for (const r of rows) {
  if (!r.reachable) { needsAttention = true; console.log(`\n✘ ${r.name}: unreachable — ${r.error}`); }
  else if (r.pending.length) { needsAttention = true; console.log(`\n! ${r.name}: ${r.pending.length} migration(s) pending: ${r.pending.join(', ')}`); }
  if (r.reachable && r.stuck) { needsAttention = true; console.log(`\n✘ ${r.name}: ${r.stuck} stuck/rolled-back migration row(s) — migrate deploy will refuse to apply anything until resolved`); }
  if (r.backend.healthy === false) { needsAttention = true; console.log(`\n✘ ${r.name}: backend ${r.backend.label}${r.backend.domain ? ` at https://${r.backend.domain}/health` : ''}${r.backend.error ? ` — ${r.backend.error}` : ''}`); }
}
console.log(needsAttention ? '\nSome customers need attention.' : '\nAll customers healthy.');
process.exit(needsAttention ? 1 : 0);
