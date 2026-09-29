-- Feedback module. Additive only: one new table, no existing table touched.
-- Idempotent (IF NOT EXISTS) so it is safe alongside scripts/ensure-customer-feedback-table.js.
CREATE TABLE IF NOT EXISTS "CustomerFeedback" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "overallRating" INTEGER NOT NULL,
  "productRatings" JSONB NOT NULL,
  "serviceRating" INTEGER NOT NULL,
  "deliveryRating" INTEGER NOT NULL,
  "improvement" TEXT,
  "wouldRecommend" TEXT NOT NULL,
  "referralName" TEXT,
  "referralPhone" TEXT,
  "needsMore" BOOLEAN NOT NULL,
  "requirementNote" TEXT,
  "willRateOnGoogle" BOOLEAN NOT NULL,
  "customerWhatsappSent" BOOLEAN NOT NULL DEFAULT false,
  "agentWhatsappSent" BOOLEAN NOT NULL DEFAULT false,
  "submittedById" TEXT,
  "submittedByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerFeedback_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerFeedback_orderId_key" ON "CustomerFeedback"("orderId");
CREATE INDEX IF NOT EXISTS "CustomerFeedback_createdAt_idx" ON "CustomerFeedback"("createdAt");
DO $$ BEGIN
  ALTER TABLE "CustomerFeedback" ADD CONSTRAINT "CustomerFeedback_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
