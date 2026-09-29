-- Order upsell request + approval workflow.
-- Additive only — safe on the live production DB, matches the
-- cancellationRequestedAt / pendingCancelItemIds pattern.

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "upsellRequestedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "upsellRequestedByName" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "pendingUpsell" JSONB;
