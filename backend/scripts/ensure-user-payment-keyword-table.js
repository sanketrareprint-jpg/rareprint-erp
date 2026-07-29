// Self-heal for migration 20260728120000_add_user_payment_keywords.
//
// Same class of bug documented in ensure-commission-override-table.js,
// ensure-customer-phone2-column.js, and ensure-shipment-bigship-columns.js:
// `prisma migrate deploy` can report success on production while the actual
// table never gets created, if `_prisma_migrations` has drifted. When that
// happens here, Bank Statement > Employee Map / import throws
// "table public.UserPaymentKeyword does not exist" — confirmed via Railway
// logs on 2026-07-29, breaking both GET /bank-statement/user-keywords and
// POST /bank-statement/import with a 500 (shown to the user as a generic
// "Internal server error" banner).
//
// Runs right after `prisma migrate deploy` on every boot and creates the
// table directly (idempotently) against the same DATABASE_URL the app
// itself uses, if it isn't already there. Safe to run every deploy — a
// no-op once the table exists.
const { Client } = require('pg');

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.log('[ensure-user-payment-keyword-table] No DATABASE_URL set, skipping.');
    return;
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const { rows } = await client.query(`SELECT to_regclass('public."UserPaymentKeyword"') AS reg`);
    if (rows[0]?.reg) {
      console.log('[ensure-user-payment-keyword-table] Table already exists, skipping.');
      return;
    }

    console.log('[ensure-user-payment-keyword-table] Table missing — creating it now.');
    await client.query(`
      CREATE TABLE IF NOT EXISTS "UserPaymentKeyword" (
          "id"        TEXT NOT NULL,
          "keyword"   TEXT NOT NULL,
          "userId"    TEXT NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

          CONSTRAINT "UserPaymentKeyword_pkey" PRIMARY KEY ("id")
      );
    `);
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE "UserPaymentKeyword" ADD CONSTRAINT "UserPaymentKeyword_keyword_key" UNIQUE ("keyword");
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE "UserPaymentKeyword"
        ADD CONSTRAINT "UserPaymentKeyword_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log('[ensure-user-payment-keyword-table] Table created successfully.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  // Never block app startup over this — worst case, the table stays missing
  // (as it already is) and the next deploy retries.
  console.error('[ensure-user-payment-keyword-table] Failed:', err.message);
});
