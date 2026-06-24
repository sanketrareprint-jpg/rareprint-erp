import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
    // Ensure paperType column exists on Product table (safe to run repeatedly)
    await this.$executeRawUnsafe(
      `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "paperType" TEXT`,
    ).catch(() => {/* ignore if already exists or insufficient permissions */});
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}