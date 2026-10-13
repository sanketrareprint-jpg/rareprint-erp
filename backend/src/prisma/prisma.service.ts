import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Prisma ORM v7 removed the `url` field from schema.prisma's datasource
// block — PrismaClient now needs a driver adapter passed explicitly instead
// of reading a connection string from the schema. See
// https://pris.ly/d/prisma7-client-config
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
    await this.$executeRawUnsafe(
      `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "paperType" TEXT`,
    ).catch(() => { /* ignore if already exists */ });
    // Paper PO billing columns (migration 20260612000400_add_billing_fields_to_paper_po)
    // were never actually added to schema.prisma as model fields — only to the
    // raw migration SQL — so Prisma's generated client never knew about them and
    // PaperInventoryService.createPurchaseOrder() has always had to write them via
    // $executeRaw. That's fine IF the columns exist, but the migration itself only
    // ran when someone manually executed scripts/ensure-all-columns.js or
    // scripts/railway-migrate.js against production — neither runs automatically on
    // a normal Railway deploy (this repo deliberately keeps startCommand as plain
    // `node dist/src/main.js`, see team notes on why). Adding the same self-heal
    // here means it runs on every single boot with zero manual step, guaranteed,
    // instead of depending on someone remembering to run a separate script.
    await this.$executeRawUnsafe(
      `ALTER TABLE "PaperPurchaseOrder" ADD COLUMN IF NOT EXISTS "transportCharges" DOUBLE PRECISION DEFAULT 0`,
    ).catch(() => { /* ignore if already exists */ });
    await this.$executeRawUnsafe(
      `ALTER TABLE "PaperPurchaseOrder" ADD COLUMN IF NOT EXISTS "totalBillAmount" DOUBLE PRECISION`,
    ).catch(() => { /* ignore if already exists */ });
    await this.$executeRawUnsafe(
      `ALTER TABLE "PaperPurchaseItem" ADD COLUMN IF NOT EXISTS "ratePerUnit" DOUBLE PRECISION`,
    ).catch(() => { /* ignore if already exists */ });
    // Columns Prisma reads on every query of their model, so a DB that hasn't
    // had its migration applied yet would break those screens outright. Both
    // are metadata-only (nullable / constant default), so they add no boot
    // time. Index + FK for salaryForEmployeeId come from migration
    // 20260929160000_add_salary_for_employee — not needed for queries to work.
    await this.$executeRawUnsafe(
      `ALTER TABLE "BankTransaction" ADD COLUMN IF NOT EXISTS "salaryForEmployeeId" TEXT`,
    ).catch(() => { /* ignore if already exists */ });
    await this.$executeRawUnsafe(
      `ALTER TABLE "CompanyHoliday" ADD COLUMN IF NOT EXISTS "days" DECIMAL(4,2) NOT NULL DEFAULT 1`,
    ).catch(() => { /* ignore if already exists */ });
    // Migration 20261002120000_add_customer_dob — nullable, metadata-only.
    await this.$executeRawUnsafe(
      `ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "dateOfBirth" DATE`,
    ).catch(() => { /* ignore if already exists */ });
    // Migration 20261009150000_add_lead_reserved — constant default, metadata-only.
    // Prisma reads it on every Lead query, so the CRM breaks without it.
    await this.$executeRawUnsafe(
      `ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "isReserved" BOOLEAN NOT NULL DEFAULT false`,
    ).catch(() => { /* ignore if already exists */ });
    // Migration 20261008120000_add_dialer_desk_response — nullable, metadata-only.
    // The dialer PC popup polls GET /dialer/live every few seconds, so a DB
    // without these would log an error per poll until migrated.
    for (const col of [
      `"deskOutcome" "DialerOutcome"`,
      `"deskNote" TEXT`,
      `"deskCallbackAt" TIMESTAMP(3)`,
      `"deskSubmittedAt" TIMESTAMP(3)`,
      // Migration 20261008180000_add_dialer_reply_details — same reason.
      `"deskNotInterestedReason" TEXT`,
      `"deskProducts" JSONB`,
      `"deskEndCallAt" TIMESTAMP(3)`,
      // Migration 20261009120000_add_dialer_live_state — same reason.
      `"liveState" TEXT`,
      `"liveStateAt" TIMESTAMP(3)`,
      // Migration 20261009150000_add_dialer_desk_then — same reason.
      `"deskThen" TEXT`,
    ]) {
      await this.$executeRawUnsafe(
        `ALTER TABLE "DialerLock" ADD COLUMN IF NOT EXISTS ${col}`,
      ).catch(() => { /* ignore if already exists, or DialerLock not created yet */ });
    }
    for (const col of [`"notInterestedReason" TEXT`, `"products" JSONB`]) {
      await this.$executeRawUnsafe(
        `ALTER TABLE "DialerCall" ADD COLUMN IF NOT EXISTS ${col}`,
      ).catch(() => { /* ignore if already exists, or DialerCall not created yet */ });
    }
    // Migration 20261012120000_add_shopify_integration — nullable, metadata-only.
    // Prisma reads both on every Order query, so every order screen breaks
    // without them. The unique index is what stops a Shopify order being
    // created twice; it's on a column that is NULL for every non-Shopify order.
    for (const sql of [
      `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "shopifyOrderId" TEXT`,
      `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "shopifyData" JSONB`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "Order_shopifyOrderId_key" ON "Order"("shopifyOrderId")`,
    ]) {
      await this.$executeRawUnsafe(sql).catch(() => { /* ignore if already exists */ });
    }
    // Migration 20261013180000_add_shopify_product_link — new table, read on
    // every Shopify inbox review. Same idempotent SQL as the migration file.
    for (const sql of [
      `CREATE TABLE IF NOT EXISTS "ShopifyProductLink" ("id" TEXT NOT NULL, "shopifyProductId" TEXT NOT NULL, "shopifyTitle" TEXT, "productId" TEXT NOT NULL, "linkedById" TEXT, "linkedByName" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "ShopifyProductLink_pkey" PRIMARY KEY ("id"))`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "ShopifyProductLink_shopifyProductId_key" ON "ShopifyProductLink"("shopifyProductId")`,
      `CREATE INDEX IF NOT EXISTS "ShopifyProductLink_productId_idx" ON "ShopifyProductLink"("productId")`,
    ]) {
      await this.$executeRawUnsafe(sql).catch(() => { /* ignore if already exists */ });
    }
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
