-- Add isPress column to Vendor
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "isPress" BOOLEAN NOT NULL DEFAULT false;

-- New enums
DO $$ BEGIN
  CREATE TYPE "PaperUnit" AS ENUM ('REAM', 'PACKET');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PaperPOStatus" AS ENUM ('DRAFT', 'RECEIVED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PaperTransactionType" AS ENUM ('PURCHASE', 'PRINTING_DEDUCTION', 'ADJUSTMENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- PaperPurchaseOrder
CREATE TABLE IF NOT EXISTS "PaperPurchaseOrder" (
  "id"               TEXT            NOT NULL,
  "poNumber"         TEXT            NOT NULL,
  "invoiceNumber"    TEXT,
  "invoiceImagePath" TEXT,
  "supplierId"       TEXT,
  "status"           "PaperPOStatus" NOT NULL DEFAULT 'DRAFT',
  "notes"            TEXT,
  "createdAt"        TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaperPurchaseOrder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PaperPurchaseOrder_poNumber_key" ON "PaperPurchaseOrder"("poNumber");
ALTER TABLE "PaperPurchaseOrder" DROP CONSTRAINT IF EXISTS "PaperPurchaseOrder_supplierId_fkey";
ALTER TABLE "PaperPurchaseOrder"
  ADD CONSTRAINT "PaperPurchaseOrder_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- PaperPurchaseItem
CREATE TABLE IF NOT EXISTS "PaperPurchaseItem" (
  "id"            TEXT           NOT NULL,
  "poId"          TEXT           NOT NULL,
  "paperName"     TEXT           NOT NULL,
  "gsm"           INTEGER        NOT NULL,
  "quality"       "SheetQuality" NOT NULL,
  "sizeInches"    TEXT,
  "unit"          "PaperUnit"    NOT NULL,
  "unitQuantity"  DOUBLE PRECISION NOT NULL,
  "sheetsPerUnit" INTEGER        NOT NULL,
  "totalSheets"   INTEGER        NOT NULL,
  "pressId"       TEXT           NOT NULL,
  "createdAt"     TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaperPurchaseItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PaperPurchaseItem_poId_idx" ON "PaperPurchaseItem"("poId");
CREATE INDEX IF NOT EXISTS "PaperPurchaseItem_pressId_gsm_quality_idx" ON "PaperPurchaseItem"("pressId", "gsm", "quality");
ALTER TABLE "PaperPurchaseItem" DROP CONSTRAINT IF EXISTS "PaperPurchaseItem_poId_fkey";
ALTER TABLE "PaperPurchaseItem"
  ADD CONSTRAINT "PaperPurchaseItem_poId_fkey"
  FOREIGN KEY ("poId") REFERENCES "PaperPurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaperPurchaseItem" DROP CONSTRAINT IF EXISTS "PaperPurchaseItem_pressId_fkey";
ALTER TABLE "PaperPurchaseItem"
  ADD CONSTRAINT "PaperPurchaseItem_pressId_fkey"
  FOREIGN KEY ("pressId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- PaperInventory (running balance)
CREATE TABLE IF NOT EXISTS "PaperInventory" (
  "id"            TEXT           NOT NULL,
  "pressId"       TEXT           NOT NULL,
  "gsm"           INTEGER        NOT NULL,
  "quality"       "SheetQuality" NOT NULL,
  "balanceSheets" INTEGER        NOT NULL DEFAULT 0,
  "updatedAt"     TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaperInventory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PaperInventory_pressId_gsm_quality_key" ON "PaperInventory"("pressId", "gsm", "quality");
CREATE INDEX IF NOT EXISTS "PaperInventory_pressId_idx" ON "PaperInventory"("pressId");
ALTER TABLE "PaperInventory" DROP CONSTRAINT IF EXISTS "PaperInventory_pressId_fkey";
ALTER TABLE "PaperInventory"
  ADD CONSTRAINT "PaperInventory_pressId_fkey"
  FOREIGN KEY ("pressId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- PaperTransaction (full ledger)
CREATE TABLE IF NOT EXISTS "PaperTransaction" (
  "id"              TEXT                  NOT NULL,
  "pressId"         TEXT                  NOT NULL,
  "gsm"             INTEGER               NOT NULL,
  "quality"         "SheetQuality"        NOT NULL,
  "transactionType" "PaperTransactionType" NOT NULL,
  "sheets"          INTEGER               NOT NULL,
  "balanceAfter"    INTEGER               NOT NULL,
  "referenceId"     TEXT,
  "referenceType"   TEXT,
  "notes"           TEXT,
  "purchaseItemId"  TEXT,
  "createdAt"       TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaperTransaction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PaperTransaction_pressId_gsm_quality_createdAt_idx"
  ON "PaperTransaction"("pressId", "gsm", "quality", "createdAt");
CREATE INDEX IF NOT EXISTS "PaperTransaction_referenceId_idx" ON "PaperTransaction"("referenceId");
ALTER TABLE "PaperTransaction" DROP CONSTRAINT IF EXISTS "PaperTransaction_pressId_fkey";
ALTER TABLE "PaperTransaction"
  ADD CONSTRAINT "PaperTransaction_pressId_fkey"
  FOREIGN KEY ("pressId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaperTransaction" DROP CONSTRAINT IF EXISTS "PaperTransaction_purchaseItemId_fkey";
ALTER TABLE "PaperTransaction"
  ADD CONSTRAINT "PaperTransaction_purchaseItemId_fkey"
  FOREIGN KEY ("purchaseItemId") REFERENCES "PaperPurchaseItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
