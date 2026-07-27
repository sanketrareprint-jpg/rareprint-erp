-- "Not Contacted" tab becomes a normal lead-management surface: contacts
-- flagged not-contacted (call-compliance cross-check) now get a status and
-- follow-ups, same as any Lead. If a contact's phone already matches an
-- existing Lead row, it's linked via leadId instead of tracking status
-- separately (see backend/src/call-compliance/call-compliance.service.ts).
--
-- Written idempotently (IF NOT EXISTS / duplicate_object guards) to match
-- this repo's existing repair-migration pattern (see
-- 20260721120000_add_complaint_tickets, 20260726120000_add_call_compliance).

ALTER TABLE "ImportedContact" ADD COLUMN IF NOT EXISTS "pipelineStatus" "LeadStatus" NOT NULL DEFAULT 'NEW';
ALTER TABLE "ImportedContact" ADD COLUMN IF NOT EXISTS "leadId" TEXT;

CREATE INDEX IF NOT EXISTS "ImportedContact_leadId_idx" ON "ImportedContact"("leadId");

DO $$ BEGIN
  ALTER TABLE "ImportedContact" ADD CONSTRAINT "ImportedContact_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "ImportedContactFollowUp" (
  "id"          TEXT NOT NULL,
  "contactId"   TEXT NOT NULL,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "status"      "FollowUpStatus" NOT NULL DEFAULT 'PENDING',
  "note"        TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ImportedContactFollowUp_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ImportedContactFollowUp_contactId_idx" ON "ImportedContactFollowUp"("contactId");

DO $$ BEGIN
  ALTER TABLE "ImportedContactFollowUp" ADD CONSTRAINT "ImportedContactFollowUp_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ImportedContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
