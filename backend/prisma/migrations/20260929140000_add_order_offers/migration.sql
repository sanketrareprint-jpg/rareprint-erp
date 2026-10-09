-- Order-level offers (Offers tab): discount / free item on quantity / combo.
-- Additive only — safe on the live production DB and every SaaS customer DB.

ALTER TABLE "OfferCode" ADD COLUMN IF NOT EXISTS "discountMode" TEXT;
ALTER TABLE "OfferCode" ADD COLUMN IF NOT EXISTS "discountValue" DECIMAL(12,2);
ALTER TABLE "OfferCode" ADD COLUMN IF NOT EXISTS "buyProductId" TEXT;
ALTER TABLE "OfferCode" ADD COLUMN IF NOT EXISTS "buyQuantity" INTEGER;
ALTER TABLE "OfferCode" ADD COLUMN IF NOT EXISTS "freeProductId" TEXT;
ALTER TABLE "OfferCode" ADD COLUMN IF NOT EXISTS "freeQuantity" INTEGER;
ALTER TABLE "OfferCode" ADD COLUMN IF NOT EXISTS "comboItems" JSONB;

ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "offerLocked" BOOLEAN NOT NULL DEFAULT false;
