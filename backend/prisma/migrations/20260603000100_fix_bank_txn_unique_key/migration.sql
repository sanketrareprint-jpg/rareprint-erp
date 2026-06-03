-- Drop old unique constraint on (accountNumber, srl)
DROP INDEX IF EXISTS "BankTransaction_accountNumber_srl_key";

-- Add new unique constraint on (accountNumber, txnDate, srl)
CREATE UNIQUE INDEX "BankTransaction_accountNumber_txnDate_srl_key" ON "BankTransaction"("accountNumber", "txnDate", "srl");
