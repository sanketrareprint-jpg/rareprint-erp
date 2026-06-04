-- CreateEnum
CREATE TYPE "InHouseStickerTxType" AS ENUM ('STOCK_IN', 'USED', 'ADJUSTMENT');

-- CreateTable: single-row stock balance tracker
CREATE TABLE "InHouseStickerStock" (
    "id" TEXT NOT NULL,
    "balanceSheets" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InHouseStickerStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable: full transaction ledger
CREATE TABLE "InHouseStickerTransaction" (
    "id" TEXT NOT NULL,
    "transactionType" "InHouseStickerTxType" NOT NULL,
    "sheets" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "referenceId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InHouseStickerTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InHouseStickerTransaction_createdAt_idx" ON "InHouseStickerTransaction"("createdAt");

-- Seed one row for the stock balance (singleton pattern)
INSERT INTO "InHouseStickerStock" ("id", "balanceSheets", "updatedAt")
VALUES ('inhouse-sticker-stock-singleton', 0, NOW());
