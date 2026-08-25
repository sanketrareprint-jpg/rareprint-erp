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
//
// dotenv/config is required so this also works when run manually from a
// local machine (DATABASE_URL only lives in .env there) — on Railway itself
// DATABASE_URL is already a real env var so this is a no-op there. Without
// it, running this locally silently skips every check and just prints an
// info line ("No DATABASE_URL set") that doesn't look like an error at a
// glance — which is exactly what happened on 2026-08-08: the
// pendingDispatchItemIds column was never actually added, breaking every
// Order query built with `include` (which pulls every column) while
// `select`-based queries kept working, until this was caught.
require('dotenv/config');
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

    // ── Shipment fship columns ──────────────────────────────────────────────
    await safely('Shipment fship columns', async () => {
      const COLUMNS = [
        { name: 'fshipOrderId', ddl: 'TEXT' },
        { name: 'fshipStatus', ddl: 'TEXT' },
        { name: 'fshipSyncedAt', ddl: 'TIMESTAMP(3)' },
      ];
      const { rows } = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'Shipment' AND column_name = ANY($1::text[])
      `, [COLUMNS.map((c) => c.name)]);
      const existing = new Set(rows.map((r) => r.column_name));
      const missing = COLUMNS.filter((c) => !existing.has(c.name));
      if (missing.length === 0) {
        console.log('[ensure-all-columns] Shipment fship columns: all exist.');
        return;
      }
      for (const col of missing) {
        console.log(`[ensure-all-columns] Shipment.${col.name}: missing, adding.`);
        await client.query(`ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "${col.name}" ${col.ddl};`);
      }
      console.log('[ensure-all-columns] Shipment fship columns: added.');
    });

    // ── Shipment ship-to address override columns ──────────────────────────
    await safely('Shipment address override columns', async () => {
      const COLUMNS = [
        { name: 'overrideReceiverName', ddl: 'TEXT' },
        { name: 'overrideReceiverPhone', ddl: 'TEXT' },
        { name: 'overrideShippingAddress', ddl: 'TEXT' },
        { name: 'overrideShippingCity', ddl: 'TEXT' },
        { name: 'overrideShippingState', ddl: 'TEXT' },
        { name: 'overrideShippingPincode', ddl: 'TEXT' },
      ];
      const { rows } = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'Shipment' AND column_name = ANY($1::text[])
      `, [COLUMNS.map((c) => c.name)]);
      const existing = new Set(rows.map((r) => r.column_name));
      const missing = COLUMNS.filter((c) => !existing.has(c.name));
      if (missing.length === 0) {
        console.log('[ensure-all-columns] Shipment address override columns: all exist.');
        return;
      }
      for (const col of missing) {
        console.log(`[ensure-all-columns] Shipment.${col.name}: missing, adding.`);
        await client.query(`ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "${col.name}" ${col.ddl};`);
      }
      console.log('[ensure-all-columns] Shipment address override columns: added.');
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

    // ── Order.pendingDispatchItemIds column ───────────────────────────────
    await safely('Order.pendingDispatchItemIds', async () => {
      const { rows } = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'Order' AND column_name = 'pendingDispatchItemIds'
      `);
      if (rows.length > 0) {
        console.log('[ensure-all-columns] Order.pendingDispatchItemIds: already exists.');
        return;
      }
      console.log('[ensure-all-columns] Order.pendingDispatchItemIds: missing, adding.');
      await client.query(`ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "pendingDispatchItemIds" TEXT[] NOT NULL DEFAULT '{}';`);
      console.log('[ensure-all-columns] Order.pendingDispatchItemIds: added.');
    });

    // ── OrderItem.dispatchedAt column ─────────────────────────────────────
    await safely('OrderItem.dispatchedAt', async () => {
      const { rows } = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'OrderItem' AND column_name = 'dispatchedAt'
      `);
      if (rows.length > 0) {
        console.log('[ensure-all-columns] OrderItem.dispatchedAt: already exists.');
        return;
      }
      console.log('[ensure-all-columns] OrderItem.dispatchedAt: missing, adding.');
      await client.query(`ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "dispatchedAt" TIMESTAMP(3);`);
      console.log('[ensure-all-columns] OrderItem.dispatchedAt: added.');
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

    // ── Order dispatch photo columns ──────────────────────────────────────
    await safely('Order dispatch photo columns', async () => {
      const COLUMNS = ['dispatchProductPhoto', 'dispatchBillPhoto'];
      const { rows } = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'Order' AND column_name = ANY($1::text[])
      `, [COLUMNS]);
      const existing = new Set(rows.map((r) => r.column_name));
      const missing = COLUMNS.filter((c) => !existing.has(c));
      if (missing.length === 0) {
        console.log('[ensure-all-columns] Order dispatch photo columns: all exist.');
        return;
      }
      for (const col of missing) {
        console.log(`[ensure-all-columns] Order.${col}: missing, adding.`);
        await client.query(`ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "${col}" TEXT;`);
      }
      console.log('[ensure-all-columns] Order dispatch photo columns: added.');
    });

    // ── RemittanceImportSession date-range columns ────────────────────────
    await safely('RemittanceImportSession date-range columns', async () => {
      const COLUMNS = ['remittanceDateFrom', 'remittanceDateTo'];
      const { rows } = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'RemittanceImportSession' AND column_name = ANY($1::text[])
      `, [COLUMNS]);
      const existing = new Set(rows.map((r) => r.column_name));
      const missing = COLUMNS.filter((c) => !existing.has(c));
      if (missing.length === 0) {
        console.log('[ensure-all-columns] RemittanceImportSession date-range columns: all exist.');
        return;
      }
      for (const col of missing) {
        console.log(`[ensure-all-columns] RemittanceImportSession.${col}: missing, adding.`);
        await client.query(`ALTER TABLE "RemittanceImportSession" ADD COLUMN IF NOT EXISTS "${col}" TIMESTAMP(3);`);
      }
      console.log('[ensure-all-columns] RemittanceImportSession date-range columns: added.');
    });

    // ── RemittanceRecord.pickupDate column ────────────────────────────────
    await safely('RemittanceRecord.pickupDate', async () => {
      const { rows } = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'RemittanceRecord' AND column_name = 'pickupDate'
      `);
      if (rows.length > 0) {
        console.log('[ensure-all-columns] RemittanceRecord.pickupDate: already exists.');
        return;
      }
      console.log('[ensure-all-columns] RemittanceRecord.pickupDate: missing, adding.');
      await client.query(`ALTER TABLE "RemittanceRecord" ADD COLUMN IF NOT EXISTS "pickupDate" TIMESTAMP(3);`);
      console.log('[ensure-all-columns] RemittanceRecord.pickupDate: added.');
    });

    // ── ShippingChargeRecord table ────────────────────────────────────────
    await safely('ShippingChargeRecord', async () => {
      const { rows } = await client.query(`SELECT to_regclass('public."ShippingChargeRecord"') AS reg`);
      if (rows[0]?.reg) {
        console.log('[ensure-all-columns] ShippingChargeRecord: already exists.');
        return;
      }
      console.log('[ensure-all-columns] ShippingChargeRecord: missing, creating.');
      await client.query(`
        CREATE TABLE IF NOT EXISTS "ShippingChargeRecord" (
          "id"               TEXT NOT NULL,
          "awbNumber"        TEXT NOT NULL,
          "bigshipOrderId"   TEXT,
          "courierName"      TEXT,
          "orderStatus"      TEXT,
          "courierCreatedAt" TIMESTAMP(3),
          "manifestedWeight" DECIMAL(10,2),
          "appliedWeight"    DECIMAL(10,2),
          "weightParameter"  TEXT,
          "freightCharges"   DECIMAL(12,2),
          "totalCharges"     DECIMAL(12,2) NOT NULL,
          "orderValue"       DECIMAL(12,2),
          "productsRaw"      TEXT,
          "sourceFileName"   TEXT,
          "importedById"     TEXT,
          "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt"        TIMESTAMP(3) NOT NULL,
          CONSTRAINT "ShippingChargeRecord_pkey" PRIMARY KEY ("id")
        );
      `);
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ShippingChargeRecord_awbNumber_key" ON "ShippingChargeRecord"("awbNumber");`);
      await client.query(`CREATE INDEX IF NOT EXISTS "ShippingChargeRecord_awbNumber_idx" ON "ShippingChargeRecord"("awbNumber");`);
      await client.query(`
        DO $$ BEGIN
          ALTER TABLE "ShippingChargeRecord" ADD CONSTRAINT "ShippingChargeRecord_importedById_fkey"
          FOREIGN KEY ("importedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
        EXCEPTION WHEN duplicate_object THEN null; END $$;
      `);
      console.log('[ensure-all-columns] ShippingChargeRecord: created.');
    });

    // ── Shipment courier-charge-collected columns ─────────────────────────
    await safely('Shipment courier charge columns', async () => {
      const COLUMNS = [
        { name: 'courierChargeCollected', ddl: 'DECIMAL(12,2)' },
        { name: 'courierChargeUpdatedAt', ddl: 'TIMESTAMP(3)' },
      ];
      const { rows } = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'Shipment' AND column_name = ANY($1::text[])
      `, [COLUMNS.map((c) => c.name)]);
      const existing = new Set(rows.map((r) => r.column_name));
      const missing = COLUMNS.filter((c) => !existing.has(c.name));
      if (missing.length === 0) {
        console.log('[ensure-all-columns] Shipment courier charge columns: all exist.');
        return;
      }
      for (const col of missing) {
        console.log(`[ensure-all-columns] Shipment.${col.name}: missing, adding.`);
        await client.query(`ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "${col.name}" ${col.ddl};`);
      }
      console.log('[ensure-all-columns] Shipment courier charge columns: added.');
    });

    // ── MachineReading table (workshop machine readings + operator pay) ────
    await safely('MachineReading', async () => {
      const { rows } = await client.query(`SELECT to_regclass('public."MachineReading"') AS reg`);
      if (rows[0]?.reg) {
        console.log('[ensure-all-columns] MachineReading: already exists.');
        return;
      }
      console.log('[ensure-all-columns] MachineReading: missing, creating.');
      await client.query(`
        CREATE TABLE IF NOT EXISTS "MachineReading" (
          "id"            TEXT NOT NULL,
          "machineName"   TEXT NOT NULL DEFAULT 'Envelope Machine',
          "readingDate"   TIMESTAMP(3) NOT NULL,
          "readingValue"  INTEGER NOT NULL,
          "wasReset"      BOOLEAN NOT NULL DEFAULT false,
          "notes"         TEXT,
          "isPaid"        BOOLEAN NOT NULL DEFAULT false,
          "unitsProduced" INTEGER,
          "paidAmount"    DECIMAL(10,2),
          "paidAt"        TIMESTAMP(3),
          "paidNote"      TEXT,
          "paidById"      TEXT,
          "recordedById"  TEXT,
          "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt"     TIMESTAMP(3) NOT NULL,
          CONSTRAINT "MachineReading_pkey" PRIMARY KEY ("id")
        );
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS "MachineReading_machineName_readingDate_idx" ON "MachineReading"("machineName", "readingDate");`);
      await client.query(`CREATE INDEX IF NOT EXISTS "MachineReading_isPaid_idx" ON "MachineReading"("isPaid");`);
      await client.query(`
        DO $$ BEGIN
          ALTER TABLE "MachineReading" ADD CONSTRAINT "MachineReading_paidById_fkey"
          FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
        EXCEPTION WHEN duplicate_object THEN null; END $$;
      `);
      await client.query(`
        DO $$ BEGIN
          ALTER TABLE "MachineReading" ADD CONSTRAINT "MachineReading_recordedById_fkey"
          FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
        EXCEPTION WHEN duplicate_object THEN null; END $$;
      `);
      console.log('[ensure-all-columns] MachineReading: created.');
    });

    // ── Courier charge actual/quoted columns ──────────────────────────────
    await safely('Courier charge actual/quoted columns', async () => {
      const { rows: shipmentRows } = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'Shipment' AND column_name = 'courierChargeActual'
      `);
      if (shipmentRows.length === 0) {
        console.log('[ensure-all-columns] Shipment.courierChargeActual: missing, adding.');
        await client.query(`ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "courierChargeActual" DECIMAL(12,2);`);
      } else {
        console.log('[ensure-all-columns] Shipment.courierChargeActual: already exists.');
      }

      const { rows: orderRows } = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'Order' AND column_name = 'courierChargeQuoted'
      `);
      if (orderRows.length === 0) {
        console.log('[ensure-all-columns] Order.courierChargeQuoted: missing, adding.');
        await client.query(`ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "courierChargeQuoted" DECIMAL(12,2);`);
      } else {
        console.log('[ensure-all-columns] Order.courierChargeQuoted: already exists.');
      }
    });

    // ── Order cancellation request/approval columns ────────────────────────
    await safely('Order cancellation columns', async () => {
      const COLUMNS = ['cancellationRequestedAt', 'cancellationRequestedByName', 'cancellationReason', 'pendingCancelItemIds'];
      const { rows } = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'Order' AND column_name = ANY($1::text[])
      `, [COLUMNS]);
      const existing = new Set(rows.map((r) => r.column_name));
      if (!existing.has('cancellationRequestedAt')) {
        console.log('[ensure-all-columns] Order.cancellationRequestedAt: missing, adding.');
        await client.query(`ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "cancellationRequestedAt" TIMESTAMP(3);`);
      } else {
        console.log('[ensure-all-columns] Order.cancellationRequestedAt: already exists.');
      }
      if (!existing.has('cancellationRequestedByName')) {
        console.log('[ensure-all-columns] Order.cancellationRequestedByName: missing, adding.');
        await client.query(`ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "cancellationRequestedByName" TEXT;`);
      } else {
        console.log('[ensure-all-columns] Order.cancellationRequestedByName: already exists.');
      }
      if (!existing.has('cancellationReason')) {
        console.log('[ensure-all-columns] Order.cancellationReason: missing, adding.');
        await client.query(`ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "cancellationReason" TEXT;`);
      } else {
        console.log('[ensure-all-columns] Order.cancellationReason: already exists.');
      }
      if (!existing.has('pendingCancelItemIds')) {
        console.log('[ensure-all-columns] Order.pendingCancelItemIds: missing, adding.');
        await client.query(`ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "pendingCancelItemIds" TEXT[] NOT NULL DEFAULT '{}';`);
      } else {
        console.log('[ensure-all-columns] Order.pendingCancelItemIds: already exists.');
      }
    });

    // ── OrderItem.cancelledAt column ────────────────────────────────────────
    await safely('OrderItem.cancelledAt', async () => {
      const { rows } = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'OrderItem' AND column_name = 'cancelledAt'
      `);
      if (rows.length > 0) {
        console.log('[ensure-all-columns] OrderItem.cancelledAt: already exists.');
        return;
      }
      console.log('[ensure-all-columns] OrderItem.cancelledAt: missing, adding.');
      await client.query(`ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);`);
      console.log('[ensure-all-columns] OrderItem.cancelledAt: added.');
    });

    // ── Order.isParcelBooking column ──────────────────────────────────────
    await safely('Order.isParcelBooking', async () => {
      const { rows } = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'Order' AND column_name = 'isParcelBooking'
      `);
      if (rows.length > 0) {
        console.log('[ensure-all-columns] Order.isParcelBooking: already exists.');
        return;
      }
      console.log('[ensure-all-columns] Order.isParcelBooking: missing, adding.');
      await client.query(`ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "isParcelBooking" BOOLEAN NOT NULL DEFAULT false;`);
      console.log('[ensure-all-columns] Order.isParcelBooking: added.');
    });

    // ── Order.parcelCourierCharge / Order.parcelPaymentType columns ────────
    await safely('Order.parcelCourierCharge', async () => {
      const { rows } = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'Order' AND column_name = 'parcelCourierCharge'
      `);
      if (rows.length > 0) {
        console.log('[ensure-all-columns] Order.parcelCourierCharge: already exists.');
        return;
      }
      console.log('[ensure-all-columns] Order.parcelCourierCharge: missing, adding.');
      await client.query(`ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "parcelCourierCharge" DECIMAL(12,2);`);
      console.log('[ensure-all-columns] Order.parcelCourierCharge: added.');
    });
    await safely('Order.parcelPaymentType', async () => {
      const { rows } = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'Order' AND column_name = 'parcelPaymentType'
      `);
      if (rows.length > 0) {
        console.log('[ensure-all-columns] Order.parcelPaymentType: already exists.');
        return;
      }
      console.log('[ensure-all-columns] Order.parcelPaymentType: missing, adding.');
      await client.query(`ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "parcelPaymentType" TEXT;`);
      console.log('[ensure-all-columns] Order.parcelPaymentType: added.');
    });

    // ── Agency Rates (Cost Table) ──────────────────────────────────────────
    await safely('User.usesAgencyRatesForCommission', async () => {
      const { rows } = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'User' AND column_name = 'usesAgencyRatesForCommission'
      `);
      if (rows.length === 0) {
        console.log('[ensure-all-columns] User.usesAgencyRatesForCommission: missing, adding.');
        await client.query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "usesAgencyRatesForCommission" BOOLEAN NOT NULL DEFAULT false;`);
      } else {
        console.log('[ensure-all-columns] User.usesAgencyRatesForCommission: already exists.');
      }
    });

    await safely('AgencyRateProduct', async () => {
      const { rows } = await client.query(`SELECT to_regclass('public."AgencyRateProduct"') AS reg`);
      if (rows[0]?.reg) {
        console.log('[ensure-all-columns] AgencyRateProduct: already exists.');
        return;
      }
      console.log('[ensure-all-columns] AgencyRateProduct: missing, creating.');
      await client.query(`
        CREATE TABLE IF NOT EXISTS "AgencyRateProduct" (
          "id"        TEXT NOT NULL,
          "productId" TEXT NOT NULL,
          "sortOrder" INTEGER NOT NULL DEFAULT 0,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "AgencyRateProduct_pkey" PRIMARY KEY ("id")
        );
      `);
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "AgencyRateProduct_productId_key" ON "AgencyRateProduct"("productId");`);
      await client.query(`
        DO $$ BEGIN
          ALTER TABLE "AgencyRateProduct" ADD CONSTRAINT "AgencyRateProduct_productId_fkey"
          FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        EXCEPTION WHEN duplicate_object THEN null; END $$;
      `);
      console.log('[ensure-all-columns] AgencyRateProduct: created.');
    });

    await safely('AgencyRateQuantityColumn', async () => {
      const { rows } = await client.query(`SELECT to_regclass('public."AgencyRateQuantityColumn"') AS reg`);
      if (rows[0]?.reg) {
        console.log('[ensure-all-columns] AgencyRateQuantityColumn: already exists.');
        return;
      }
      console.log('[ensure-all-columns] AgencyRateQuantityColumn: missing, creating.');
      await client.query(`
        CREATE TABLE IF NOT EXISTS "AgencyRateQuantityColumn" (
          "id"        TEXT NOT NULL,
          "quantity"  INTEGER NOT NULL,
          "sortOrder" INTEGER NOT NULL DEFAULT 0,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "AgencyRateQuantityColumn_pkey" PRIMARY KEY ("id")
        );
      `);
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "AgencyRateQuantityColumn_quantity_key" ON "AgencyRateQuantityColumn"("quantity");`);
      console.log('[ensure-all-columns] AgencyRateQuantityColumn: created.');
    });

    await safely('AgencyRate', async () => {
      const { rows } = await client.query(`SELECT to_regclass('public."AgencyRate"') AS reg`);
      if (rows[0]?.reg) {
        console.log('[ensure-all-columns] AgencyRate: already exists.');
        return;
      }
      console.log('[ensure-all-columns] AgencyRate: missing, creating.');
      await client.query(`
        CREATE TABLE IF NOT EXISTS "AgencyRate" (
          "id"        TEXT NOT NULL,
          "productId" TEXT NOT NULL,
          "quantity"  INTEGER NOT NULL,
          "rate"      DECIMAL(12,2) NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL,
          CONSTRAINT "AgencyRate_pkey" PRIMARY KEY ("id")
        );
      `);
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "AgencyRate_productId_quantity_key" ON "AgencyRate"("productId", "quantity");`);
      await client.query(`CREATE INDEX IF NOT EXISTS "AgencyRate_productId_idx" ON "AgencyRate"("productId");`);
      await client.query(`CREATE INDEX IF NOT EXISTS "AgencyRate_quantity_idx" ON "AgencyRate"("quantity");`);
      await client.query(`
        DO $$ BEGIN
          ALTER TABLE "AgencyRate" ADD CONSTRAINT "AgencyRate_productId_fkey"
          FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        EXCEPTION WHEN duplicate_object THEN null; END $$;
      `);
      console.log('[ensure-all-columns] AgencyRate: created.');
    });

    // ── PaperPurchaseOrder/Item billing columns ────────────────────────────
    // Migration 20260612000400_add_billing_fields_to_paper_po is on the
    // RECOVERABLE_MIGRATIONS list in railway-migrate.js (known to drift in
    // _prisma_migrations) but never had a matching self-heal check here —
    // same failure class as the 2026-08-14 courierChargeActual/Quoted
    // incident. createPurchaseOrder() writes these 3 columns via raw SQL
    // ($executeRaw, since the Prisma client may not have them typed yet), so
    // if they're missing on the DB the "New Paper Purchase Order" save fails
    // with a generic 500 and no useful message on the frontend.
    await safely('PaperPurchaseOrder billing columns', async () => {
      const { rows } = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'PaperPurchaseOrder' AND column_name = ANY($1::text[])
      `, [['transportCharges', 'totalBillAmount']]);
      const existing = new Set(rows.map((r) => r.column_name));
      if (!existing.has('transportCharges')) {
        console.log('[ensure-all-columns] PaperPurchaseOrder.transportCharges: missing, adding.');
        await client.query(`ALTER TABLE "PaperPurchaseOrder" ADD COLUMN IF NOT EXISTS "transportCharges" DOUBLE PRECISION DEFAULT 0;`);
      } else {
        console.log('[ensure-all-columns] PaperPurchaseOrder.transportCharges: already exists.');
      }
      if (!existing.has('totalBillAmount')) {
        console.log('[ensure-all-columns] PaperPurchaseOrder.totalBillAmount: missing, adding.');
        await client.query(`ALTER TABLE "PaperPurchaseOrder" ADD COLUMN IF NOT EXISTS "totalBillAmount" DOUBLE PRECISION;`);
      } else {
        console.log('[ensure-all-columns] PaperPurchaseOrder.totalBillAmount: already exists.');
      }
    });
    await safely('PaperPurchaseItem.ratePerUnit', async () => {
      const { rows } = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'PaperPurchaseItem' AND column_name = 'ratePerUnit'
      `);
      if (rows.length > 0) {
        console.log('[ensure-all-columns] PaperPurchaseItem.ratePerUnit: already exists.');
        return;
      }
      console.log('[ensure-all-columns] PaperPurchaseItem.ratePerUnit: missing, adding.');
      await client.query(`ALTER TABLE "PaperPurchaseItem" ADD COLUMN IF NOT EXISTS "ratePerUnit" DOUBLE PRECISION;`);
      console.log('[ensure-all-columns] PaperPurchaseItem.ratePerUnit: added.');
    });

    // ── Festival: date -> month/day (recurring) columns ────────────────────
    // 2026-08-25 incident: this exact conversion was first shipped as an
    // edit to an already-applied migration file, which `prisma migrate
    // deploy` silently refused to apply (checksum drift) -- and separately,
    // backend/railway.json's startCommand was found to bypass
    // railway-migrate.js (and thus this whole file) entirely, so neither
    // the migration nor this fallback ever ran. Both are now fixed; this
    // block is the same belt-and-suspenders fallback as everything else
    // here, so a future drift on this table self-heals instead of 500ing.
    // See docs/Events_Module_Context.md.
    await safely('Festival month/day columns', async () => {
      const { rows: reg } = await client.query(`SELECT to_regclass('public."Festival"') AS reg`);
      if (!reg[0]?.reg) {
        console.log('[ensure-all-columns] Festival: table does not exist yet, skipping.');
        return;
      }
      const { rows } = await client.query(`
        SELECT column_name FROM information_schema.columns WHERE table_name = 'Festival'
      `);
      const existing = new Set(rows.map((r) => r.column_name));
      if (existing.has('month') && existing.has('day')) {
        console.log('[ensure-all-columns] Festival.month/day: already exist.');
        return;
      }
      if (!existing.has('date')) {
        console.log('[ensure-all-columns] Festival: neither date nor month/day found -- unexpected, leaving alone.');
        return;
      }
      console.log('[ensure-all-columns] Festival: converting date -> month/day.');
      await client.query(`ALTER TABLE "Festival" ADD COLUMN IF NOT EXISTS "month" INTEGER;`);
      await client.query(`ALTER TABLE "Festival" ADD COLUMN IF NOT EXISTS "day" INTEGER;`);
      await client.query(`UPDATE "Festival" SET "month" = EXTRACT(MONTH FROM "date")::INTEGER, "day" = EXTRACT(DAY FROM "date")::INTEGER WHERE "month" IS NULL;`);
      await client.query(`ALTER TABLE "Festival" ALTER COLUMN "month" SET NOT NULL;`);
      await client.query(`ALTER TABLE "Festival" ALTER COLUMN "day" SET NOT NULL;`);
      await client.query(`ALTER TABLE "Festival" DROP COLUMN IF EXISTS "date";`);
      await client.query(`ALTER TABLE "Festival" DROP COLUMN IF EXISTS "sentAt";`);
      await client.query(`DROP INDEX IF EXISTS "Festival_date_idx";`);
      await client.query(`CREATE INDEX IF NOT EXISTS "Festival_month_day_idx" ON "Festival"("month", "day");`);
      console.log('[ensure-all-columns] Festival: converted to month/day.');
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
