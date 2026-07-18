-- HR module enhancement: master-data approval gate (Sanket-only), overtime
-- pay flag, and the digital HR agreement (tokenized accept link + versioned
-- company Terms & Conditions).
--
-- Written idempotently (IF NOT EXISTS / duplicate_object guards) to match
-- this repo's existing repair-migration pattern.

-- ── Employee: new columns ───────────────────────────────────────────────
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "overtimeAllowed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "masterDataApproved" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "approvedById" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "agreementToken" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "agreementTermsId" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "agreementSentAt" TIMESTAMP(3);
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "agreementAcceptedAt" TIMESTAMP(3);
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "agreementAcceptedIp" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "agreementSignatureName" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Employee_agreementToken_key" ON "Employee"("agreementToken");

-- ── CompanyTerms table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "CompanyTerms" (
  "id"          TEXT NOT NULL,
  "version"     INTEGER NOT NULL,
  "title"       TEXT NOT NULL,
  "content"     TEXT NOT NULL,
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CompanyTerms_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CompanyTerms_version_key" ON "CompanyTerms"("version");
CREATE INDEX IF NOT EXISTS "CompanyTerms_isActive_idx" ON "CompanyTerms"("isActive");

DO $$ BEGIN
  ALTER TABLE "CompanyTerms"
  ADD CONSTRAINT "CompanyTerms_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ── Employee FKs ─────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE "Employee"
  ADD CONSTRAINT "Employee_approvedById_fkey"
  FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "Employee"
  ADD CONSTRAINT "Employee_agreementTermsId_fkey"
  FOREIGN KEY ("agreementTermsId") REFERENCES "CompanyTerms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
