// Thin wrapper around Vercel's REST API, used to give each SaaS customer
// their own frontend deployment.
//
// Why Vercel and not Railway, where their backend and database live: the
// frontend's API URL has to be inlined into the browser bundle by
// `next build` (NEXT_PUBLIC_* is a build-time substitution, not a runtime
// lookup), and Railway does not expose a service's variables to the build
// step. Verified the hard way on 2026-09-23: the variable was set on the
// service from the moment it was created, a custom build command carrying
// the value was ignored by Railpack (its build log shows a plain
// `RUN npm run build`), switching the builder to Nixpacks changed nothing,
// and every build still compiled `process.env.NEXT_PUBLIC_API_URL` to a
// runtime lookup that resolves to undefined in the browser — so every
// customer's app fell back to RarePrint's own production API. The same build
// run locally with the variable set inlines it correctly, so this is a
// platform limitation, not an app bug. Vercel injects project environment
// variables at build time, and RarePrint's own frontend already runs there.
//
// Endpoint shapes verified against Vercel's REST API reference 2026-09-24:
//   - POST /v11/projects — name, framework, rootDirectory,
//     gitRepository{type,repo}, environmentVariables[{key,value,target,type}]
//   - POST /v13/deployments — name, project, target, gitSource{type,org,repo,ref}
//   - GET  /v13/deployments/{id} — readyState QUEUED→INITIALIZING→BUILDING→READY|ERROR

import 'dotenv/config';

const VERCEL_API = 'https://api.vercel.com';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name} — check saas-ops/.env (copy from .env.example).`);
  return value;
}

// Personal accounts have no team; a team account must pass teamId on every
// call or the project lands in the wrong place.
function teamQuery(extra = '') {
  const teamId = process.env.VERCEL_TEAM_ID;
  const parts = [teamId ? `teamId=${encodeURIComponent(teamId)}` : '', extra].filter(Boolean);
  return parts.length ? `?${parts.join('&')}` : '';
}

async function vercelRequest(method, path, body) {
  const token = requireEnv('VERCEL_API_TOKEN');
  const res = await fetch(`${VERCEL_API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(`Vercel API ${method} ${path} failed (HTTP ${res.status}): ${json?.error?.message ?? text}`);
  }
  return json;
}

/** Splits GITHUB_REPO ("owner/name") into the org/repo gitSource wants. */
export function splitGithubRepo() {
  const repo = requireEnv('GITHUB_REPO');
  const [org, name] = repo.split('/');
  if (!org || !name) throw new Error(`GITHUB_REPO should look like "owner/repo", got "${repo}".`);
  return { org, repo: name, full: repo };
}

/** Returns the project, or null when it doesn't exist yet. */
export async function getProject(projectName) {
  try {
    return await vercelRequest('GET', `/v9/projects/${encodeURIComponent(projectName)}${teamQuery()}`);
  } catch (e) {
    if (/HTTP 404/.test(e.message)) return null;
    throw e;
  }
}

/**
 * Creates the customer's project with its API URL already set, so the very
 * first build inlines the right value. Environment variables are passed at
 * creation for exactly that reason — see this file's header.
 */
export async function createProject({ name, rootDirectory, apiUrl, framework = 'nextjs' }) {
  const { full } = splitGithubRepo();
  return vercelRequest('POST', `/v11/projects${teamQuery()}`, {
    name,
    framework,
    rootDirectory,
    gitRepository: { type: 'github', repo: full },
    environmentVariables: [
      // Set for every target so a preview build behaves like production
      // rather than silently falling back to RarePrint's own API.
      { key: 'NEXT_PUBLIC_API_URL', value: apiUrl, target: 'production', type: 'plain' },
      { key: 'NEXT_PUBLIC_API_URL', value: apiUrl, target: 'preview', type: 'plain' },
    ],
  });
}

/** Starts a production deployment from the connected repo. */
export async function createDeployment({ projectName, ref = 'main' }) {
  const { org, repo } = splitGithubRepo();
  // forceNew=1 so a deployment is never deduplicated against an earlier one —
  // the Railway equivalent of that dedup silently served a stale build for
  // hours on 2026-09-23.
  return vercelRequest('POST', `/v13/deployments${teamQuery('forceNew=1&skipAutoDetectionConfirmation=1')}`, {
    name: projectName,
    project: projectName,
    target: 'production',
    gitSource: { type: 'github', org, repo, ref },
  });
}

export async function getDeployment(deploymentId) {
  return vercelRequest('GET', `/v13/deployments/${encodeURIComponent(deploymentId)}${teamQuery()}`);
}

const SETTLED_READY_STATES = new Set(['READY', 'ERROR', 'CANCELED']);

/**
 * Waits for a deployment to finish. Throws unless it reaches READY, so a
 * failed build is never reported as a provisioned customer. Tolerates
 * transient network errors — this polls for many minutes and one dropped
 * request must not abort an otherwise healthy run.
 */
export async function waitForDeployment(deploymentId, { timeoutMs = 1_800_000, pollMs = 15_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    let deployment;
    try {
      deployment = await getDeployment(deploymentId);
    } catch (e) {
      console.log(`  (transient error polling deployment: ${e.message} — retrying)`);
    }
    if (deployment && SETTLED_READY_STATES.has(deployment.readyState)) {
      if (deployment.readyState !== 'READY') {
        throw new Error(`Vercel deployment ${deploymentId} ended as ${deployment.readyState}. Check its build log in the Vercel dashboard.`);
      }
      return deployment;
    }
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for Vercel deployment ${deploymentId} (last state: ${deployment?.readyState ?? 'unknown'}).`);
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

/** Deletes a project. Used to clean up one that was created wrong. */
export async function deleteProject(projectName) {
  return vercelRequest('DELETE', `/v9/projects/${encodeURIComponent(projectName)}${teamQuery()}`);
}
