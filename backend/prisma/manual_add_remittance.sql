-- Scoped, additive-only SQL to create the COD Remittance tables.
-- Safe to run: creates 2 new tables + 1 enum, touches nothing else.
-- Run with: npx prisma db execute --file ./prisma/manual_add_remittance.sql --schema ./prisma/schema.prisma

-- CreateEnum
CREATE TYPE "RemittanceMatchStatus" AS ENUM ('NEEDS_REVIEW', 'MATCHED', 'POSTED', 'DUPLICATE', 'REJECTED');

-- CreateTable
CREATE TABLE "RemittanceImportSession" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "deliveredFileName" TEXT,
    "importedById" TEXT NOT NULL,
    "rowsFound" INTEGER NOT NULL DEFAULT 0,
    "rowsMatched" INTEGER NOT NULL DEFAULT 0,
    "rowsNeedReview" INTEGER NOT NULL DEFAULT 0,
    "rowsDuplicate" INTEGER NOT NULL DEFAULT 0,
    "rowsPosted" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RemittanceImportSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RemittanceRecord" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "importKey" TEXT NOT NULL,
    "remittanceRef" TEXT,
    "awbNumber" TEXT NOT NULL,
    "courierName" TEXT,
    "lrNumber" TEXT,
    "deliveryDate" TIMESTAMP(3),
    "remittanceDate" TIMESTAMP(3),
    "collectableAmount" DECIMAL(14,2) NOT NULL,
    "earlyCodAmount" DECIMAL(14,2),
    "otherDeduction" DECIMAL(14,2),
    "netPayableAmount" DECIMAL(14,2) NOT NULL,
    "remittanceStatus" TEXT,
    "channelOrderId" TEXT,
    "receiverName" TEXT,
    "receiverMobile" TEXT,
    "productDetails" TEXT,
    "matchStatus" "RemittanceMatchStatus" NOT NULL DEFAULT 'NEEDS_REVIEW',
    "matchMethod" TEXT,
    "matchedOrderId" TEXT,
    "suggestedOrderId" TEXT,
    "mobileMismatch" BOOLEAN NOT NULL DEFAULT false,
    "reviewNote" TEXT,
    "postedPaymentId" TEXT,
    "postedAt" TIMESTAMP(3),
    "postedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RemittanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RemittanceImportSession_createdAt_idx" ON "RemittanceImportSession"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RemittanceRecord_importKey_key" ON "RemittanceRecord"("importKey");

-- CreateIndex
CREATE UNIQUE INDEX "RemittanceRecord_postedPaymentId_key" ON "RemittanceRecord"("postedPaymentId");

-- CreateIndex
CREATE INDEX "RemittanceRecord_sessionId_idx" ON "RemittanceRecord"("sessionId");

-- CreateIndex
CREATE INDEX "RemittanceRecord_matchStatus_idx" ON "RemittanceRecord"("matchStatus");

-- CreateIndex
CREATE INDEX "RemittanceRecord_awbNumber_idx" ON "RemittanceRecord"("awbNumber");

-- AddForeignKey
ALTER TABLE "RemittanceImportSession" ADD CONSTRAINT "RemittanceImportSession_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemittanceRecord" ADD CONSTRAINT "RemittanceRecord_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "RemittanceImportSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemittanceRecord" ADD CONSTRAINT "RemittanceRecord_matchedOrderId_fkey" FOREIGN KEY ("matchedOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemittanceRecord" ADD CONSTRAINT "RemittanceRecord_suggestedOrderId_fkey" FOREIGN KEY ("suggestedOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemittanceRecord" ADD CONSTRAINT "RemittanceRecord_postedPaymentId_fkey" FOREIGN KEY ("postedPaymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemittanceRecord" ADD CONSTRAINT "RemittanceRecord_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
