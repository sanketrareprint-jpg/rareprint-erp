-- Courier charge billed on the invoice (included in Invoice.totalAmount).
-- Additive, defaults to 0 so every existing invoice is unchanged. Idempotent.
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "courierCharge" DECIMAL(14,2) NOT NULL DEFAULT 0;
