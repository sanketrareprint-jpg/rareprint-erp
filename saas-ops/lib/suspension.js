// Shared flow for suspend-customer.js / activate-customer.js (roadmap v3,
// Section 5 — "create/suspend/activate a customer's environment").
//
// Suspension is a variable on the customer's backend service, not a stopped
// container: CUSTOMER_SUSPENDED=true makes backend/src/common/
// suspended-customer.middleware.ts refuse every request except /health with
// a clear "account suspended" message. Because it's a deployment variable it
// survives every future push to main (a stopped deployment would silently
// come back on the next auto-deploy). The customer's database and
// environment are left completely untouched either way.
//
// Railway does not apply a variable change to the running container by
// itself when set through the API, so both directions end with a redeploy —
// the change is live only once that deploy finishes (a few minutes; watch
// the service's Deployments tab, then confirm with customer-status.js).

import { loadRegistry, updateCustomer } from './registry.js';
import { deployService, deleteServiceVariable, getServiceVariables, setServiceVariable } from './railway-api.js';

export const SUSPENSION_VARIABLE = 'CUSTOMER_SUSPENDED';

// Same guard as rollout-migration.js / customer-status.js.
const PRODUCTION_HOST_FRAGMENT = 'monorail.proxy.rlwy.net';

// Positional slug: `node suspend-customer.js demo-test-co [--reason "..."]`.
export function parseArgs(argv, scriptName) {
  const args = argv.slice(2);
  const reasonIndex = args.indexOf('--reason');
  const reason = reasonIndex === -1 ? undefined : (args[reasonIndex + 1] || '').trim();
  if (reasonIndex !== -1 && !reason) throw new Error('--reason requires a value.');
  const positional = args.filter((a, i) => reasonIndex === -1 || (i !== reasonIndex && i !== reasonIndex + 1));
  if (positional.length !== 1) {
    throw new Error(`Usage: node ${scriptName} <customer-slug> [--reason "why"]`);
  }
  return { slug: positional[0], reason };
}

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

/**
 * Sets or clears the suspension variable on the customer's backend service,
 * redeploys so it takes effect, and records the change in the registry.
 * Idempotent: re-running in the same direction just re-asserts the variable
 * and redeploys.
 */
export async function setCustomerSuspended(customer, suspended, { reason, actor } = {}) {
  const { environmentId, backendServiceId } = customer;
  const label = suspended ? 'suspend' : 'activate';

  console.log(`[${label}-customer] ${customer.name} (${customer.slug}) — backend service ${backendServiceId} in environment ${environmentId}`);

  const current = await getServiceVariables(environmentId, backendServiceId);
  const currentlySuspended = current[SUSPENSION_VARIABLE] === 'true';
  console.log(`[${label}-customer] Railway currently has ${SUSPENSION_VARIABLE}=${current[SUSPENSION_VARIABLE] ?? '(not set)'}; registry says status=${customer.status ?? '(unset, treated as active)'}`);

  if (suspended) {
    await setServiceVariable(environmentId, backendServiceId, SUSPENSION_VARIABLE, 'true');
    console.log(`[${label}-customer] Set ${SUSPENSION_VARIABLE}=true.`);
  } else if (SUSPENSION_VARIABLE in current) {
    await deleteServiceVariable(environmentId, backendServiceId, SUSPENSION_VARIABLE);
    console.log(`[${label}-customer] Removed ${SUSPENSION_VARIABLE}.`);
  } else {
    console.log(`[${label}-customer] ${SUSPENSION_VARIABLE} was not set — nothing to remove.`);
  }

  // Only redeploy when the live value actually changed; a redeploy on an
  // already-correct deployment is just downtime for nothing.
  if (currentlySuspended !== suspended) {
    console.log(`[${label}-customer] Redeploying backend so the change takes effect...`);
    await deployService(environmentId, backendServiceId);
    console.log(`[${label}-customer] Redeploy triggered. It is live once the deploy finishes (a few minutes).`);
  } else {
    console.log(`[${label}-customer] Live value already matched — no redeploy needed.`);
  }

  const now = new Date().toISOString();
  const patch = suspended
    ? { status: 'suspended', suspendedAt: now, suspendedBy: actor, suspendReason: reason }
    : { status: 'active', activatedAt: now, activatedBy: actor, suspendReason: undefined };
  updateCustomer(customer.slug, patch);
  console.log(`[${label}-customer] registry.json updated: status=${patch.status}.`);
  console.log(`[${label}-customer] Verify after the deploy finishes: node customer-status.js --only ${customer.slug}`);
}
