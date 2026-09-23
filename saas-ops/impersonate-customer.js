// Mints a short-lived login token for one customer's instance so RarePrint
// support can see exactly what that customer sees (roadmap v3, Section 5 —
// "impersonate access for support, scoped to one customer's instance").
//
// Why this needs no backend change at all: every customer's backend is
// provisioned with its own random JWT_SECRET (customer-env-template.js), and
// backend/src/auth/jwt.strategy.ts accepts any HS256 token signed with that
// secret, loading the user named by the `sub` claim from that customer's own
// database. Railway already holds the secret, so the token can be signed
// here, offline. Nothing new is exposed on the customer's deployment, which
// is the whole point — a support feature should not add an authentication
// surface to every instance.
//
// Scope: a token is signed with ONE customer's secret, so it is useless
// against any other customer and against RarePrint's own production.
//
// Usage:
//   node impersonate-customer.js demo-test-co
//   node impersonate-customer.js demo-test-co --email owner@printco.in --minutes 10

import 'dotenv/config';
import crypto from 'node:crypto';
import os from 'node:os';
import pg from 'pg';
import { findCustomer } from './lib/registry.js';
import { getServiceDomains, getServiceVariables } from './lib/railway-api.js';
import { recordAuditEvent } from './lib/audit.js';

const DEFAULT_MINUTES = 30;
// A support token is for looking at one thing now, not for keeping. Anything
// longer should be a deliberate, argued-for exception, not a typo away.
const MAX_MINUTES = 240;
const CONNECT_TIMEOUT_MS = 15000;

function parseArgs(argv) {
  const args = argv.slice(2);
  const readFlag = (name) => {
    const i = args.indexOf(name);
    if (i === -1) return undefined;
    const value = (args[i + 1] || '').trim();
    if (!value || value.startsWith('--')) throw new Error(`${name} requires a value.`);
    args.splice(i, 2);
    return value;
  };

  const email = readFlag('--email');
  const minutesRaw = readFlag('--minutes');
  const positional = args.filter((a) => !a.startsWith('--'));
  if (positional.length !== 1) {
    throw new Error('Usage: node impersonate-customer.js <customer-slug> [--email someone@customer.com] [--minutes 30]');
  }

  let minutes = DEFAULT_MINUTES;
  if (minutesRaw !== undefined) {
    minutes = Number(minutesRaw);
    if (!Number.isInteger(minutes) || minutes < 1) throw new Error('--minutes must be a whole number of minutes, at least 1.');
    if (minutes > MAX_MINUTES) throw new Error(`--minutes is capped at ${MAX_MINUTES} (asked for ${minutes}). Mint a fresh token instead of a long-lived one.`);
  }
  return { slug: positional[0], email, minutes };
}

// Signs an HS256 JWT by hand rather than adding a dependency for nine lines.
// Must match what the customer's backend expects: @nestjs/jwt signs HS256 by
// default, auth.config.ts reads process.env.JWT_SECRET.trim(), and
// jwt.strategy.ts verifies with ignoreExpiration:false — so `exp` is real.
function signJwtHs256(payload, secret, expiresInSeconds) {
  const base64url = (input) => Buffer.from(input).toString('base64url');
  const issuedAt = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: issuedAt, exp: issuedAt + expiresInSeconds };
  const signingInput = `${base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${base64url(JSON.stringify(body))}`;
  const signature = crypto.createHmac('sha256', secret).update(signingInput).digest('base64url');
  return { token: `${signingInput}.${signature}`, expiresAt: new Date(body.exp * 1000).toISOString() };
}

// jwt.strategy.ts rejects a user whose isActive is false, so an inactive one
// would mint a token that fails on first use — check here and say why.
async function findImpersonationTarget(customer, email) {
  const client = new pg.Client({ connectionString: customer.databaseUrl, connectionTimeoutMillis: CONNECT_TIMEOUT_MS });
  await client.connect();
  try {
    if (email) {
      const { rows } = await client.query('select id, email, "fullName", role, "isActive" from "User" where lower(email) = lower($1)', [email]);
      if (rows.length === 0) throw new Error(`No user with email ${email} in ${customer.name}'s database.`);
      if (!rows[0].isActive) throw new Error(`${email} exists in ${customer.name}'s database but is deactivated — the backend would reject the token. Pick an active user.`);
      return rows[0];
    }
    const { rows } = await client.query('select id, email, "fullName", role, "isActive" from "User" where role = \'ADMIN\' and "isActive" = true order by "createdAt" asc limit 1');
    if (rows.length === 0) throw new Error(`${customer.name} has no active ADMIN user to impersonate. Name one explicitly with --email.`);
    return rows[0];
  } finally {
    await client.end();
  }
}

try {
  const { slug, email, minutes } = parseArgs(process.argv);
  const customer = findCustomer(slug);
  const actor = os.userInfo().username;

  console.log(`[impersonate] ${customer.name} (${customer.slug}) — resolving backend secret and target user...`);

  const variables = await getServiceVariables(customer.environmentId, customer.backendServiceId);
  // Must match auth.config.ts's .trim() exactly, or every request 401s with
  // nothing to show why.
  const jwtSecret = (variables.JWT_SECRET || '').trim();
  if (!jwtSecret) {
    throw new Error(`${customer.name}'s backend service has no JWT_SECRET variable set in Railway — cannot sign a token for it.`);
  }

  const user = await findImpersonationTarget(customer, email);
  const { token, expiresAt } = signJwtHs256(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      // Ignored by jwt.strategy.ts (it only reads `sub`), carried so anyone
      // who later decodes a stray token can see what it was for and who
      // minted it.
      impersonatedBy: `rareprint-support:${actor}`,
      purpose: 'rareprint-support-impersonation',
    },
    jwtSecret,
    minutes * 60,
  );

  const [domain] = await getServiceDomains(customer.environmentId, customer.backendServiceId).catch(() => []);
  const baseUrl = domain ? `https://${domain}` : '(no public domain found for this backend service)';
  const auditPath = recordAuditEvent('impersonate', customer.slug, {
    impersonatedUserId: user.id,
    impersonatedEmail: user.email,
    impersonatedRole: user.role,
    minutes,
    expiresAt,
  });

  console.log(`
[impersonate] Acting as : ${user.fullName} <${user.email}> (${user.role})
[impersonate] Backend   : ${baseUrl}
[impersonate] Valid for : ${minutes} min — expires ${expiresAt}
[impersonate] Audited in: ${auditPath}

Token:
${token}

Use it against the API directly:
  curl -H "Authorization: Bearer <token>" ${domain ? `https://${domain}` : '<backend-url>'}/orders

Or in a browser, to see their app as they see it: run the frontend pointed at
this customer's backend (NEXT_PUBLIC_API_URL=${domain ? `https://${domain}` : '<backend-url>'}),
then in the browser console on that page:
  localStorage.setItem('rareprint_token', '<token>');
  localStorage.setItem('rareprint_user', '${JSON.stringify({ id: user.id, fullName: user.fullName, email: user.email, role: user.role })}');
  location.reload();

Note there is no per-customer frontend deployment yet (provision-customer.js
creates a backend and a database only), so the browser route means your own
local frontend, not a customer URL.

This token IS a live login as that user for the next ${minutes} minutes.
Anything you do with it is indistinguishable, inside the customer's own app,
from that user doing it. Don't paste it anywhere shared, and prefer read-only
actions.`);
} catch (e) {
  console.error(`[impersonate] ${e.message}`);
  process.exit(1);
}
