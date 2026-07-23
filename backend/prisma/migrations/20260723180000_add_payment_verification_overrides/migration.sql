-- Accounts > Payment Verification: free-text vendor/expense override + expense month.
--
-- The verification queue originally reused the linked Vendor/ExpenseCategory
-- select from Bank Statement matching, but that renders hundreds of <option>
-- elements per row across ~1500 rows and froze the page. Replacing it with a
-- plain text override (vendorExpenseOverride) that accountants can type
-- directly into the queue, plus an optional expensePeriod so an expense paid
-- in one month (e.g. rent paid in July) can be tagged as belonging to a
-- different accounting month (e.g. June).
--
-- Written idempotently (IF NOT EXISTS) to match this repo's existing
-- repair-migration pattern.

ALTER TABLE "BankTransaction"
ADD COLUMN IF NOT EXISTS "vendorExpenseOverride" TEXT,
ADD COLUMN IF NOT EXISTS "expensePeriod" TIMESTAMP(3);
