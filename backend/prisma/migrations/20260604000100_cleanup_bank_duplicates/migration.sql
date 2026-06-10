-- Delete duplicate BankTransaction rows, keeping the one with the earliest createdAt
DELETE FROM "BankTransaction"
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY "accountNumber", "balance"
             ORDER BY "createdAt" ASC
           ) AS rn
    FROM "BankTransaction"
  ) t
  WHERE rn > 1
);

-- Ensure the unique constraint exists (drop first to avoid errors if already present)
ALTER TABLE "BankTransaction" DROP CONSTRAINT IF EXISTS "BankTransaction_accountNumber_balance_key";
ALTER TABLE "BankTransaction" DROP CONSTRAINT IF EXISTS "BankTransaction_accountNumber_txnDate_srl_key";
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_accountNumber_balance_key" UNIQUE ("accountNumber", "balance");
