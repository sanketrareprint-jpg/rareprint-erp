// One-off diagnostic: checks whether User.usesAgencyRatesForCommission
// actually exists on the live DB and, if so, prints its current value for
// every sales agent. Read-only, no writes.
//
// Run locally (this sandbox has no network route to the Railway DB, so this
// must be run from a machine that does):
//   cd backend
//   node scripts/check-agency-rates-flag.js
require('dotenv/config');
const { Client } = require('pg');

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.log('No DATABASE_URL set — run this from backend/ with a real .env present.');
    return;
  }
  const client = new Client({ connectionString });
  await client.connect();

  const col = await client.query(`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_name = 'User' AND column_name = 'usesAgencyRatesForCommission'
  `);
  console.log('User.usesAgencyRatesForCommission column exists:', col.rows.length > 0);
  if (col.rows.length > 0) console.log(col.rows[0]);

  const tables = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_name IN ('AgencyRateProduct', 'AgencyRateQuantityColumn', 'AgencyRate')
  `);
  console.log('Agency rate tables present:', tables.rows.map((r) => r.table_name));

  if (col.rows.length > 0) {
    const agents = await client.query(`
      SELECT id, "fullName", "salesAgentCategory", "usesAgencyRatesForCommission"
      FROM "User"
      WHERE "salesAgentCategory" IS NOT NULL
      ORDER BY "fullName"
    `);
    console.log('Sales agents:');
    console.table(agents.rows);
  }

  await client.end();
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
