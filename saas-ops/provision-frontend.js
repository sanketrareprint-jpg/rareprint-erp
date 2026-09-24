// Gives an EXISTING customer their own frontend deployment. New customers
// get one automatically from provision-customer.js — this is the backfill
// for customers provisioned before that existed (they have a backend and a
// database but no user interface at all).
//
// Creates a Vercel project for the customer pointed at their Railway backend
// (NEXT_PUBLIC_API_URL set before the first build, because Next inlines it),
// generates the backend's public domain if it hasn't got one, deploys, and
// adds the new origin to the backend's CORS allowlist. See
// lib/frontend-provision.js and lib/vercel-api.js for why the frontend lives
// on Vercel while the backend stays on Railway.
//
// Usage:
//   node provision-frontend.js demo-test-co

import 'dotenv/config';
import { findCustomer } from './lib/registry.js';
import { provisionFrontend, recordFrontendInRegistry } from './lib/frontend-provision.js';
import { recordAuditEvent } from './lib/audit.js';

try {
  const args = process.argv.slice(2);
  if (args.length !== 1) throw new Error('Usage: node provision-frontend.js <customer-slug>');
  const customer = findCustomer(args[0]);

  // A second frontend for the same customer would leave two live URLs
  // serving the same app, only one of which the backend's CORS allowlist and
  // the registry know about.
  if (customer.frontendUrl) {
    throw new Error(
      `${customer.name} already has a frontend at ${customer.frontendUrl}. Delete its Vercel project and clear the frontend fields from registry.json first if you really mean to replace it.`
    );
  }

  console.log(`[provision-frontend] ${customer.name} (${customer.slug}) — environment ${customer.environmentId}`);
  const result = await provisionFrontend({
    slug: customer.slug,
    environmentId: customer.environmentId,
    backendServiceId: customer.backendServiceId,
  });

  recordFrontendInRegistry(customer.slug, result);
  const auditPath = recordAuditEvent('provision-frontend', customer.slug, result);

  console.log(`
[provision-frontend] Done — registry.json updated, audited in ${auditPath}.
[provision-frontend] Frontend : ${result.frontendUrl}
[provision-frontend] Backend  : ${result.backendUrl}

The build has already finished successfully (this waits for it). Confirm the
login page actually loads and a login works before treating this customer as
usable — a successful build is not the same as a working app.`);
} catch (e) {
  console.error(`[provision-frontend] ${e.message}`);
  process.exit(1);
}
