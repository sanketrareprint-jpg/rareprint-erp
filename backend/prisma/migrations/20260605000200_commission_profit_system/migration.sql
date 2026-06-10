DO $$ BEGIN
  CREATE TYPE "SalesAgentCategory" AS ENUM ('A', 'B', 'C', 'D');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "salesAgentCategory" "SalesAgentCategory";

CREATE TABLE IF NOT EXISTS "ProductRateSlab" (
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
);

CREATE INDEX IF NOT EXISTS "ProductRateSlab_productId_minQuantity_maxQuantity_idx"
ON "ProductRateSlab"("productId", "minQuantity", "maxQuantity");

DO $$ BEGIN
  ALTER TABLE "ProductRateSlab"
  ADD CONSTRAINT "ProductRateSlab_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
