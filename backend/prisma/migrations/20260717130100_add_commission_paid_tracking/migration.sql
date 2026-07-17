-- "Mark commission as Paid" tracking.
--
-- Lets Accounts > Commission link a specific bank statement transaction to a
-- verified agent/month commission sheet, the same way Payment already links
-- to BankTransaction (matchedPaymentId): the FK lives on BankTransaction,
-- CommissionVerification just gets the reverse relation. A new
-- MATCHED_COMMISSION reconcile status marks that transaction was consumed
-- for a commission payout (mutually exclusive with MATCHED_PAYMENT /
-- MATCHED_VENDOR / MATCHED_EXPENSE, same convention as the existing ones).
--
-- Written idempotently (IF NOT EXISTS / duplicate_object guards) to match
-- this repo's existing repair-migration pattern (see
-- 20260715000100_add_commission_override).

ALTER TYPE "BankReconcileStatus" ADD VALUE IF NOT EXISTS 'MATCHED_COMMISSION';

ALTER TABLE "BankTransaction"
ADD COLUMN IF NOT EXISTS "matchedCommissionVerificationId" TEXT;

DO $$ BEGIN
  ALTER TABLE "BankTransaction"
  ADD CONSTRAINT "BankTransaction_matchedCommissionVerificationId_fkey"
  FOREIGN KEY ("matchedCommissionVerificationId") REFERENCES "CommissionVerification"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
