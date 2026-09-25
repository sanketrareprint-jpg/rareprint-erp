-- Courier Calculator quote history. Additive only: one new table, no existing table touched.
-- Idempotent (IF NOT EXISTS) so it is safe alongside scripts/ensure-courier-rate-quote-table.js.
CREATE TABLE IF NOT EXISTS "CourierRateQuote" (
  "id" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "pickupId" TEXT NOT NULL,
  "pickupName" TEXT NOT NULL,
  "pickupPincode" TEXT NOT NULL,
  "deliveryPincode" TEXT NOT NULL,
  "paymentMode" TEXT NOT NULL,
  "codAmount" DECIMAL(14,2),
  "totalWeightKg" DECIMAL(10,3) NOT NULL,
  "items" JSONB NOT NULL,
  "rates" JSONB NOT NULL,
  "createdById" TEXT,
  "createdByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CourierRateQuote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CourierRateQuote_createdAt_idx" ON "CourierRateQuote"("createdAt");
CREATE INDEX IF NOT EXISTS "CourierRateQuote_createdById_idx" ON "CourierRateQuote"("createdById");
