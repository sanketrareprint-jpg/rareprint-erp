// One-time setup: creates login "signups_app" and an empty, separate database
// "rareprint_signups" on the same Postgres server as backend/.env's DATABASE_URL.
// Never touches the ERP's own database or tables. Refuses to run twice.
// Usage (from backend/): node scripts/create-signups-db.js
require('dotenv/config');
const { randomBytes } = require('node:crypto');
const { Client } = require('pg');

const ROLE = 'signups_app';
const DATABASE = 'rareprint_signups';

async function main() {
  const adminUrl = process.env.DATABASE_URL;
  if (!adminUrl) throw new Error('DATABASE_URL is not set — run this from backend/.');
  const db = new Client({ connectionString: adminUrl });
  await db.connect();
  try {
    const existing = await db.query(
      `SELECT (SELECT count(*) FROM pg_roles WHERE rolname = $1)::int AS roles,
              (SELECT count(*) FROM pg_database WHERE datname = $2)::int AS dbs`,
      [ROLE, DATABASE],
    );
    if (existing.rows[0].roles > 0 || existing.rows[0].dbs > 0) {
      throw new Error(`"${ROLE}" or "${DATABASE}" already exists — nothing changed.`);
    }
    const password = randomBytes(24).toString('hex');
    await db.query(`CREATE ROLE ${ROLE} LOGIN PASSWORD '${password}'`);
    await db.query(`CREATE DATABASE ${DATABASE} OWNER ${ROLE}`);
    const url = new URL(adminUrl);
    url.username = ROLE;
    url.password = password;
    url.pathname = `/${DATABASE}`;
    console.log(`Created role "${ROLE}" and database "${DATABASE}".`);
    console.log('\nSIGNUPS_DATABASE_URL (shown once — copy it now):');
    console.log(url.toString());
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error(`[create-signups-db] ${err.message}`);
  process.exit(1);
});
