-- Repair migration: re-apply billing fields from 20260612000400_add_billing_fields_to_paper_po
-- in case that migration was skipped/partially applied on production (same pattern as
-- 20260619000300_repair_missing_columns and 20260624000200_repair_paper_type_column).
-- Uses IF NOT EXISTS throughout so this is always safe to re-run.

ALTER TABLE "PaperPurchaseOrder" ADD COLUMN IF NOT EXISTS "transportCharges" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "PaperPurchaseOrder" ADD COLUMN IF NOT EXISTS "totalBillAmount" DOUBLE PRECISION;
ALTER TABLE "PaperPurchaseItem" ADD COLUMN IF NOT EXISTS "ratePerUnit" DOUBLE PRECISION;
