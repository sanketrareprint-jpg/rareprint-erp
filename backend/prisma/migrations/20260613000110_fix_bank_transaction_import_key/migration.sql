-- Bank transaction balances can repeat after debit/credit movements.
-- Use a full transaction fingerprint for duplicate detection instead.

ALTER TABLE "BankTransaction" ADD COLUMN IF NOT EXISTS "importKey" TEXT;

UPDATE "BankTransaction"
SET "importKey" = md5(concat_ws('|',
  COALESCE("txnDateTime"::text, ''),
  "txnDate"::text,
  "valueDate"::text,
  upper(regexp_replace(trim("description"), '\s+', ' ', 'g')),
  upper(regexp_replace(trim(COALESCE("chequeNo", '')), '\s+', ' ', 'g')),
  "crDr"::text,
  to_char("amount", 'FM999999999999990.00'),
  to_char("balance", 'FM999999999999990.00')
))
WHERE "importKey" IS NULL OR "importKey" = '';

DELETE FROM "BankTransaction"
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY "accountNumber", "importKey"
             ORDER BY "createdAt" ASC, id ASC
           ) AS rn
    FROM "BankTransaction"
  ) t
  WHERE rn > 1
);

ALTER TABLE "BankTransaction" DROP CONSTRAINT IF EXISTS "BankTransaction_accountNumber_balance_key";
ALTER TABLE "BankTransaction" DROP CONSTRAINT IF EXISTS "BankTransaction_accountNumber_txnDate_srl_key";
DROP INDEX IF EXISTS "BankTransaction_accountNumber_txnDate_srl_key";
DROP INDEX IF EXISTS "BankTransaction_accountNumber_importKey_key";

ALTER TABLE "BankTransaction" ALTER COLUMN "importKey" SET NOT NULL;
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_accountNumber_importKey_key" UNIQUE ("accountNumber", "importKey");
