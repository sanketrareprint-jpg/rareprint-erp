// Self-heal for migration 20260807120000_add_company_holiday.
//
// Same failure mode documented in ensure-commission-override-table.js:
// `prisma migrate deploy` can report success on boot while a new table
// never actually gets created (stale/partial _prisma_migrations tracking
// row). Confirmed in production logs — GET /attendance/holidays and
// GET /hr/employees/:id/salary were both throwing Prisma P2021 ("table
// public.CompanyHoliday does not exist") right after a deploy that showed
// the app booting cleanly with no migration errors.
//
// Runs right after `prisma migrate deploy` on every boot and creates the
// table (+ enum + constraints) directly against DATABASE_URL if missing.
// Safe to run every deploy — no-op once the table exists.
const { Client } = require('pg');

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.log('[ensure-company-holiday-table] No DATABASE_URL set, skipping.');
    return;
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const { rows } = await client.query(
      `SELECT to_regclass('public."CompanyHoliday"') AS reg`,
    );
    if (rows[0]?.reg) {
      console.log('[ensure-company-holiday-table] Table already exists, skipping.');
      return;
    }

    console.log('[ensure-company-holiday-table] Table missing — creating it now.');

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE "CompanyHolidayType" AS ENUM ('HOLIDAY', 'EXTRA_LEAVE');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "CompanyHoliday" (
        "id"          TEXT NOT NULL,
        "date"        TIMESTAMP(3) NOT NULL,
        "label"       TEXT NOT NULL,
        "type"        "CompanyHolidayType" NOT NULL DEFAULT 'HOLIDAY',
        "createdById" TEXT,
        "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT "CompanyHoliday_pkey" PRIMARY KEY ("id")
      );
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "CompanyHoliday_date_key"
      ON "CompanyHoliday"("date");
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS "CompanyHoliday_date_idx"
      ON "CompanyHoliday"("date");
    `);

    await client.query(`
      DO $$ BEGIN
        ALTER TABLE "CompanyHoliday"
        ADD CONSTRAINT "CompanyHoliday_createdById_fkey"
        FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    console.log('[ensure-company-holiday-table] Table created successfully.');
  } finally {
    await client.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    // Never block app startup over this — worst case, holidays stay broken
    // (as they already are) and the next deploy retries.
    console.error('[ensure-company-holiday-table] Failed:', err.message);
    process.exit(0);
  });
