// The customer registry — a small, local JSON file listing every customer
// that's been provisioned, their Railway environment/service IDs, and their
// database connection string. This is what rollout-migration.js reads to
// know which customers exist.
//
// This file (registry.json) is gitignored — it holds real database
// passwords in plain text. Keep it backed up somewhere safe (it's the one
// piece of state that isn't just re-derivable from Railway itself... though
// in a pinch every value here can also be looked up again from the Railway
// dashboard for that environment, so losing this file is recoverable, just
// annoying, not catastrophic).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const REGISTRY_PATH = path.join(import.meta.dirname, '..', 'registry.json');

export function loadRegistry() {
  if (!existsSync(REGISTRY_PATH)) return { customers: [] };
  return JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
}

export function saveRegistry(registry) {
  writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
}

export function addCustomer(entry) {
  const registry = loadRegistry();
  registry.customers.push({ ...entry, provisionedAt: new Date().toISOString() });
  saveRegistry(registry);
}

// Merges `patch` into the one customer with this slug and saves. Throws on an
// unknown slug so a typo never silently writes nothing.
export function updateCustomer(slug, patch) {
  const registry = loadRegistry();
  const customer = registry.customers.find((c) => c.slug === slug);
  if (!customer) throw new Error(`Unknown customer slug: ${slug}. Known: ${registry.customers.map((c) => c.slug).join(', ')}`);
  Object.assign(customer, patch);
  saveRegistry(registry);
  return customer;
}

// RarePrint's own production database lives on this Railway proxy host. No
// ops tool here may ever act on it — they exist to manage *customer*
// instances. Same guard rollout-migration.js / customer-status.js apply.
const PRODUCTION_HOST_FRAGMENT = 'monorail.proxy.rlwy.net';

// Looks up the one customer with this slug, refusing anything that points at
// RarePrint's own production database or that is missing the Railway ids the
// ops tools need to reach the customer's backend service. Shared by
// suspend-/activate-/impersonate-customer.js.
export function findCustomer(slug) {
  const registry = loadRegistry();
  const customer = registry.customers.find((c) => c.slug === slug);
  if (!customer) {
    throw new Error(`Unknown customer slug: ${slug}. Known: ${registry.customers.map((c) => c.slug).join(', ') || '(none)'}`);
  }
  if ((customer.databaseUrl || '').includes(PRODUCTION_HOST_FRAGMENT)) {
    throw new Error(`REFUSING: ${customer.name}'s databaseUrl looks like RarePrint's own production database. Fix registry.json first.`);
  }
  if (!customer.environmentId || !customer.backendServiceId) {
    throw new Error(`${customer.name} has no environmentId/backendServiceId in registry.json — cannot reach its backend service.`);
  }
  return customer;
}

// Resolves `--only slug1,slug2` from argv to the matching registry entries.
// Every customer when the flag is absent; throws on a missing or unknown slug
// so a typo can never silently run against nobody (or everybody).
export function selectCustomers(registry, argv) {
  const flagIndex = argv.indexOf('--only');
  if (flagIndex === -1) return registry.customers;
  const wantedSlugs = (argv[flagIndex + 1] || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (wantedSlugs.length === 0) throw new Error('--only requires a customer slug (comma-separate for several).');
  const knownSlugs = new Set(registry.customers.map((c) => c.slug));
  const unknown = wantedSlugs.filter((s) => !knownSlugs.has(s));
  if (unknown.length > 0) throw new Error(`Unknown customer slug(s): ${unknown.join(', ')}. Known: ${[...knownSlugs].join(', ')}`);
  return registry.customers.filter((c) => wantedSlugs.includes(c.slug));
}
