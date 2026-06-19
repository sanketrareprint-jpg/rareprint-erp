-- AddColumn: isSample and samplePaymentType to Order
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "isSample" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "samplePaymentType" TEXT;
