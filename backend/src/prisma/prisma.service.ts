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
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
