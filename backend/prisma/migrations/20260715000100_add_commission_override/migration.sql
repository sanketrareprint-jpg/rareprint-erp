-- Create CommissionOverride table.
--
-- Backs the "edit commission" pencil icon on Accounts > Commission. That UI
-- has existed for a while but only ever wrote to local React state
-- (commOverrides), which is wiped on every sheet reload (verify/unverify,
-- switching months, page refresh) — so corrections always appeared to
-- silently revert to the auto-calculated amount. This table lets a
-- correction persist per order line, keyed by orderItemId.
--
-- Written idempotently (IF NOT EXISTS / duplicate_object guards) to match
-- this repo's existing repair-migration pattern, since production has
-- drifted from schema before (see 20260714002000_add_commission_verification).

CREATE TABLE IF NOT EXISTS "CommissionOverride" (
  "id"          TEXT NOT NULL,
  "orderItemId" TEXT NOT NULL,
  "agentId"     TEXT NOT NULL,
  "amount"      DECIMAL(14,2) NOT NULL,
  "setById"     TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CommissionOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CommissionOverride_orderItemId_key"
ON "CommissionOverride"("orderItemId");

DO $$ BEGIN
  ALTER TABLE "CommissionOverride"
  ADD CONSTRAINT "CommissionOverride_orderItemId_fkey"
  FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "CommissionOverride"
  ADD CONSTRAINT "CommissionOverride_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "CommissionOverride"
  ADD CONSTRAINT "CommissionOverride_setById_fkey"
  FOREIGN KEY ("setById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
