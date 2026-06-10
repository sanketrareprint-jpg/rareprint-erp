-- Restore row-level uniqueness for bank statement imports.
-- Balance values can repeat, so using them as a unique key skips valid ledger rows.
ALTER TABLE "BankTransaction" DROP CONSTRAINT IF EXISTS "BankTransaction_accountNumber_balance_key";

CREATE UNIQUE INDEX IF NOT EXISTS "BankTransaction_accountNumber_txnDate_srl_key"
  ON "BankTransaction"("accountNumber", "txnDate", "srl");
