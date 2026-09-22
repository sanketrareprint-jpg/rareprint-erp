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
  const projectId = requireEnv('RAILWAY_CUSTOMERS_PROJECT_ID');
  const repo = requireEnv('GITHUB_REPO');
  const rootDirectory = requireEnv('BACKEND_ROOT_DIRECTORY');
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
      source: { repo },
    },
  });
  const service = data.serviceCreate;

  await setServiceRootDirectory(environmentId, service.id, rootDirectory);

  return service;
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
