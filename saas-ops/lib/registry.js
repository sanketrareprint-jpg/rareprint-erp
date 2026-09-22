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
