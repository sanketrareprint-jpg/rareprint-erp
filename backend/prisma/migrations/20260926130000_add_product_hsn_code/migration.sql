-- HSN code per product, copied onto InvoiceItem.hsnSac when an invoice is raised.
-- Additive, nullable, so every existing product is unchanged. Idempotent.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "hsnCode" TEXT;
