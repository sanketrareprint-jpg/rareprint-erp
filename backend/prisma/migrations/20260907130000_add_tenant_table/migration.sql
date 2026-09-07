-- Phase 1 of docs/SaaS_Conversion_Roadmap_v2.md: multi-tenant SaaS
-- foundation. Adds the `Tenant` table only — purely additive, a brand new
-- table with no foreign keys into any existing table yet. Zero impact on
-- existing data or queries.
--
-- Deliberately NOT included here (next step, after the model-by-model list
-- is reviewed): adding `tenantId` to ~100 existing tables, backfilling
-- every row with a "RarePrint" tenant, and the composite-unique changes to
-- orderNumber/invoiceNumber/etc. That is a much higher-risk change and
-- should ship as its own separate, reviewed migration.

DO $$ BEGIN
  CREATE TYPE "TenantStatus" AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subdomain" TEXT NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'TRIAL',
    "planId" TEXT,
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  CREATE UNIQUE INDEX "Tenant_subdomain_key" ON "Tenant"("subdomain");
EXCEPTION
  WHEN duplicate_table THEN NULL;
END $$;
