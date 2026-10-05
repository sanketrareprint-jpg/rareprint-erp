-- Auto dialer (Android app): DialerCall log + DialerLock (one agent per number).
--
-- Additive only — two new tables and one new enum; no existing table or
-- column is altered. Written idempotently (IF NOT EXISTS / duplicate_object
-- guards) to match 20260721120000_add_complaint_tickets, so it is safe to
-- re-run on any environment's DB.

DO $$ BEGIN
  CREATE TYPE "DialerOutcome" AS ENUM ('INTERESTED', 'CALLBACK', 'NOT_ANSWERED', 'BUSY', 'WRONG_NUMBER', 'NOT_INTERESTED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "DialerCall" (
  "id"                TEXT NOT NULL,
  "agentId"           TEXT NOT NULL,
  "leadId"            TEXT,
  "importedContactId" TEXT,
  "phone"             TEXT NOT NULL,
  "startedAt"         TIMESTAMP(3) NOT NULL,
  "durationSec"       INTEGER NOT NULL DEFAULT 0,
  "answered"          BOOLEAN NOT NULL DEFAULT false,
  "outcome"           "DialerOutcome" NOT NULL,
  "note"              TEXT,
  "callbackAt"        TIMESTAMP(3),
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DialerCall_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DialerCall_agentId_startedAt_idx" ON "DialerCall"("agentId", "startedAt");
CREATE INDEX IF NOT EXISTS "DialerCall_phone_startedAt_idx" ON "DialerCall"("phone", "startedAt");
CREATE INDEX IF NOT EXISTS "DialerCall_leadId_idx" ON "DialerCall"("leadId");
CREATE INDEX IF NOT EXISTS "DialerCall_importedContactId_idx" ON "DialerCall"("importedContactId");

DO $$ BEGIN
  ALTER TABLE "DialerCall" ADD CONSTRAINT "DialerCall_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "DialerCall" ADD CONSTRAINT "DialerCall_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "DialerCall" ADD CONSTRAINT "DialerCall_importedContactId_fkey" FOREIGN KEY ("importedContactId") REFERENCES "ImportedContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "DialerLock" (
  "phone"             TEXT NOT NULL,
  "agentId"           TEXT NOT NULL,
  "leadId"            TEXT,
  "importedContactId" TEXT,
  "lockedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DialerLock_pkey" PRIMARY KEY ("phone")
);

CREATE INDEX IF NOT EXISTS "DialerLock_agentId_idx" ON "DialerLock"("agentId");

DO $$ BEGIN
  ALTER TABLE "DialerLock" ADD CONSTRAINT "DialerLock_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
