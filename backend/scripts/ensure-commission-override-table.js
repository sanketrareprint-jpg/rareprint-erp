// Self-heal for migration 20260715000100_add_commission_override.
//
// On production, `prisma migrate deploy` reported success in
// railway-migrate.js's logs (the app boots fine, routes are mapped), but
// the "CommissionOverride" table was never actually created — the pencil-
// edit on Accounts > Commission failed with Prisma P2021 ("table does not
// exist") on every save. Most likely cause: a stale/partial row in
// `_prisma_migrations` for this migration name made `migrate deploy` treat
// it as already-applied and skip it.
//
// Rather than chase the exact cause of the tracking-table drift, this runs
// right after `prisma migrate deploy` on every boot and creates the table
// directly (idempotently) against the SAME DATABASE_URL the app itself
// uses, if it isn't already there. Safe to run every deploy — it's a no-op
// once the table exists.
const { Client } = require('pg');

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.log('[ensure-commission-override-table] No DATABASE_URL set, skipping.');
    return;
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const { rows } = await client.query(
      `SELECT to_regclass('public."CommissionOverride"') AS reg`,
    );
    if (rows[0]?.reg) {
      console.log('[ensure-commission-override-table] Table already exists, skipping.');
      return;
    }

    console.log('[ensure-commission-override-table] Table missing — creating it now.');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "CommissionOverride" (
        "id"          TEXT NOT NULL,
        "orderItemId" TEXT NOT NULL,
        "agentId"     TEXT NOT NULL,
        "amount"      DECIMAL(14,2) NOT NULL,
        "setById"     TEXT NOT NULL,
        "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"   TIMESTAMP(3) NOT NULL,

        CONSTRAINT "CommissionOverride_pkey" PRIMARY KEY ("id")
      );
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "CommissionOverride_orderItemId_key"
      ON "CommissionOverride"("orderItemId");
    `);

    await client.query(`
      DO $$ BEGIN
        ALTER TABLE "CommissionOverride"
        ADD CONSTRAINT "CommissionOverride_orderItemId_fkey"
        FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        ALTER TABLE "CommissionOverride"
        ADD CONSTRAINT "CommissionOverride_agentId_fkey"
        FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        ALTER TABLE "CommissionOverride"
        ADD CONSTRAINT "CommissionOverride_setById_fkey"
        FOREIGN KEY ("setById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    console.log('[ensure-commission-override-table] Table created successfully.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  // Never block app startup over this — worst case, commission overrides
  // stay broken (as they already are) and the next deploy retries.
  console.error('[ensure-commission-override-table] Failed:', err.message);
});
