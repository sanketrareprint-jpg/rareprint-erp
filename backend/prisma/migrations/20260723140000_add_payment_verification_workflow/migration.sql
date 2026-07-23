-- Accounts > Payment Verification workflow.
--
-- Adds a two-step sign-off to matched/needs-review DEBIT bank entries:
--   1. Accountant/admin writes an optional note and clicks "Checked"
--      (checkedById/checkedAt) — one-way, cannot be undone by them.
--   2. Only the super-admin (Sanket) can then click "Rechecked"
--      (recheckedById/recheckedAt), which moves the entry from the
--      Payment Verification queue into Payment History.
--
-- Written idempotently (IF NOT EXISTS / duplicate_object guards) to match
-- this repo's existing repair-migration pattern (see
-- 20260717130100_add_commission_paid_tracking).

ALTER TABLE "BankTransaction"
ADD COLUMN IF NOT EXISTS "accountantNote" TEXT,
ADD COLUMN IF NOT EXISTS "checkedById" TEXT,
ADD COLUMN IF NOT EXISTS "checkedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "recheckedById" TEXT,
ADD COLUMN IF NOT EXISTS "recheckedAt" TIMESTAMP(3);

DO $$ BEGIN
  ALTER TABLE "BankTransaction"
  ADD CONSTRAINT "BankTransaction_checkedById_fkey"
  FOREIGN KEY ("checkedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "BankTransaction"
  ADD CONSTRAINT "BankTransaction_recheckedById_fkey"
  FOREIGN KEY ("recheckedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "BankTransaction_recheckedAt_idx" ON "BankTransaction"("recheckedAt");
