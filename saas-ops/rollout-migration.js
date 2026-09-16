// Runs backend/scripts/railway-migrate.js against every existing customer's
// database, one at a time, from the registry. This is what you run after a
// schema change ships, to bring every customer's database up to date —
// separate from just pushing code, since Railway's own git-deploy already
// handles redeploying the app itself if every customer's backend service is
// connected to the same branch.
//
// A failure on one customer's database does NOT stop the run — it's logged
// and the script moves on to the next customer, then reports a summary at
// the end. This is the documented risk of the silo model (see
// docs/SaaS_Conversion_Roadmap_v3.md, Section 2): one tenant's migration
// failing must never block or corrupt the others.
//
// Usage:
//   node rollout-migration.js
//
// Run from your own machine, same reasoning as provision-customer.js.

import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { loadRegistry } from './lib/registry.js';

// SAFETY GUARD — added 2026-09-15 after a real incident where a
// customer-provisioning script ended up running against RarePrint's own
// production database by accident (see provision-new-customer-migrate.js's
// header comment for the full story). This script loops over every stored
// customer database URL and runs migrations against each — if production's
// URL ever ends up in registry.json by mistake, this stops it before
// touching anything.
const PRODUCTION_HOST_FRAGMENT = 'monorail.proxy.rlwy.net';

const registry = loadRegistry();

if (registry.customers.length === 0) {
  console.log('No customers in registry.json yet — nothing to do.');
  process.exit(0);
}

const productionEntries = registry.customers.filter((c) => (c.databaseUrl || '').includes(PRODUCTION_HOST_FRAGMENT));
if (productionEntries.length > 0) {
  console.error(
    `[rollout-migration] REFUSING TO RUN: registry.json contains ${productionEntries.length} entr${productionEntries.length === 1 ? 'y' : 'ies'} whose databaseUrl looks like RarePrint's own production database (host contains "${PRODUCTION_HOST_FRAGMENT}"): ${productionEntries.map((c) => c.name).join(', ')}. Fix registry.json before running this against anyone — do not remove this check.`
  );
  process.exit(1);
}

const backendDir = path.join(import.meta.dirname, '..', 'backend');
const results = [];

console.log(`Running migration against ${registry.customers.length} customer database(s)...\n`);

for (const customer of registry.customers) {
  console.log(`── ${customer.name} (${customer.slug}) ──`);
  const result = spawnSync('node', ['scripts/railway-migrate.js'], {
    cwd: backendDir,
    env: { ...process.env, DATABASE_URL: customer.databaseUrl },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  const ok = result.status === 0;
  results.push({ name: customer.name, ok, exitCode: result.status });
  console.log(ok ? `  ✔ succeeded\n` : `  ✘ FAILED (exit code ${result.status}) — continuing to next customer\n`);
}

console.log('── Summary ──');
for (const r of results) {
  console.log(`${r.ok ? '✔' : '✘'} ${r.name}${r.ok ? '' : ` (exit ${r.exitCode})`}`);
}

const failures = results.filter((r) => !r.ok);
if (failures.length > 0) {
  console.log(`\n${failures.length} customer(s) failed — fix and re-run for just those, don't re-run against everyone (the successful ones don't need it again).`);
  process.exit(1);
}
console.log('\nAll customers migrated successfully.');
