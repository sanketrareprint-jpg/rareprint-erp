import { Pool } from "pg";

// Connection to the small, separate database that holds trial signup
// requests until they are approved with `node saas-ops/signups.js approve`.
// It is deliberately NOT the ERP's own database: this site is public, so it
// only ever gets credentials for the one table it writes to. The table is
// created by `node saas-ops/signups.js init` (see saas-ops/README.md).
//
// Returns null when SIGNUPS_DATABASE_URL is unset, so a deployment without it
// keeps working — the form falls back to the old email link.

let pool: Pool | null = null;

export function getSignupsPool(): Pool | null {
  const url = process.env.SIGNUPS_DATABASE_URL;
  if (!url) return null;
  if (!pool) {
    pool = new Pool({ connectionString: url, max: 3 });
  }
  return pool;
}
