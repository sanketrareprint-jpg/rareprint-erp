-- ── Paper Inventory Migration ────────────────────────────────────────────────
-- Run this SQL against your PostgreSQL database after deploying the new code.
-- Or use: npx prisma migrate dev --name add_paper_inventory

-- 1. Add isPress column to vendors
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "isPress" BOOLEAN NOT NULL DEFAULT false;

-- 2. New enums
DO $$ BEGIN
  CREATE TYPE "PaperUnit" AS ENUM ('REAM', 'PACKET');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PaperPOStatus" AS ENUM ('DRAFT', 'RECEIVED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PaperTransactionType" AS ENUM ('PURCHASE', 'PRINTING_DEDUCTION', 'ADJUSTMENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. PaperPurchaseOrder table
CREATE TABLE IF NOT EXISTS "PaperPurchaseOrder" (
  "id"               TEXT         NOT NULL PRIMARY KEY,
  "poNumber"         TEXT         NOT NULL UNIQUE,
  "invoiceNumber"    TEXT,
  "invoiceImagePath" TEXT,
  "supplierId"       TEXT,
  "status"           "PaperPOStatus" NOT NULL DEFAULT 'DRAFT',
  "notes"            TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaperPurchaseOrder_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- 4. PaperPurchaseItem table
CREATE TABLE IF NOT EXISTS "PaperPurchaseItem" (
  "id"           TEXT         NOT NULL PRIMARY KEY,
  "poId"         TEXT         NOT NULL,
  "paperName"    TEXT         NOT NULL,
  "gsm"          INTEGER      NOT NULL,
  "quality"      "SheetQuality" NOT NULL,
  "sizeInches"   TEXT,
  "unit"         "PaperUnit"  NOT NULL,
  "unitQuantity" DOUBLE PRECISION NOT NULL,
  "sheetsPerUnit" INTEGER     NOT NULL,
  "totalSheets"  INTEGER      NOT NULL,
  "pressId"      TEXT         NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaperPurchaseItem_poId_fkey"
    FOREIGN KEY ("poId") REFERENCES "PaperPurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PaperPurchaseItem_pressId_fkey"
    FOREIGN KEY ("pressId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "PaperPurchaseItem_poId_idx" ON "PaperPurchaseItem"("poId");
CREATE INDEX IF NOT EXISTS "PaperPurchaseItem_pressId_gsm_quality_idx" ON "PaperPurchaseItem"("pressId", "gsm", "quality");

-- 5. PaperInventory table (running balance)
CREATE TABLE IF NOT EXISTS "PaperInventory" (
  "id"             TEXT         NOT NULL PRIMARY KEY,
  "pressId"        TEXT         NOT NULL,
  "gsm"            INTEGER      NOT NULL,
  "quality"        "SheetQuality" NOT NULL,
  "balanceSheets"  INTEGER      NOT NULL DEFAULT 0,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaperInventory_pressId_gsm_quality_key" UNIQUE ("pressId", "gsm", "quality"),
  CONSTRAINT "PaperInventory_pressId_fkey"
    FOREIGN KEY ("pressId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "PaperInventory_pressId_idx" ON "PaperInventory"("pressId");

-- 6. PaperTransaction table (full ledger)
CREATE TABLE IF NOT EXISTS "PaperTransaction" (
  "id"               TEXT         NOT NULL PRIMARY KEY,
  "pressId"          TEXT         NOT NULL,
  "gsm"              INTEGER      NOT NULL,
  "quality"          "SheetQuality" NOT NULL,
  "transactionType"  "PaperTransactionType" NOT NULL,
  "sheets"           INTEGER      NOT NULL,
  "balanceAfter"     INTEGER      NOT NULL,
  "referenceId"      TEXT,
  "referenceType"    TEXT,
  "notes"            TEXT,
  "purchaseItemId"   TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaperTransaction_pressId_fkey"
    FOREIGN KEY ("pressId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PaperTransaction_purchaseItemId_fkey"
    FOREIGN KEY ("purchaseItemId") REFERENCES "PaperPurchaseItem"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "PaperTransaction_pressId_gsm_quality_createdAt_idx"
  ON "PaperTransaction"("pressId", "gsm", "quality", "createdAt");
CREATE INDEX IF NOT EXISTS "PaperTransaction_referenceId_idx" ON "PaperTransaction"("referenceId");

-- Done!
-- After running: npx prisma generate  (to regenerate the Prisma client)
