const fs = require('fs');
const { Client } = require('pg');

// Minimal .env parser (avoid depending on dotenv package)
const envText = fs.readFileSync('.env', 'utf8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (m) {
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[m[1]] = val;
  }
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const total = await client.query('SELECT count(*) FROM "ImportedContact"');
  console.log('ImportedContact total:', total.rows[0].count);

  const nullCreated = await client.query('SELECT count(*) FROM "ImportedContact" WHERE "createdOnAt" IS NULL');
  console.log('createdOnAt NULL:', nullCreated.rows[0].count);

  const sample = await client.query('SELECT phone, "createdOnAt", "lastActiveAt", source, status FROM "ImportedContact" ORDER BY "createdAt" DESC LIMIT 8');
  console.log('Sample rows:', JSON.stringify(sample.rows, null, 2));

  const minMax = await client.query('SELECT min("createdOnAt") as min_c, max("createdOnAt") as max_c FROM "ImportedContact"');
  console.log('createdOnAt range:', minMax.rows[0]);

  const roiSpend = await client.query('SELECT count(*) FROM "MarketingRoiSpend"');
  console.log('MarketingRoiSpend rows:', roiSpend.rows[0].count);

  const custSample = await client.query('SELECT phone, phone2 FROM "Customer" WHERE phone IS NOT NULL LIMIT 8');
  console.log('Customer phone samples:', JSON.stringify(custSample.rows, null, 2));

  const custCount = await client.query('SELECT count(*) FROM "Customer"');
  console.log('Customer total:', custCount.rows[0].count);

  await client.end();
}
main().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
