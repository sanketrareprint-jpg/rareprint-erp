-- Cost Table > Agency Rates: exact-quantity-match product rate table, opt-in
-- per sales agent (User.usesAgencyRatesForCommission). Additive only.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "usesAgencyRatesForCommission" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "AgencyRateProduct" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgencyRateProduct_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AgencyRateProduct_productId_key" ON "AgencyRateProduct"("productId");

CREATE TABLE IF NOT EXISTS "AgencyRateQuantityColumn" (
    "id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgencyRateQuantityColumn_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AgencyRateQuantityColumn_quantity_key" ON "AgencyRateQuantityColumn"("quantity");

CREATE TABLE IF NOT EXISTS "AgencyRate" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "rate" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgencyRate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AgencyRate_productId_quantity_key" ON "AgencyRate"("productId", "quantity");
CREATE INDEX IF NOT EXISTS "AgencyRate_productId_idx" ON "AgencyRate"("productId");
CREATE INDEX IF NOT EXISTS "AgencyRate_quantity_idx" ON "AgencyRate"("quantity");

DO $$ BEGIN
  ALTER TABLE "AgencyRateProduct" ADD CONSTRAINT "AgencyRateProduct_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "AgencyRate" ADD CONSTRAINT "AgencyRate_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
