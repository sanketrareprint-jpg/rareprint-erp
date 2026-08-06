-- Sales incentive plans (Plan A / B / C, admin-managed) + Employee link and
-- flat monthly allowances. Written idempotently to match this repo's
-- existing repair-migration pattern (IF NOT EXISTS / duplicate_object guards).

CREATE TABLE IF NOT EXISTS "SalesIncentivePlan" (
    "id"            TEXT NOT NULL,
    "label"         TEXT NOT NULL,
    "monthlyTarget" DECIMAL(12,2) NOT NULL,
    "incentivePct"  DECIMAL(5,2) NOT NULL,
    "isActive"      BOOLEAN NOT NULL DEFAULT true,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesIncentivePlan_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "SalesIncentivePlan" ADD CONSTRAINT "SalesIncentivePlan_label_key" UNIQUE ("label");
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "incentivePlanId" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "petrolAllowance" DECIMAL(10,2);
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "simAllowance" DECIMAL(10,2);

DO $$ BEGIN
  ALTER TABLE "Employee"
  ADD CONSTRAINT "Employee_incentivePlanId_fkey"
  FOREIGN KEY ("incentivePlanId") REFERENCES "SalesIncentivePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
