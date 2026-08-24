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
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
