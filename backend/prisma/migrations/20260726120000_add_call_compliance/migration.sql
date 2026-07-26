-- Call Compliance module: monthly phone-statement call logs (parsed from
-- carrier PDF bills) cross-checked against AiSensy contact-tag CSV exports,
-- to surface which agent tagged a contact but never actually called them.
--
-- Written idempotently (IF NOT EXISTS / duplicate_object guards) to match
-- this repo's existing repair-migration pattern (see
-- 20260721120000_add_complaint_tickets).

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "aisensyTag" TEXT;

CREATE TABLE IF NOT EXISTS "CallLogImport" (
  "id"           TEXT NOT NULL,
  "fileName"     TEXT NOT NULL,
  "ownerNumber"  TEXT,
  "agentId"      TEXT,
  "periodStart"  TIMESTAMP(3),
  "periodEnd"    TIMESTAMP(3),
  "rowsFound"    INTEGER NOT NULL DEFAULT 0,
  "rowsImported" INTEGER NOT NULL DEFAULT 0,
  "rawRows"      JSONB,
  "importedById" TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CallLogImport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CallLogImport_agentId_idx" ON "CallLogImport"("agentId");

DO $$ BEGIN
  ALTER TABLE "CallLogImport" ADD CONSTRAINT "CallLogImport_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "CallLogImport" ADD CONSTRAINT "CallLogImport_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "CallLogRecord" (
  "id"          TEXT NOT NULL,
  "importId"    TEXT NOT NULL,
  "agentId"     TEXT NOT NULL,
  "phone"       TEXT NOT NULL,
  "calledAt"    TIMESTAMP(3) NOT NULL,
  "durationSec" INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CallLogRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CallLogRecord_agentId_phone_idx" ON "CallLogRecord"("agentId", "phone");
CREATE INDEX IF NOT EXISTS "CallLogRecord_phone_idx" ON "CallLogRecord"("phone");
CREATE INDEX IF NOT EXISTS "CallLogRecord_agentId_calledAt_idx" ON "CallLogRecord"("agentId", "calledAt");

DO $$ BEGIN
  ALTER TABLE "CallLogRecord" ADD CONSTRAINT "CallLogRecord_importId_fkey" FOREIGN KEY ("importId") REFERENCES "CallLogImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "CallLogRecord" ADD CONSTRAINT "CallLogRecord_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "ContactImport" (
  "id"           TEXT NOT NULL,
  "fileName"     TEXT NOT NULL,
  "rowsFound"    INTEGER NOT NULL DEFAULT 0,
  "rowsImported" INTEGER NOT NULL DEFAULT 0,
  "rowsUpdated"  INTEGER NOT NULL DEFAULT 0,
  "importedById" TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ContactImport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ContactImport_importedById_idx" ON "ContactImport"("importedById");

DO $$ BEGIN
  ALTER TABLE "ContactImport" ADD CONSTRAINT "ContactImport_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "ImportedContact" (
  "id"           TEXT NOT NULL,
  "importId"     TEXT NOT NULL,
  "name"         TEXT,
  "phone"        TEXT NOT NULL,
  "tagRaw"       TEXT,
  "agentId"      TEXT,
  "lastActiveAt" TIMESTAMP(3),
  "createdOnAt"  TIMESTAMP(3),
  "source"       TEXT,
  "status"       TEXT,
  "optedIn"      BOOLEAN,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ImportedContact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ImportedContact_phone_key" ON "ImportedContact"("phone");
CREATE INDEX IF NOT EXISTS "ImportedContact_agentId_idx" ON "ImportedContact"("agentId");
CREATE INDEX IF NOT EXISTS "ImportedContact_tagRaw_idx" ON "ImportedContact"("tagRaw");

DO $$ BEGIN
  ALTER TABLE "ImportedContact" ADD CONSTRAINT "ImportedContact_importId_fkey" FOREIGN KEY ("importId") REFERENCES "ContactImport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ImportedContact" ADD CONSTRAINT "ImportedContact_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
