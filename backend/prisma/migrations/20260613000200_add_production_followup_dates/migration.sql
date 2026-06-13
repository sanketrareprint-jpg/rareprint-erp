ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "processingFollowUpDate" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "OrderItem_processingFollowUpDate_idx" ON "OrderItem"("processingFollowUpDate");
