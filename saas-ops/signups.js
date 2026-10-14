// Trial signup requests from the marketing site's "Start free" form
// (marketing-site/app/api/signup/route.ts saves them; this reviews them).
// Roadmap v3 build-order step 5, in its "save, then RarePrint approves" form:
// the public site never provisions anything itself.
//
// Usage:
//   node signups.js init                      create the table (safe to re-run)
//   node signups.js list [--all]              pending requests (--all: every status)
//   node signups.js approve <id>              provision the customer + create their admin login
//   node signups.js reject <id> [--reason "..."]
//
// Needs SIGNUPS_DATABASE_URL in .env — the same database the marketing site
// writes to. `approve` also needs everything provision-customer.js needs.

import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import pg from 'pg';
import { customerSlug, loadRegistry } from './lib/registry.js';
import { recordAuditEvent } from './lib/audit.js';

// How long `approve` waits for the new backend to finish its first deploy
// and answer, after provision-customer.js returns.
const BACKEND_READY_TIMEOUT_MS = 15 * 60 * 1000;
const BACKEND_POLL_INTERVAL_MS = 15 * 1000;

const STATUSES = ['pending', 'provisioning', 'approved', 'rejected', 'failed'];

function connect() {
  const url = process.env.SIGNUPS_DATABASE_URL;
  if (!url) throw new Error('SIGNUPS_DATABASE_URL is not set in saas-ops/.env.');
  // A pool, not a single client: `approve` sits idle for many minutes while
  // provisioning runs, and a pool transparently reconnects if Railway's proxy
  // drops the idle connection in the meantime.
  const pool = new pg.Pool({ connectionString: url, max: 1, idleTimeoutMillis: 10_000 });
  pool.on('error', () => {}); // an idle connection dropping is expected, not fatal
  return pool;
}

async function init(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS saas_signup_requests (
      id            SERIAL PRIMARY KEY,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      full_name     TEXT NOT NULL,
      email         TEXT NOT NULL,
      phone         TEXT NOT NULL,
      company_name  TEXT NOT NULL,
      plan          TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN (${STATUSES.map((s) => `'${s}'`).join(', ')})),
      customer_slug TEXT,
      note          TEXT,
      decided_at    TIMESTAMPTZ
    )`);
  // One open request per email — the marketing site's INSERT ... ON CONFLICT
  // DO NOTHING relies on this to ignore repeat submissions.
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS saas_signup_requests_open_email
      ON saas_signup_requests (lower(email))
      WHERE status IN ('pending', 'provisioning')`);
  console.log('saas_signup_requests table and index are in place.');
}

async function list(db, showAll) {
  const { rows } = await db.query(
    `SELECT id, created_at, full_name, email, phone, company_name, plan, status, customer_slug, note
       FROM saas_signup_requests
      ${showAll ? '' : "WHERE status = 'pending'"}
      ORDER BY created_at`,
  );
  if (rows.length === 0) {
    console.log(showAll ? 'No signup requests yet.' : 'No pending signup requests.');
    return;
  }
  for (const r of rows) {
    console.log(
      `#${r.id}  [${r.status}]  ${r.company_name}  (${r.plan})  — ${r.full_name}, ${r.email}, ${r.phone}  — ${r.created_at.toISOString().slice(0, 16).replace('T', ' ')}` +
        (r.customer_slug ? `  → ${r.customer_slug}` : '') +
        (r.note ? `\n      note: ${r.note}` : ''),
    );
  }
}

async function setOutcome(db, id, status, fields = {}) {
  await db.query(
    `UPDATE saas_signup_requests
        SET status = $2, customer_slug = COALESCE($3, customer_slug), note = $4, decided_at = now()
      WHERE id = $1`,
    [id, status, fields.customerSlug ?? null, fields.note ?? null],
  );
}

async function waitForBackend(backendUrl) {
  const deadline = Date.now() + BACKEND_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${backendUrl}/auth/registration-status`);
      if (res.ok) return await res.json();
    } catch {
      // Not up yet — keep waiting.
    }
    console.log('  backend not answering yet, checking again in 15s...');
    await new Promise((r) => setTimeout(r, BACKEND_POLL_INTERVAL_MS));
  }
  throw new Error(`backend at ${backendUrl} did not answer within ${BACKEND_READY_TIMEOUT_MS / 60000} minutes`);
}

async function approve(db, id) {
  // Claim the request atomically so two approve runs can never provision the
  // same customer twice.
  const { rows } = await db.query(
    `UPDATE saas_signup_requests SET status = 'provisioning'
      WHERE id = $1 AND status = 'pending' RETURNING *`,
    [id],
  );
  const request = rows[0];
  if (!request) {
    throw new Error(`Request #${id} does not exist or is not pending (see: node signups.js list --all).`);
  }

  const slug = customerSlug(request.company_name);
  if (!slug || loadRegistry().customers.some((c) => c.slug === slug)) {
    await db.query(`UPDATE saas_signup_requests SET status = 'pending' WHERE id = $1`, [id]);
    throw new Error(
      `A customer with slug "${slug}" already exists in registry.json (or the name has no letters/digits). Request #${id} is back to pending — nothing was created.`,
    );
  }

  console.log(`Approving #${id}: "${request.company_name}" (${request.email}), plan ${request.plan}\n`);
  // No shell: with one, Windows would split "Sharma Printers" into two args.
  const result = spawnSync(process.execPath, ['provision-customer.js', request.company_name], {
    cwd: import.meta.dirname,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    const note = 'provision-customer.js failed — check Railway/Vercel for a half-built environment before retrying by hand';
    await setOutcome(db, id, 'failed', { note });
    recordAuditEvent('approve-signup-failed', slug, { signupId: id });
    throw new Error(note);
  }

  const customer = loadRegistry().customers.find((c) => c.slug === slug);
  if (!customer?.backendUrl) {
    const note = `provisioned, but registry.json has no backendUrl for "${slug}" — admin login NOT created`;
    await setOutcome(db, id, 'failed', { customerSlug: slug, note });
    throw new Error(note);
  }

  console.log(`\nWaiting for ${customer.backendUrl} to finish deploying...`);
  let status;
  try {
    status = await waitForBackend(customer.backendUrl);
  } catch (e) {
    await setOutcome(db, id, 'failed', { customerSlug: slug, note: `${e.message} — admin login NOT created` });
    throw e;
  }
  if (!status.open) {
    // Someone already created the first account. Never add a second
    // "first admin" on top of that — a human needs to look at this.
    const note = 'new instance already has a user — admin login NOT created, investigate before sending anything';
    await setOutcome(db, id, 'failed', { customerSlug: slug, note });
    recordAuditEvent('approve-signup-failed', slug, { signupId: id, reason: 'instance already had users' });
    throw new Error(note);
  }

  // Bootstrap registration: on an instance with no users the backend makes
  // this first account ADMIN (AuthService.register).
  const password = randomBytes(12).toString('base64url');
  const res = await fetch(`${customer.backendUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fullName: request.full_name, email: request.email, password }),
  });
  if (!res.ok) {
    const note = `admin login creation failed (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`;
    await setOutcome(db, id, 'failed', { customerSlug: slug, note });
    throw new Error(note);
  }

  await setOutcome(db, id, 'approved', { customerSlug: slug });
  // Never log the password — only the fact that the login was created.
  const auditPath = recordAuditEvent('approve-signup', slug, { signupId: id, adminEmail: request.email, plan: request.plan });

  console.log(`\nDone. #${id} approved, "${request.company_name}" is live.`);
  console.log('Send these to the customer (the password is shown only here, nowhere is it saved):');
  console.log(`  Login page: ${customer.frontendUrl}/login`);
  console.log(`  Email     : ${request.email}`);
  console.log(`  Password  : ${password}`);
  console.log(`Audit entry written to ${path.basename(auditPath)}.`);
}

async function reject(db, id, reason) {
  const { rowCount } = await db.query(
    `UPDATE saas_signup_requests SET status = 'rejected', note = $2, decided_at = now()
      WHERE id = $1 AND status = 'pending'`,
    [id, reason || null],
  );
  if (rowCount === 0) throw new Error(`Request #${id} does not exist or is not pending.`);
  console.log(`#${id} rejected.`);
}

const [command, arg] = process.argv.slice(2);
let db;
try {
  db = connect();
  if (command === 'init') {
    await init(db);
  } else if (command === 'list') {
    await list(db, process.argv.includes('--all'));
  } else if (command === 'approve' || command === 'reject') {
    const id = Number(arg);
    if (!Number.isInteger(id) || id <= 0) throw new Error(`Usage: node signups.js ${command} <id>`);
    if (command === 'approve') {
      await approve(db, id);
    } else {
      const reasonIndex = process.argv.indexOf('--reason');
      await reject(db, id, reasonIndex === -1 ? '' : process.argv[reasonIndex + 1]);
    }
  } else {
    throw new Error('Usage: node signups.js init | list [--all] | approve <id> | reject <id> [--reason "..."]');
  }
} catch (e) {
  console.error(`[signups] ${e.message}`);
  process.exitCode = 1;
} finally {
  await db?.end().catch(() => {});
}
