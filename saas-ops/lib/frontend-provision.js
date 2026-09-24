// Gives a customer their own frontend deployment (roadmap v3, Section 6:
// each customer gets a separate frontend configured by environment
// variables, not one shared app doing tenant-switching).
//
// Until 2026-09-23 provision-customer.js created an environment, a database
// and a backend — and nothing else. A provisioned customer therefore had an
// API and no user interface at all.
//
// The frontend goes on VERCEL while the backend and database stay on
// Railway. That split isn't arbitrary: Next.js inlines NEXT_PUBLIC_* into
// the browser bundle at build time, and Railway does not expose service
// variables to the build step, so a Railway-hosted customer frontend always
// fell back to RarePrint's own production API. lib/vercel-api.js's header
// records exactly what was tried. RarePrint's own frontend already runs on
// Vercel, so this also matches how the product is actually deployed today.
//
// Railway still owns one frontend-related job: the customer's backend needs
// the new frontend's origin in FRONTEND_ORIGIN or the browser is CORS-
// blocked with a generic "could not reach the server" message
// (backend/src/main.ts). Note that main.ts's automatic *.vercel.app pattern
// only matches RarePrint's OWN project (rareprint-erp-*), so a customer's
// origin genuinely has to be added.

import { updateCustomer } from './registry.js';
import {
  createServiceDomain,
  getServiceDomains,
  getServiceVariables,
  redeployAndConfirm,
  setServiceVariable,
} from './railway-api.js';
import { createDeployment, createProject, getProject, waitForDeployment } from './vercel-api.js';

// backend/src/main.ts reads FRONTEND_ORIGIN as a comma-separated list of
// exact origins.
const CORS_ORIGIN_VARIABLE = 'FRONTEND_ORIGIN';

// Vercel projects live in one flat namespace per account, so a customer slug
// alone risks colliding with something unrelated.
export const vercelProjectName = (slug) => `${slug}-erp`;

/**
 * Adds `origin` to the backend's CORS allowlist without dropping anything
 * already there — a customer may legitimately have a custom domain listed
 * alongside their generated one. Returns the value written, or null when the
 * origin was already present (so the caller can skip a pointless redeploy).
 */
async function allowOriginOnBackend(environmentId, backendServiceId, origin) {
  const variables = await getServiceVariables(environmentId, backendServiceId);
  const existing = (variables[CORS_ORIGIN_VARIABLE] ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (existing.includes(origin)) return null;
  const merged = [...existing, origin].join(',');
  await setServiceVariable(environmentId, backendServiceId, CORS_ORIGIN_VARIABLE, merged);
  return merged;
}

/**
 * Creates the customer's Vercel project pointed at their Railway backend,
 * deploys it, and opens the backend's CORS allowlist to it.
 *
 * Returns { frontendProvider, vercelProjectId, vercelProjectName,
 * frontendUrl, backendUrl }. Does NOT write to the registry — the caller
 * does, because provision-customer.js is creating an entry that doesn't
 * exist yet while provision-frontend.js updates one that does.
 */
export async function provisionFrontend({ slug, environmentId, backendServiceId }) {
  // The backend needs a public domain before the frontend can be built
  // against it. Railway generates none on its own, which is why customers
  // provisioned before this existed had theirs clicked into being by hand.
  let [backendDomain] = await getServiceDomains(environmentId, backendServiceId);
  if (backendDomain) {
    console.log(`  backend already has a public domain: ${backendDomain}`);
  } else {
    backendDomain = await createServiceDomain(environmentId, backendServiceId);
    console.log(`  generated backend domain: ${backendDomain}`);
  }
  const backendUrl = `https://${backendDomain}`;

  const projectName = vercelProjectName(slug);
  if (await getProject(projectName)) {
    throw new Error(`A Vercel project named "${projectName}" already exists. Delete it, or clear this customer's frontend fields in registry.json, before provisioning again.`);
  }

  // NEXT_PUBLIC_API_URL is set as part of project creation, before any build
  // can run, because it is inlined at build time — see this file's header.
  const project = await createProject({
    name: projectName,
    rootDirectory: process.env.FRONTEND_ROOT_DIRECTORY ?? 'frontend',
    apiUrl: backendUrl,
  });
  console.log(`  created Vercel project ${projectName} (${project.id}) with NEXT_PUBLIC_API_URL=${backendUrl}`);

  const deployment = await createDeployment({ projectName });
  console.log(`  deployment ${deployment.id} started — a Next.js build takes several minutes...`);
  const finished = await waitForDeployment(deployment.id);
  // `url` is the immutable per-deployment hostname; the project's stable
  // production hostname is what the customer should actually use.
  const frontendUrl = `https://${projectName}.vercel.app`;
  console.log(`  build READY (deployment hostname ${finished.url})`);

  const mergedOrigins = await allowOriginOnBackend(environmentId, backendServiceId, frontendUrl);
  if (mergedOrigins === null) {
    console.log(`  backend already allowed ${frontendUrl} — CORS unchanged, no backend redeploy`);
  } else {
    console.log(`  set ${CORS_ORIGIN_VARIABLE}=${mergedOrigins} on the backend`);
    // A variable change only reaches the running container on a redeploy.
    // redeployAndConfirm rather than a plain deploy because on a brand-new
    // customer the backend may still be building from its own creation, and
    // a deploy requested mid-build is silently deduplicated — which would
    // leave the backend without the CORS origin it was just given.
    console.log('  redeploying backend so the new CORS origin takes effect...');
    await redeployAndConfirm(environmentId, backendServiceId);
  }

  return {
    frontendProvider: 'vercel',
    vercelProjectId: project.id,
    vercelProjectName: projectName,
    frontendUrl,
    backendUrl,
  };
}

/** Records a finished frontend provision against an existing registry entry. */
export function recordFrontendInRegistry(slug, result) {
  return updateCustomer(slug, { ...result, frontendProvisionedAt: new Date().toISOString() });
}
