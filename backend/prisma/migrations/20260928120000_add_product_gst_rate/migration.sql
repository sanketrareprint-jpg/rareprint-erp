-- GST % per product. Order rates include GST; the invoice splits this rate out.
-- Additive with default 0, so every existing product is unchanged (0% GST). Idempotent.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "gstRatePct" DECIMAL(5,2) NOT NULL DEFAULT 0;
