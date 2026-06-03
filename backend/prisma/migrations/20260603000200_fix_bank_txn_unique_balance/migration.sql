-- Remove duplicate rows — keep the earliest import (lowest createdAt) per (accountNumber, balance)
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

-- Drop the previous unique constraint on (accountNumber, txnDate, srl)
ALTER TABLE "BankTransaction" DROP CONSTRAINT IF EXISTS "BankTransaction_accountNumber_txnDate_srl_key";

-- Add new unique constraint on (accountNumber, balance)
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_accountNumber_balance_key" UNIQUE ("accountNumber", "balance");
