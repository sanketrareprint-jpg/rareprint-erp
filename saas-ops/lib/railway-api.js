// Thin wrapper around Railway's public GraphQL API.
//
// Verified against Railway's live schema (via the GraphiQL playground at
// railway.com/graphiql) on 2026-09-14:
//   - environmentCreate / EnvironmentCreateInput — confirmed, matches below.
//   - serviceCreate / ServiceCreateInput — confirmed, matches below.
//   - ServiceSourceInput has only `image` and `repo` (no `rootDirectory`) —
//     rootDirectory is NOT part of serviceCreate's input. It's set via a
//     separate serviceInstanceUpdate call after the service exists (see
//     setServiceRootDirectory below, and its use inside createBackendService).
// NOT yet verified against the live schema: variableUpsert, the `variables`
// query, and serviceInstanceDeploy. Check those in Docs the same way before
// running provision-customer.js against a real customer — if a field name is
// off, you'll get a clear GraphQL error naming it, not silent wrong behavior.
//   - `domains` query — verified by introspection on 2026-09-21 (args
//     environmentId!/projectId!/serviceId!, returns AllDomains with
//     serviceDomains[].domain and customDomains[].domain) and by a real call
//     that returned demo-test-co's live backend domain.

import 'dotenv/config';
import crypto from 'node:crypto';

const RAILWAY_API_URL = 'https://backboard.railway.com/graphql/v2';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name} — check saas-ops/.env (copy from .env.example).`);
  }
  return value;
}

async function graphqlRequest(query, variables) {
  const token = requireEnv('RAILWAY_API_TOKEN');
  const res = await fetch(RAILWAY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) {
    throw new Error(`Railway API error: ${JSON.stringify(json.errors, null, 2)}`);
  }
  return json.data;
}

/**
 * Creates a new Environment inside the fixed customer-instances project
 * (RAILWAY_CUSTOMERS_PROJECT_ID from .env — never RarePrint's own project).
 */
export async function createEnvironment(name) {
  const projectId = requireEnv('RAILWAY_CUSTOMERS_PROJECT_ID');
  const query = `
    mutation EnvironmentCreate($input: EnvironmentCreateInput!) {
      environmentCreate(input: $input) {
        id
        name
      }
    }
  `;
  const data = await graphqlRequest(query, { input: { projectId, name } });
  return data.environmentCreate; // { id, name }
}

/**
 * Public hostnames for a service in an environment. Custom domains first
 * (the address a customer would actually use), then Railway-generated ones.
 * Empty if the service has no public domain at all.
 */
export async function getServiceDomains(environmentId, serviceId) {
  const projectId = requireEnv('RAILWAY_CUSTOMERS_PROJECT_ID');
  const query = `
    query Domains($environmentId: String!, $projectId: String!, $serviceId: String!) {
      domains(environmentId: $environmentId, projectId: $projectId, serviceId: $serviceId) {
        customDomains { domain }
        serviceDomains { domain }
      }
    }
  `;
  const data = await graphqlRequest(query, { environmentId, projectId, serviceId });
  return [...data.domains.customDomains, ...data.domains.serviceDomains].map((d) => d.domain);
}

/**
 * Adds a working Postgres database service to the given environment:
 * creates the service from Railway's own postgres-ssl image, attaches a
 * persistent volume, sets standard Postgres credentials, exposes it via a
 * TCP proxy so it's reachable from outside Railway (needed because
 * provision-customer.js runs its migration step from your own machine, not
 * from inside Railway's network), and builds the resulting DATABASE_URL.
 *
 * IMPORTANT: creating a Postgres service this way (a raw serviceCreate from
 * a Docker image) is NOT the same as clicking "Add Database" in the Railway
 * dashboard — that button uses a different mechanism (a template deploy)
 * that auto-generates all of this for you. Doing it via serviceCreate means
 * WE have to set up every piece by hand, which is what this function does.
 * Every field/mutation used here was confirmed against Railway's live
 * schema on 2026-09-14/15 (see the file-level comment above), except this
 * exact combination has not yet been run end-to-end successfully — the
 * first real run of this function should be treated as the real test, not
 * just the schema checks.
 */
export async function createPostgresService(environmentId, name) {
  const projectId = requireEnv('RAILWAY_CUSTOMERS_PROJECT_ID');

  const serviceQuery = `
    mutation ServiceCreate($input: ServiceCreateInput!) {
      serviceCreate(input: $input) {
        id
        name
      }
    }
  `;
  const serviceData = await graphqlRequest(serviceQuery, {
    input: {
      projectId,
      environmentId,
      name,
      source: { image: 'ghcr.io/railwayapp-templates/postgres-ssl:latest' },
    },
  });
  const service = serviceData.serviceCreate;

  // Persistent storage. Without this, all data is lost on every restart or
  // redeploy — confirmed missing on the service created by the pre-fix
  // version of this script (2026-09-14 test run had zero volumes attached).
  // Mount path matches the official Postgres Docker image's documented
  // default (hub.docker.com/_/postgres). PGDATA is set to a *subdirectory*
  // of that mount, not the mount root itself — Postgres's initdb refuses to
  // start if its data directory isn't empty, and Railway's volume mount
  // creates a lost+found entry at the mount root, so the data directory has
  // to be one level down. This is standard official-Postgres-image practice,
  // not Railway-specific.
  const mountPath = '/var/lib/postgresql/data';
  await createVolume(projectId, environmentId, service.id, mountPath);

  // Standard Postgres container credentials (hub.docker.com/_/postgres env
  // vars) — a raw image-based service does not get these auto-generated the
  // way Railway's own "Add Database" button would set them up.
  const postgresUser = 'postgres';
  const postgresPassword = crypto.randomBytes(24).toString('hex');
  const postgresDb = 'railway';
  await setServiceVariables(environmentId, service.id, {
    POSTGRES_USER: postgresUser,
    POSTGRES_PASSWORD: postgresPassword,
    POSTGRES_DB: postgresDb,
    PGDATA: `${mountPath}/pgdata`,
  });

  // Exposes port 5432 outside Railway's private network. Needed because
  // this project's migration scripts run from a local machine, not from
  // inside Railway — without a TCP proxy, the database is only reachable
  // from other services in the same Railway project.
  const proxy = await createTcpProxy(environmentId, service.id, 5432);
  const databaseUrl = `postgresql://${postgresUser}:${postgresPassword}@${proxy.domain}:${proxy.proxyPort}/${postgresDb}`;
  await setServiceVariable(environmentId, service.id, 'DATABASE_URL', databaseUrl);

  // The TCP proxy mutation is deprecated in Railway's schema in favor of
  // their "staged changes" system, but still functions — Railway's own docs
  // say deprecated fields keep working through a sunset window. Its
  // deprecation note says it needs a redeploy to become active, so trigger
  // one now that the proxy and variables are both set.
  await deployService(environmentId, service.id);

  return { ...service, databaseUrl };
}

/**
 * Attaches a persistent volume to a service within one environment.
 */
export async function createVolume(projectId, environmentId, serviceId, mountPath) {
  const query = `
    mutation VolumeCreate($input: VolumeCreateInput!) {
      volumeCreate(input: $input) {
        id
      }
    }
  `;
  const data = await graphqlRequest(query, {
    input: { projectId, environmentId, serviceId, mountPath },
  });
  return data.volumeCreate;
}

/**
 * Exposes a service's internal port on a public Railway-provided domain.
 * Deprecated in Railway's schema (see the deprecation note in the caller),
 * but confirmed still present and functional as of 2026-09-15.
 */
export async function createTcpProxy(environmentId, serviceId, applicationPort) {
  const query = `
    mutation TCPProxyCreate($input: TCPProxyCreateInput!) {
      tcpProxyCreate(input: $input) {
        domain
        proxyPort
      }
    }
  `;
  const data = await graphqlRequest(query, {
    input: { environmentId, serviceId, applicationPort },
  });
  return data.tcpProxyCreate; // { domain, proxyPort }
}

/**
 * Adds the backend app service to the given environment, deployed from the
 * same GitHub repo/branch as RarePrint's own production backend.
 *
 * rootDirectory can't be set as part of serviceCreate (ServiceSourceInput
 * only has `image` and `repo` — confirmed against the live schema
 * 2026-09-14), so this creates the service first, then makes a second call
 * to set the root directory via serviceInstanceUpdate.
 */
export async function createBackendService(environmentId, name) {
  return createRepoService(environmentId, name, requireEnv('BACKEND_ROOT_DIRECTORY'));
}

/**
 * There is deliberately no createFrontendService here: a customer's frontend
 * is a Vercel project, not a Railway service, because Railway does not expose
 * service variables to the build step and Next.js needs NEXT_PUBLIC_* at
 * build time. See lib/vercel-api.js's header for what was tried first.
 */

/**
 * Creates one service in this environment from the shared GitHub repo, at the
 * given root directory, with `variables` already set. Backend and frontend
 * differ only in that directory.
 *
 * The source repo is attached LAST, deliberately. Attaching a repo is what
 * makes Railway start building, and this used to pass `source` straight to
 * serviceCreate — so the build began before the root directory and the
 * variables existed. For the backend that was merely wasteful (it reads its
 * config at runtime, so a later redeploy fixed it). For the frontend it was
 * a real defect: NEXT_PUBLIC_* values are inlined by `next build`, so that
 * first build baked in the wrong API URL, and no amount of redeploying
 * afterwards replaced it — three rebuilds on 2026-09-23, including one with
 * latestCommit:true that genuinely rebuilt from source, all kept serving the
 * original wrong bundle.
 *
 * Configure first, attach the repo last, and the first build is the correct
 * one — which also means the build cache is populated from a correct build
 * rather than a wrong one.
 */
async function createRepoService(environmentId, name, rootDirectory, variables = {}) {
  const projectId = requireEnv('RAILWAY_CUSTOMERS_PROJECT_ID');
  const repo = requireEnv('GITHUB_REPO');
  const query = `
    mutation ServiceCreate($input: ServiceCreateInput!) {
      serviceCreate(input: $input) {
        id
        name
      }
    }
  `;
  const data = await graphqlRequest(query, {
    input: {
      projectId,
      environmentId,
      name,
      ...(Object.keys(variables).length > 0 ? { variables } : {}),
    },
  });
  const service = data.serviceCreate;

  await setServiceRootDirectory(environmentId, service.id, rootDirectory);
  await setServiceSource(environmentId, service.id, repo);

  return service;
}

/**
 * Points a service at a GitHub repo. Doing this after the service exists is
 * what lets createRepoService configure everything before the first build —
 * see its comment.
 */
export async function setServiceSource(environmentId, serviceId, repo) {
  const query = `
    mutation ServiceInstanceUpdate($serviceId: String!, $environmentId: String, $input: ServiceInstanceUpdateInput!) {
      serviceInstanceUpdate(serviceId: $serviceId, environmentId: $environmentId, input: $input)
    }
  `;
  await graphqlRequest(query, { serviceId, environmentId, input: { source: { repo } } });
}

/**
 * Permanently deletes a service from one environment. Used to clean up a
 * service that was created wrong — never call it on a database service.
 */
export async function deleteService(environmentId, serviceId) {
  const query = `
    mutation ServiceDelete($id: String!, $environmentId: String) {
      serviceDelete(id: $id, environmentId: $environmentId)
    }
  `;
  await graphqlRequest(query, { id: serviceId, environmentId });
}

// Statuses a deployment can sit in permanently. Anything else means Railway
// is still working on it. Introspected from DeploymentStatus 2026-09-23.
const SETTLED_DEPLOY_STATUSES = new Set(['SUCCESS', 'FAILED', 'CRASHED', 'REMOVED', 'SKIPPED', 'SLEEPING']);

/**
 * Returns the most recent deployment for a service as { id, status }, or null
 * if it has never deployed.
 */
export async function getLatestDeployment(environmentId, serviceId) {
  const projectId = requireEnv('RAILWAY_CUSTOMERS_PROJECT_ID');
  const query = `
    query Deployments($input: DeploymentListInput!) {
      deployments(first: 1, input: $input) {
        edges { node { id status createdAt } }
      }
    }
  `;
  const data = await graphqlRequest(query, { input: { projectId, environmentId, serviceId } });
  const node = data.deployments.edges[0]?.node;
  return node ? { id: node.id, status: node.status, createdAt: node.createdAt } : null;
}

/**
 * Deploys a service and confirms a genuinely NEW build was started.
 *
 * Why this exists rather than a plain deployService() call: creating a
 * repo-sourced service makes Railway start building it immediately, and a
 * deploy requested while that build is still in flight is silently
 * deduplicated against it — no error, no new deployment. That bit us on
 * 2026-09-23: the frontend's NEXT_PUBLIC_API_URL was set correctly and the
 * deploy call returned cleanly, but the build serving traffic was the
 * auto-deploy from a second earlier, built without the variable, so the
 * customer's app shipped pointing at RarePrint's own production API. The
 * variable was right, the deploy "succeeded", and the result was still wrong.
 *
 * So: wait for whatever is in flight to settle, then deploy, then confirm the
 * latest deployment id actually changed.
 */
export async function redeployAndConfirm(environmentId, serviceId, { settleTimeoutMs = 900_000, pollMs = 15_000 } = {}) {
  const deadline = Date.now() + settleTimeoutMs;
  let before = await getLatestDeployment(environmentId, serviceId);
  while (before && !SETTLED_DEPLOY_STATUSES.has(before.status)) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${serviceId}'s in-flight deployment (${before.status}) to finish before redeploying.`);
    }
    await new Promise((r) => setTimeout(r, pollMs));
    before = await getLatestDeployment(environmentId, serviceId);
  }

  await deployService(environmentId, serviceId);

  // Confirm, rather than assume. A deduplicated deploy returns cleanly too.
  for (let attempt = 0; attempt < 8; attempt++) {
    await new Promise((r) => setTimeout(r, 5_000));
    const after = await getLatestDeployment(environmentId, serviceId);
    if (after && after.id !== before?.id) return after;
  }
  throw new Error(`Deploy of ${serviceId} did not produce a new deployment — Railway may have deduplicated it against deployment ${before?.id}. Check the service's Deployments tab.`);
}

/**
 * Waits for a freshly created service's first build and returns it once it
 * settles. Attaching the source repo normally starts that build by itself, so
 * this does NOT force another one — a second build would be several wasted
 * minutes, and with the service configured up front the first build is
 * already correct. Only if no build has appeared after `appearTimeoutMs` does
 * it trigger one.
 *
 * Throws if the build ends in anything other than SUCCESS, so a caller never
 * reports a customer as provisioned off the back of a failed build.
 */
export async function waitForFirstDeployment(environmentId, serviceId, { appearTimeoutMs = 90_000, settleTimeoutMs = 1_800_000, pollMs = 15_000 } = {}) {
  // This polls for up to half an hour, so a single dropped request must not
  // abort a provisioning run that is otherwise going fine — one `fetch
  // failed` killed a real run on 2026-09-23, leaving a built service that
  // never made it into the registry. Transient errors are swallowed; a
  // persistent one still ends the run via the deadline below.
  const poll = async () => {
    try {
      return await getLatestDeployment(environmentId, serviceId);
    } catch (e) {
      console.log(`  (transient error polling deployment status: ${e.message} — retrying)`);
      return undefined;
    }
  };

  const appearDeadline = Date.now() + appearTimeoutMs;
  let deployment = await poll();
  while (!deployment) {
    if (Date.now() > appearDeadline) {
      await deployService(environmentId, serviceId);
      break;
    }
    await new Promise((r) => setTimeout(r, 5_000));
    deployment = await poll();
  }

  const settleDeadline = Date.now() + settleTimeoutMs;
  while (!deployment || !SETTLED_DEPLOY_STATUSES.has(deployment.status)) {
    if (Date.now() > settleDeadline) {
      throw new Error(`Timed out waiting for ${serviceId}'s first build to finish (last status: ${deployment?.status ?? 'none'}).`);
    }
    await new Promise((r) => setTimeout(r, pollMs));
    deployment = await poll();
  }

  if (deployment.status !== 'SUCCESS') {
    throw new Error(`${serviceId}'s first build ended as ${deployment.status} (deployment ${deployment.id}). Check its build log in Railway.`);
  }
  return deployment;
}

/**
 * Generates a public *.up.railway.app domain for a service and returns it.
 * Railway does NOT create one automatically, which is why every customer
 * provisioned before 2026-09-23 needed its backend domain clicked into
 * existence by hand in the dashboard.
 *
 * Verified by introspection 2026-09-23: serviceDomainCreate(input:
 * ServiceDomainCreateInput!) takes environmentId!/serviceId!/targetPort and
 * returns a ServiceDomain with a `domain` field. targetPort is optional —
 * left unset, Railway infers the port the service listens on, which is what
 * both our services want (each reads Railway's injected PORT).
 */
export async function createServiceDomain(environmentId, serviceId, targetPort) {
  const query = `
    mutation ServiceDomainCreate($input: ServiceDomainCreateInput!) {
      serviceDomainCreate(input: $input) {
        domain
      }
    }
  `;
  const data = await graphqlRequest(query, {
    input: { environmentId, serviceId, ...(targetPort ? { targetPort } : {}) },
  });
  return data.serviceDomainCreate.domain;
}

/**
 * Sets a service's root directory within a specific environment. Confirmed
 * against Railway's live schema 2026-09-14: rootDirectory lives on
 * ServiceInstanceUpdateInput, not on ServiceCreateInput.
 */
export async function setServiceRootDirectory(environmentId, serviceId, rootDirectory) {
  const query = `
    mutation ServiceInstanceUpdate($serviceId: String!, $environmentId: String, $input: ServiceInstanceUpdateInput!) {
      serviceInstanceUpdate(serviceId: $serviceId, environmentId: $environmentId, input: $input)
    }
  `;
  await graphqlRequest(query, {
    serviceId,
    environmentId,
    input: { rootDirectory },
  });
}

/**
 * Sets one environment variable on a service, scoped to one environment.
 */
export async function setServiceVariable(environmentId, serviceId, key, value) {
  const projectId = requireEnv('RAILWAY_CUSTOMERS_PROJECT_ID');
  const query = `
    mutation VariableUpsert($input: VariableUpsertInput!) {
      variableUpsert(input: $input)
    }
  `;
  await graphqlRequest(query, {
    input: { projectId, environmentId, serviceId, name: key, value },
  });
}

/**
 * Removes one environment variable from a service in one environment.
 * Verified by introspection 2026-09-22: variableDelete(input:
 * VariableDeleteInput!) with environmentId!/name!/projectId!/serviceId.
 * Behaviour when the variable isn't set is not documented — callers check
 * with getServiceVariables() first rather than relying on it being a no-op.
 */
export async function deleteServiceVariable(environmentId, serviceId, key) {
  const projectId = requireEnv('RAILWAY_CUSTOMERS_PROJECT_ID');
  const query = `
    mutation VariableDelete($input: VariableDeleteInput!) {
      variableDelete(input: $input)
    }
  `;
  await graphqlRequest(query, {
    input: { projectId, environmentId, serviceId, name: key },
  });
}

export async function setServiceVariables(environmentId, serviceId, variables) {
  for (const [key, value] of Object.entries(variables)) {
    await setServiceVariable(environmentId, serviceId, key, value);
  }
}

/**
 * Reads back a service's variables for this environment — used to fetch
 * the DATABASE_URL Railway auto-generates for a freshly created Postgres
 * service, so it can be handed to the backend service and to the migration
 * step.
 */
export async function getServiceVariables(environmentId, serviceId) {
  const projectId = requireEnv('RAILWAY_CUSTOMERS_PROJECT_ID');
  const query = `
    query Variables($projectId: String!, $environmentId: String!, $serviceId: String!) {
      variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId)
    }
  `;
  const data = await graphqlRequest(query, { projectId, environmentId, serviceId });
  return data.variables; // { KEY: "value", ... }
}

/**
 * Triggers a deploy of the given service in the given environment — used
 * after setting variables, and by rollout-migration.js is NOT what runs the
 * migration itself (that happens over the database connection directly,
 * see rollout-migration.js) — this just makes sure the latest code is live.
 *
 * Retries on Railway's "Service deployment rate limit exceeded" error
 * (confirmed 2026-09-15 during real testing — provisioning a single new
 * customer triggers several deploys in quick succession: Postgres
 * auto-deploys on creation, gets redeployed again to activate its TCP
 * proxy, the backend auto-deploys on creation, then gets redeployed again
 * here after variables are set). Railway doesn't document the exact
 * threshold/window for this limit, so this backs off and retries rather
 * than guessing a fixed wait time.
 */
export async function deployService(environmentId, serviceId, { maxRetries = 4, initialDelayMs = 15_000 } = {}) {
  const query = `
    mutation ServiceInstanceDeploy($serviceId: String!, $environmentId: String!) {
      serviceInstanceDeploy(serviceId: $serviceId, environmentId: $environmentId)
    }
  `;
  let delay = initialDelayMs;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await graphqlRequest(query, { serviceId, environmentId });
      return;
    } catch (err) {
      const isRateLimit = /rate limit/i.test(err.message);
      if (!isRateLimit || attempt === maxRetries) throw err;
      console.log(`  deploy rate-limited by Railway, waiting ${delay / 1000}s before retry ${attempt}/${maxRetries - 1}...`);
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
    }
  }
}
