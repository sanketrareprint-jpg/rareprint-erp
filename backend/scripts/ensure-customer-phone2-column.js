// Self-heal for migration 20260722110000_add_customer_phone2.
//
// Same class of bug documented in ensure-commission-override-table.js:
// `prisma migrate deploy` can report success on production while the
// actual column never gets created, if `_prisma_migrations` has drifted
// (a stale/partial row makes the deploy step treat the migration as
// already-applied and skip it). When that happens here, every query that
// selects the full Customer record (e.g. the Orders list) throws a Prisma
// "column Customer.phone2 does not exist" error — a 500 on a page that
// has nothing else to do with phone2.
//
// Runs right after `prisma migrate deploy` on every boot and adds the
// column directly (idempotently) against the same DATABASE_URL the app
// itself uses, if it isn't already there. Safe to run every deploy — a
// no-op once the column exists.
const { Client } = require('pg');

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.log('[ensure-customer-phone2-column] No DATABASE_URL set, skipping.');
    return;
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const { rows } = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'Customer' AND column_name = 'phone2'
    `);
    if (rows.length > 0) {
      console.log('[ensure-customer-phone2-column] Column already exists, skipping.');
      return;
    }

    console.log('[ensure-customer-phone2-column] Column missing — adding it now.');
    await client.query(`ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "phone2" TEXT;`);
    console.log('[ensure-customer-phone2-column] Column added successfully.');
  } finally {
    await client.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    // Never block app startup over this — worst case, phone2 stays missing
    // (as it already is) and the next deploy retries.
    console.error('[ensure-customer-phone2-column] Failed:', err.message);
    process.exit(0);
  });
