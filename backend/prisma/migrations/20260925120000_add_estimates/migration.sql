-- Billing > Estimates. Additive only: two new tables, no existing table touched.
-- Idempotent (IF NOT EXISTS) so it is safe alongside scripts/ensure-estimate-tables.js.
CREATE TABLE IF NOT EXISTS "Estimate" (
  "id" TEXT NOT NULL,
  "estimateNumber" TEXT NOT NULL,
  "estimateDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validUntil" TIMESTAMP(3),
  "customerId" TEXT,
  "customerName" TEXT NOT NULL,
  "customerPhone" TEXT,
  "customerGstin" TEXT,
  "customerAddress" TEXT,
  "customerCity" TEXT,
  "customerState" TEXT,
  "customerPincode" TEXT,
  "notes" TEXT,
  "totalAmount" DECIMAL(14,2) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "convertedOrderId" TEXT,
  "convertedOrderNumber" TEXT,
  "convertedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Estimate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Estimate_estimateNumber_key" ON "Estimate"("estimateNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "Estimate_convertedOrderId_key" ON "Estimate"("convertedOrderId");
CREATE INDEX IF NOT EXISTS "Estimate_estimateDate_idx" ON "Estimate"("estimateDate");
CREATE INDEX IF NOT EXISTS "Estimate_customerId_idx" ON "Estimate"("customerId");

CREATE TABLE IF NOT EXISTS "EstimateItem" (
  "id" TEXT NOT NULL,
  "estimateId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "productId" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "sku" TEXT,
  "sizeInches" TEXT,
  "gsm" INTEGER,
  "paperType" TEXT,
  "sides" TEXT,
  "notes" TEXT,
  "quantity" INTEGER NOT NULL,
  "unitPrice" DECIMAL(14,4) NOT NULL,
  "lineTotal" DECIMAL(14,2) NOT NULL,
  CONSTRAINT "EstimateItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "EstimateItem_estimateId_idx" ON "EstimateItem"("estimateId");
DO $$ BEGIN
  ALTER TABLE "EstimateItem" ADD CONSTRAINT "EstimateItem_estimateId_fkey"
    FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
