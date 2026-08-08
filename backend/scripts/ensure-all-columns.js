// Combined self-heal script — runs every check from the individual
// ensure-*.js scripts (commission-override table, customer.phone2 column,
// shipment bigship columns, user-payment-keyword table, attendance
// isFinal column, company-holiday table) using ONE database connection and
// ONE Node process, instead of spawning six separate `node ensure-x.js`
// child processes (each paying its own ~1-1.5s Node startup + DB-connect
// cost). Same idempotent behavior as before, just consolidated — this
// was a real, measurable chunk of the ~40-47s the deploy boot sequence was
// consistently taking before the app itself even started.
//
// Each check is wrapped so one failing doesn't block the rest — matches
// the "allowFailure" behavior every individual script already had.
const { Client } = require('pg');

async function safely(label, fn) {
  try {
    await fn();
  } catch (err) {
    console.error(`[ensure-all-columns] ${label} failed:`, err.message);
  }
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.log('[ensure-all-columns] No DATABASE_URL set, skipping all checks.');
    return;
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    // ── CommissionOverride table ──────────────────────────────────────────
    await safely('CommissionOverride', async () => {
      const { rows } = await client.query(`SELECT to_regclass('public."CommissionOverride"') AS reg`);
      if (rows[0]?.reg) {
        console.log('[ensure-all-columns] CommissionOverride: already exists.');
        return;
      }
      console.log('[ensure-all-columns] CommissionOverride: missing, creating.');
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
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "CommissionOverride_orderItemId_key" ON "CommissionOverride"("orderItemId");`);
      await client.query(`
        DO $$ BEGIN
          ALTER TABLE "CommissionOverride" ADD CONSTRAINT "CommissionOverride_orderItemId_fkey"
          FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        EXCEPTION WHEN duplicate_object THEN null; END $$;
      `);
      await client.query(`
        DO $$ BEGIN
          ALTER TABLE "CommissionOverride" ADD CONSTRAINT "CommissionOverride_agentId_fkey"
          FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
        EXCEPTION WHEN duplicate_object THEN null; END $$;
      `);
      await client.query(`
        DO $$ BEGIN
          ALTER TABLE "CommissionOverride" ADD CONSTRAINT "CommissionOverride_setById_fkey"
          FOREIGN KEY ("setById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
        EXCEPTION WHEN duplicate_object THEN null; END $$;
      `);
      console.log('[ensure-all-columns] CommissionOverride: created.');
    });

    // ── Customer.phone2 column ────────────────────────────────────────────
    await safely('Customer.phone2', async () => {
      const { rows } = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'Customer' AND column_name = 'phone2'
      `);
      if (rows.length > 0) {
        console.log('[ensure-all-columns] Customer.phone2: already exists.');
        return;
      }
      console.log('[ensure-all-columns] Customer.phone2: missing, adding.');
      await client.query(`ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "phone2" TEXT;`);
      console.log('[ensure-all-columns] Customer.phone2: added.');
    });

    // ── Shipment bigship columns ──────────────────────────────────────────
    await safely('Shipment bigship columns', async () => {
      const COLUMNS = [
        { name: 'bigshipOrderId', ddl: 'TEXT' },
        { name: 'bigshipStatus', ddl: 'TEXT' },
        { name: 'bigshipSyncedAt', ddl: 'TIMESTAMP(3)' },
      ];
      const { rows } = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'Shipment' AND column_name = ANY($1::text[])
      `, [COLUMNS.map((c) => c.name)]);
      const existing = new Set(rows.map((r) => r.column_name));
      const missing = COLUMNS.filter((c) => !existing.has(c.name));
      if (missing.length === 0) {
        console.log('[ensure-all-columns] Shipment bigship columns: all exist.');
        return;
      }
      for (const col of missing) {
        console.log(`[ensure-all-columns] Shipment.${col.name}: missing, adding.`);
        await client.query(`ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "${col.name}" ${col.ddl};`);
      }
      console.log('[ensure-all-columns] Shipment bigship columns: added.');
    });

    // ── UserPaymentKeyword table ──────────────────────────────────────────
    await safely('UserPaymentKeyword', async () => {
      const { rows } = await client.query(`SELECT to_regclass('public."UserPaymentKeyword"') AS reg`);
      if (rows[0]?.reg) {
        console.log('[ensure-all-columns] UserPaymentKeyword: already exists.');
        return;
      }
      console.log('[ensure-all-columns] UserPaymentKeyword: missing, creating.');
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
        EXCEPTION WHEN duplicate_object THEN null; END $$;
      `);
      await client.query(`
        DO $$ BEGIN
          ALTER TABLE "UserPaymentKeyword" ADD CONSTRAINT "UserPaymentKeyword_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        EXCEPTION WHEN duplicate_object THEN null; END $$;
      `);
      console.log('[ensure-all-columns] UserPaymentKeyword: created.');
    });

    // ── AttendanceImportSession.isFinal column ────────────────────────────
    await safely('AttendanceImportSession.isFinal', async () => {
      const { rows } = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'AttendanceImportSession' AND column_name = 'isFinal'
      `);
      if (rows.length > 0) {
        console.log('[ensure-all-columns] AttendanceImportSession.isFinal: already exists.');
        return;
      }
      console.log('[ensure-all-columns] AttendanceImportSession.isFinal: missing, adding.');
      await client.query(`ALTER TABLE "AttendanceImportSession" ADD COLUMN IF NOT EXISTS "isFinal" BOOLEAN NOT NULL DEFAULT false;`);
      console.log('[ensure-all-columns] AttendanceImportSession.isFinal: added.');
    });

    // ── CompanyHoliday table ──────────────────────────────────────────────
    await safely('CompanyHoliday', async () => {
      const { rows } = await client.query(`SELECT to_regclass('public."CompanyHoliday"') AS reg`);
      if (rows[0]?.reg) {
        console.log('[ensure-all-columns] CompanyHoliday: already exists.');
        return;
      }
      console.log('[ensure-all-columns] CompanyHoliday: missing, creating.');
      await client.query(`
        DO $$ BEGIN
          CREATE TYPE "CompanyHolidayType" AS ENUM ('HOLIDAY', 'EXTRA_LEAVE');
        EXCEPTION WHEN duplicate_object THEN null; END $$;
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
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "CompanyHoliday_date_key" ON "CompanyHoliday"("date");`);
      await client.query(`CREATE INDEX IF NOT EXISTS "CompanyHoliday_date_idx" ON "CompanyHoliday"("date");`);
      await client.query(`
        DO $$ BEGIN
          ALTER TABLE "CompanyHoliday" ADD CONSTRAINT "CompanyHoliday_createdById_fkey"
          FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
        EXCEPTION WHEN duplicate_object THEN null; END $$;
      `);
      console.log('[ensure-all-columns] CompanyHoliday: created.');
    });

    console.log('[ensure-all-columns] All checks complete.');
  } finally {
    await client.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[ensure-all-columns] Fatal error:', err.message);
    process.exit(0);
  });
