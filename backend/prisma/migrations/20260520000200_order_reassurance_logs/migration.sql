CREATE TABLE IF NOT EXISTS "OrderReassuranceLog" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "orderNo" TEXT NOT NULL,
  "campaignName" TEXT NOT NULL,
  "success" BOOLEAN NOT NULL DEFAULT false,
  "error" TEXT,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OrderReassuranceLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OrderReassuranceLog_orderId_sentAt_idx" ON "OrderReassuranceLog"("orderId", "sentAt");
CREATE INDEX IF NOT EXISTS "OrderReassuranceLog_sentAt_idx" ON "OrderReassuranceLog"("sentAt");

ALTER TABLE "OrderReassuranceLog"
ADD CONSTRAINT "OrderReassuranceLog_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
