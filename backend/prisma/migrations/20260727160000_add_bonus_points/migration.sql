-- Bonus Points module: admin-defined activity catalog + staff claim/approval
-- workflow, crediting into the existing RewardWallet/RewardTransaction ledger
-- (see schema.prisma comment above BonusActivity for the full design note).
--
-- Written idempotently (IF NOT EXISTS / duplicate_object guards) to match
-- this repo's existing repair-migration pattern (see
-- 20260721120000_add_complaint_tickets).

DO $$ BEGIN
  CREATE TYPE "BonusClaimType" AS ENUM ('MANUAL', 'AUTOMATIC');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "BonusClaimStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "BonusActivity" (
  "id"          TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "points"      INTEGER NOT NULL,
  "claimType"   "BonusClaimType" NOT NULL DEFAULT 'MANUAL',
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BonusActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BonusActivity_isActive_idx" ON "BonusActivity"("isActive");

CREATE TABLE IF NOT EXISTS "BonusClaim" (
  "id"             TEXT NOT NULL,
  "activityId"     TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "points"         INTEGER NOT NULL,
  "details"        TEXT NOT NULL,
  "attachmentUrl"  TEXT,
  "attachmentName" TEXT,
  "attachmentType" TEXT,
  "status"         "BonusClaimStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedById"   TEXT,
  "reviewedAt"     TIMESTAMP(3),
  "reviewNote"     TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BonusClaim_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BonusClaim_userId_status_idx" ON "BonusClaim"("userId", "status");
CREATE INDEX IF NOT EXISTS "BonusClaim_status_idx" ON "BonusClaim"("status");
CREATE INDEX IF NOT EXISTS "BonusClaim_activityId_idx" ON "BonusClaim"("activityId");

DO $$ BEGIN
  ALTER TABLE "BonusClaim"
  ADD CONSTRAINT "BonusClaim_activityId_fkey"
  FOREIGN KEY ("activityId") REFERENCES "BonusActivity"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Traces a RewardTransaction back to the BonusClaim that produced it (soft
-- reference only, no FK — RewardTransaction already links loosely via
-- notificationId/orderId the same way).
ALTER TABLE "RewardTransaction"
ADD COLUMN IF NOT EXISTS "claimId" TEXT;
