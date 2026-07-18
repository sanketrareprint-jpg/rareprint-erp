-- Customer loyalty reward points (see loyalty-points-spec.md).
--
-- Wallet keyed by normalized phone number, not customerId — Customer has no
-- unique constraint on phone, and staff sometimes create a new customer
-- record for a repeat buyer. CustomerLoyaltyWallet/Transaction are distinct
-- from the existing RewardWallet/RewardTransaction models, which are
-- staff-facing coin rewards keyed on User.id (a different concept, left
-- untouched).
--
-- Written idempotently (IF NOT EXISTS / duplicate_object guards) to match
-- this repo's existing repair-migration pattern (see
-- 20260717130100_add_commission_paid_tracking).

DO $$ BEGIN
  CREATE TYPE "LoyaltyTxnType" AS ENUM ('EARN', 'REDEEM', 'REVERSE', 'ADJUST');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "loyaltyPointsEarned" INTEGER,
  ADD COLUMN IF NOT EXISTS "loyaltyPointsRedeemed" INTEGER,
  ADD COLUMN IF NOT EXISTS "loyaltyDiscountAmount" DECIMAL(12,2);

CREATE TABLE IF NOT EXISTS "CustomerLoyaltyWallet" (
  "id"         TEXT NOT NULL,
  "phone"      TEXT NOT NULL,
  "customerId" TEXT,
  "points"     INTEGER NOT NULL DEFAULT 0,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CustomerLoyaltyWallet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerLoyaltyWallet_phone_key" ON "CustomerLoyaltyWallet"("phone");

CREATE INDEX IF NOT EXISTS "CustomerLoyaltyWallet_customerId_idx" ON "CustomerLoyaltyWallet"("customerId");

CREATE TABLE IF NOT EXISTS "CustomerLoyaltyTransaction" (
  "id"          TEXT NOT NULL,
  "walletId"    TEXT NOT NULL,
  "orderId"     TEXT,
  "type"        "LoyaltyTxnType" NOT NULL,
  "points"      INTEGER NOT NULL,
  "baseAmount"  DECIMAL(14,2),
  "grossProfit" DECIMAL(14,2),
  "discountPct" DECIMAL(5,2),
  "reason"      TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CustomerLoyaltyTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerLoyaltyTransaction_orderId_type_key" ON "CustomerLoyaltyTransaction"("orderId", "type");

CREATE INDEX IF NOT EXISTS "CustomerLoyaltyTransaction_walletId_idx" ON "CustomerLoyaltyTransaction"("walletId");

DO $$ BEGIN
  ALTER TABLE "CustomerLoyaltyTransaction"
  ADD CONSTRAINT "CustomerLoyaltyTransaction_walletId_fkey"
  FOREIGN KEY ("walletId") REFERENCES "CustomerLoyaltyWallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
