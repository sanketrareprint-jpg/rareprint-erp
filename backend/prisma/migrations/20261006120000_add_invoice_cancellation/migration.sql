-- Cancelled-invoice details (Billing > Cancelled Invoice PDF). Additive,
-- nullable and idempotent — existing invoices keep NULL; safe to re-run on
-- any environment's DB.
--   cancelledAt        when the whole order (and so its invoice) was cancelled
--   cancellationReason remark printed on the Cancelled Invoice PDF
--   cancelledSnapshot  the invoice's items + totals just before cancellation
--                      zeroed them, so the PDF can still show what was billed

ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "cancellationReason" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "cancelledSnapshot" JSONB;
