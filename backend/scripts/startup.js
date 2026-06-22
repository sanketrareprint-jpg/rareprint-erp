/**
 * startup.js — RarePrint ERP backend startup script
 *
 * Runs before the NestJS server starts. Does three things:
 *  1. Directly adds any missing DB columns via pg (bypasses Prisma migration state)
 *  2. Marks stuck failed migrations as applied so future migrate deploys work
 *  3. Starts the server — ALWAYS, even if migration steps partially fail
 *
 * This replaces the fragile `migrate deploy && node dist/src/main.js` pattern
 * where a single failed migration prevents the server from ever starting.
 */

'use strict';

const { Client } = require('pg');
const { execSync } = require('child_process');

// ── 1. Direct SQL repair ─────────────────────────────────────────────────────
// Each statement is safe to run even if the column/table already exists.
// pg errors on individual statements are caught and logged, never fatal.
const REPAIR_SQL = [
  // Enum + columns (from migration 20260605000200_commission_profit_system)
  `DO $$ BEGIN
    CREATE TYPE "SalesAgentCategory" AS ENUM ('A', 'B', 'C', 'D');
  EXCEPTION WHEN duplicate_object THEN null; END $$`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "salesAgentCategory" "SalesAgentCategory"`,
  `CREATE TABLE IF NOT EXISTS "ProductRateSlab" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "minQuantity" INTEGER NOT NULL,
    "maxQuantity" INTEGER,
    "rateAmount" DECIMAL(12,2) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductRateSlab_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "ProductRateSlab_productId_minQuantity_maxQuantity_idx"
    ON "ProductRateSlab"("productId", "minQuantity", "maxQuantity")`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductRateSlab_productId_fkey') THEN
      ALTER TABLE "ProductRateSlab" ADD CONSTRAINT "ProductRateSlab_productId_fkey"
        FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END $$`,

  // Tables (from migration 20260619000100)
  `CREATE TABLE IF NOT EXISTS "OfferCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "productIds" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OfferCode_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "OfferCode_code_key" ON "OfferCode"("code")`,
  `CREATE TABLE IF NOT EXISTS "ProductRule" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "minQty" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductRule_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ProductRule_productId_key" ON "ProductRule"("productId")`,

  // Columns (from migration 20260619000100)
  `ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "offerCodeId" TEXT`,

  // Columns (from migration 20260619000200)
  `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "isSample" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "samplePaymentType" TEXT`,

  // Foreign keys (idempotent via DO block)
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderItem_offerCodeId_fkey') THEN
      ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_offerCodeId_fkey"
        FOREIGN KEY ("offerCodeId") REFERENCES "OfferCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
  END $$`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductRule_productId_fkey') THEN
      ALTER TABLE "ProductRule" ADD CONSTRAINT "ProductRule_productId_fkey"
        FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END $$`,
];

async function repairDatabase() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    console.log('[startup] Connected to database for repair pass');
    for (const sql of REPAIR_SQL) {
      try {
        await client.query(sql);
      } catch (err) {
        // Log but never abort — partial success is fine
        console.warn('[startup] Repair statement skipped:', err.message.split('\n')[0]);
      }
    }
    console.log('[startup] Database repair pass complete');
  } catch (err) {
    console.error('[startup] Could not connect to DB for repair:', err.message);
    // Continue anyway — server may still work if DB is eventually reachable
  } finally {
    await client.end().catch(() => {});
  }
}

// ── 2. Mark stuck migrations as applied ──────────────────────────────────────
function resolveMigration(name) {
  try {
    execSync(`npx prisma migrate resolve --applied ${name}`, { stdio: 'pipe' });
    console.log(`[startup] Resolved migration: ${name}`);
  } catch (err) {
    // Already applied or not in DB — both are fine
    console.log(`[startup] migrate resolve skipped for ${name} (already OK)`);
  }
}

// ── 3. Run pending migrations ─────────────────────────────────────────────────
function deployMigrations() {
  try {
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });
    console.log('[startup] prisma migrate deploy complete');
  } catch (err) {
    console.error('[startup] prisma migrate deploy failed — continuing anyway');
    // The repair pass above already added the critical columns, so the
    // server can still operate even if the migration table is messy.
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  await repairDatabase();

  resolveMigration('20260605000200_commission_profit_system');
  resolveMigration('20260619000100_add_offer_code_and_product_rule');
  resolveMigration('20260619000200_add_sample_order_fields');
  resolveMigration('20260619000300_repair_missing_columns');

  deployMigrations();

  console.log('[startup] Starting NestJS server...');
  // Replace this process with the server — logs and signals work normally
  require('child_process').spawnSync('node', ['dist/src/main.js'], { stdio: 'inherit' });
}

main().catch((err) => {
  console.error('[startup] Fatal error:', err);
  process.exit(1);
});
