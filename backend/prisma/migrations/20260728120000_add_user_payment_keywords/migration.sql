-- Bank Statement > Employee Keywords.
--
-- Same convention as VendorKeyword / ExpenseKeyword (see
-- 20260527000200_bank_statement_module): a keyword uniquely maps to one
-- target — here, a User instead of a Vendor/ExpenseCategory. At bank
-- statement import time (and on rematch), a DR transaction whose
-- description contains one of a user's keywords gets auto-tagged as that
-- user's salary payment (BankTransaction.salaryForUserId + MATCHED_SALARY,
-- see 20260725100000_add_salary_bank_tagging), the same way vendor/expense
-- keywords auto-tag matchedVendorId/expenseCategoryId.
--
-- Written idempotently (IF NOT EXISTS / duplicate_object guards) to match
-- this repo's existing repair-migration pattern.

CREATE TABLE IF NOT EXISTS "UserPaymentKeyword" (
    "id"        TEXT NOT NULL,
    "keyword"   TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPaymentKeyword_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "UserPaymentKeyword" ADD CONSTRAINT "UserPaymentKeyword_keyword_key" UNIQUE ("keyword");
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "UserPaymentKeyword"
  ADD CONSTRAINT "UserPaymentKeyword_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
