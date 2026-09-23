// Append-only local record of superadmin actions that reach a customer's
// instance (roadmap v3, Section 5 — "audit logging for every superadmin
// action, especially impersonation").
//
// Deliberately small: one JSON object per line in saas-ops/audit-log.jsonl,
// written with appendFileSync so a crash mid-run can't lose an earlier
// entry. No rotation, no remote sink.
//
// KNOWN LIMITATION, stated plainly because it matters: this log is local to
// whichever machine ran the command. It is evidence for the operator who ran
// it, not a tamper-proof trail, and it is not centralised across operators.
// If superadmin access ever extends beyond one or two trusted people, this
// needs to move to a real append-only store before it can be relied on.
//
// Never record secrets here — no JWT_SECRET, no database password, no minted
// token. Record what was done, to whom, by whom, and when.

import { appendFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const AUDIT_LOG_PATH = path.join(import.meta.dirname, '..', 'audit-log.jsonl');

/**
 * Appends one action to the audit log. `action` is a short verb
 * ('impersonate'), `customerSlug` the target, `details` anything else worth
 * keeping (never a secret). Returns the path written, so callers can tell the
 * operator where the record went.
 */
export function recordAuditEvent(action, customerSlug, details = {}) {
  const entry = {
    at: new Date().toISOString(),
    actor: os.userInfo().username,
    host: os.hostname(),
    action,
    customerSlug,
    ...details,
  };
  appendFileSync(AUDIT_LOG_PATH, `${JSON.stringify(entry)}\n`);
  return AUDIT_LOG_PATH;
}
