// Provisions one new customer: a fresh Railway Environment inside the
// dedicated customer-instances project, their own Postgres database, their
// own backend deployment, and runs the initial migration once against
// their new, empty database. Does NOT touch RarePrint's own production
// project or database — this only ever creates NEW things.
//
// Usage:
//   node provision-customer.js "Customer Name"
//
// Run this from YOUR OWN machine (PowerShell), not from a Claude sandbox —
// the migration step below shells out to Prisma, which needs real network
// access to fetch its engine binaries; that's been unreliable from Claude's
// sandbox in this project before, but works fine from your own machine,
// same as backend/scripts/railway-migrate.js already does today for
// RarePrint's own database.
//
// TEST THIS AGAINST A DISPOSABLE ENVIRONMENT FIRST. Do not point this at a
// real customer until you've run it once, watched every step succeed, and
// manually logged into the resulting environment to confirm it actually
// works — same discipline as everything else in this project since the
// 2026-09 outage.

import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import {
  createEnvironment,
  createPostgresService,
  createBackendService,
  setServiceVariables,
  deployService,
} from './lib/railway-api.js';
import { buildCustomerEnv } from './customer-env-template.js';
import { addCustomer } from './lib/registry.js';

const customerName = process.argv[2];
if (!customerName) {
  console.error('Usage: node provision-customer.js "Customer Name"');
  process.exit(1);
}

// Turns "Sharma Printers" into "sharma-printers" for use as an
// environment/service name slug.
const slug = customerName
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

async function main() {
  console.log(`Provisioning new customer: "${customerName}" (slug: ${slug})`);

  console.log('\n[1/6] Creating Railway environment...');
  const environment = await createEnvironment(slug);
  console.log(`  environment id: ${environment.id}`);

  console.log('\n[2/6] Provisioning Postgres database (volume + credentials + public proxy)...');
  const dbService = await createPostgresService(environment.id, `${slug}-db`);
  const databaseUrl = dbService.databaseUrl;
  console.log(`  database created, credentials set, volume attached, TCP proxy exposed`);

  console.log('\n[3/6] Creating backend service...');
  const backendService = await createBackendService(environment.id, `${slug}-backend`);
  console.log(`  backend service id: ${backendService.id}`);

  console.log('\n[4/6] Setting environment variables...');
  const envVars = buildCustomerEnv(databaseUrl);
  await setServiceVariables(environment.id, backendService.id, envVars);
  console.log(
    `  set ${Object.keys(envVars).length} variables — remember: integration keys (Shiprocket/BigShip/Razorpay/Gmail) are intentionally blank, see customer-env-template.js`
  );

  console.log('\n[5/6] Deploying backend code...');
  await deployService(environment.id, backendService.id);
  console.log('  deploy triggered — this takes a few minutes, check the Railway dashboard for build status before continuing');

  console.log('\n[6/6] Running initial migration against the new database...');
  console.log('  waiting 20s for the database\'s redeploy (triggered by the TCP proxy setup) to finish restarting...');
  await new Promise((r) => setTimeout(r, 20_000));
  const backendDir = path.join(import.meta.dirname, '..', 'backend');
  // Deliberately NOT scripts/railway-migrate.js — that script pre-marks a
  // hardcoded list of migrations as "already applied" without running them,
  // which is only correct for RarePrint's own production database (see that
  // file's comments). Running it against a brand-new, empty database skips
  // real schema-creating SQL and silently leaves tables missing — confirmed
  // by a real test run on 2026-09-15. provision-new-customer-migrate.js is a
  // separate script that does a plain, complete `prisma migrate deploy`
  // instead, correct for a fresh database with no history to reconcile.
  const result = spawnSync('node', ['scripts/provision-new-customer-migrate.js'], {
    cwd: backendDir,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    throw new Error(
      `Migration failed (exit code ${result.status}). The environment and database were still created — check the error above, fix it, then re-run just the migration: DATABASE_URL="${databaseUrl}" node backend/scripts/provision-new-customer-migrate.js`
    );
  }

  addCustomer({
    name: customerName,
    slug,
    environmentId: environment.id,
    backendServiceId: backendService.id,
    dbServiceId: dbService.id,
    databaseUrl,
  });

  console.log(`\nDone. "${customerName}" is provisioned and recorded in registry.json.`);
  console.log('Next: log into the Railway dashboard and confirm the backend deploy actually succeeded and the app boots before treating this as a working customer instance.');
}

main().catch((err) => {
  console.error('\nProvisioning failed:', err.message);
  console.error('Nothing here auto-cleans-up on failure — check the Railway dashboard for whatever was partially created (the environment may exist even if a later step failed) before retrying, so you don\'t end up with duplicate half-built environments for the same customer.');
  process.exit(1);
});
