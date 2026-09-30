-- Salary tag for an HR Employee with no login (Expense Tracker > Salary,
-- Billing > Sundry Creditors). Additive and idempotent — safe to re-run on
-- any environment's DB. Existing salaryForUserId tags are untouched.

ALTER TABLE "BankTransaction" ADD COLUMN IF NOT EXISTS "salaryForEmployeeId" TEXT;

CREATE INDEX IF NOT EXISTS "BankTransaction_salaryForEmployeeId_salaryYear_salaryMonth_idx"
  ON "BankTransaction"("salaryForEmployeeId", "salaryYear", "salaryMonth");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BankTransaction_salaryForEmployeeId_fkey') THEN
    ALTER TABLE "BankTransaction"
      ADD CONSTRAINT "BankTransaction_salaryForEmployeeId_fkey"
      FOREIGN KEY ("salaryForEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
