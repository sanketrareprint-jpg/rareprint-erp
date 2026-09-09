require('dotenv/config');
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const col = await client.query(`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_name = 'User' AND column_name = 'usesAgencyRatesForCommission'
  `);
  console.log('User.usesAgencyRatesForCommission column:', col.rows);

  const tables = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_name IN ('AgencyRateProduct', 'AgencyRateQuantityColumn', 'AgencyRate')
  `);
  console.log('Agency rate tables present:', tables.rows.map(r => r.table_name));

  if (col.rows.length > 0) {
    const agents = await client.query(`
      SELECT id, "fullName", "salesAgentCategory", "usesAgencyRatesForCommission"
      FROM "User"
      WHERE "salesAgentCategory" IS NOT NULL
      LIMIT 15
    `);
    console.log('Sales agents:', JSON.stringify(agents.rows, null, 2));
  }

  await client.end();
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
