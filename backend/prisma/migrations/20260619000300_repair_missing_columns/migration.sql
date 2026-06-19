-- Repair migration: safely add all columns/tables that may have been missed
-- if migration 20260619000100 partially failed.
-- Uses IF NOT EXISTS throughout so this is always safe to re-run.

-- OfferCode table
CREATE TABLE IF NOT EXISTS "OfferCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "productIds" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OfferCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OfferCode_code_key" ON "OfferCode"("code");

-- ProductRule table
CREATE TABLE IF NOT EXISTS "ProductRule" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "minQty" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProductRule_productId_key" ON "ProductRule"("productId");

-- Add offerCodeId to OrderItem (safe)
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "offerCodeId" TEXT;

-- Add FK constraint only if it doesn't already exist
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OrderItem_offerCodeId_fkey'
  ) THEN
    ALTER TABLE "OrderItem"
      ADD CONSTRAINT "OrderItem_offerCodeId_fkey"
      FOREIGN KEY ("offerCodeId") REFERENCES "OfferCode"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProductRule_productId_fkey'
  ) THEN
    ALTER TABLE "ProductRule"
      ADD CONSTRAINT "ProductRule_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "Product"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Add isSample and samplePaymentType to Order (from migration 20260619000200)
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "isSample" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "samplePaymentType" TEXT;
