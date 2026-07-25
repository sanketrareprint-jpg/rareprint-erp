-- Accounts > Expense Tracker: "tag this withdrawal as a salary payment".
--
-- Salary has no "paid" record anywhere else — it's calculated live off
-- Employee attendance (see HrService.salaryForMonth), never persisted.
-- This lets a DR bank transaction be tagged as the salary payout for a
-- specific User (regular staff, or Sanket himself) for a given
-- year/month, the same way BankTransaction already links to a Vendor,
-- ExpenseCategory, or CommissionVerification. A new MATCHED_SALARY
-- reconcile status marks that transaction as consumed for a salary
-- payout (mutually exclusive with the other MATCHED_* statuses, same
-- convention as the existing ones).
--
-- Written idempotently (IF NOT EXISTS / duplicate_object guards) to match
-- this repo's existing repair-migration pattern (see
-- 20260717130100_add_commission_paid_tracking).

ALTER TYPE "BankReconcileStatus" ADD VALUE IF NOT EXISTS 'MATCHED_SALARY';

ALTER TABLE "BankTransaction"
ADD COLUMN IF NOT EXISTS "salaryForUserId" TEXT,
ADD COLUMN IF NOT EXISTS "salaryYear" INTEGER,
ADD COLUMN IF NOT EXISTS "salaryMonth" INTEGER;

DO $$ BEGIN
  ALTER TABLE "BankTransaction"
  ADD CONSTRAINT "BankTransaction_salaryForUserId_fkey"
  FOREIGN KEY ("salaryForUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "BankTransaction_salaryForUserId_salaryYear_salaryMonth_idx"
ON "BankTransaction"("salaryForUserId", "salaryYear", "salaryMonth");
