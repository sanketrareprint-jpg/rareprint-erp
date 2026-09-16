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
