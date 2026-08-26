-- Policies/SOPs module: super-admin-authored office policies, department
-- rules, and SOPs, taggable by module so they surface on the relevant
-- module pages. Additive-only, mirrors the CommissionOverride /
-- UserPaymentKeyword table-creation pattern used elsewhere in this repo.

CREATE TABLE IF NOT EXISTS "PolicyDocument" (
    "id"          TEXT NOT NULL,
    "title"       TEXT NOT NULL,
    "content"     TEXT NOT NULL,
    "modules"     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "isActive"    BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PolicyDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PolicyDocument_isActive_idx" ON "PolicyDocument"("isActive");

DO $$ BEGIN
    ALTER TABLE "PolicyDocument" ADD CONSTRAINT "PolicyDocument_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
