const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres:cpwyjHacUIgnKYAgZqHSqSGOmMjfqqYc@monorail.proxy.rlwy.net:46355/railway'
});
client.connect()
  .then(() => client.query('ALTER TABLE "JobWork" ADD COLUMN IF NOT EXISTS "poNumber" TEXT UNIQUE'))
  .then(() => { console.log('✅ poNumber column added'); client.end(); })
  .catch(e => { console.error('❌', e.message); client.end(); });
