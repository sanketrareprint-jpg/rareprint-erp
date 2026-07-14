-- Create CommissionVerification table.
-- This model has existed in schema.prisma since the commission-sheet feature
-- was built, but no migration was ever generated for it, so the table never
-- existed in the database. Every call to prisma.commissionVerification.upsert()
-- (the "Verify" button on Accounts > Commission) was failing with a
-- "table does not exist" error, which the API silently swallowed as a
-- non-OK response — the UI just reverted to "Not Verified" with no visible
-- error. This migration is written idempotently (IF NOT EXISTS / duplicate_object
-- guards) to match this repo's existing repair-migration pattern, since
-- production has drifted from schema before.

CREATE TABLE IF NOT EXISTS "CommissionVerification" (
  "id"           TEXT NOT NULL,
  "agentId"      TEXT NOT NULL,
  "year"         INTEGER NOT NULL,
  "month"        INTEGER NOT NULL,
  "verifiedById" TEXT NOT NULL,
  "verifiedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes"        TEXT,

  CONSTRAINT "CommissionVerification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CommissionVerification_agentId_year_month_key"
ON "CommissionVerification"("agentId", "year", "month");

DO $$ BEGIN
  ALTER TABLE "CommissionVerification"
  ADD CONSTRAINT "CommissionVerification_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "CommissionVerification"
  ADD CONSTRAINT "CommissionVerification_verifiedById_fkey"
  FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
