-- Add billing fields to PaperPurchaseOrder for bill-wise tallying
ALTER TABLE "PaperPurchaseOrder" ADD COLUMN "transportCharges" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "PaperPurchaseOrder" ADD COLUMN "totalBillAmount" DOUBLE PRECISION;

-- Add rate per unit to PaperPurchaseItem for per-row amount calculation
ALTER TABLE "PaperPurchaseItem" ADD COLUMN "ratePerUnit" DOUBLE PRECISION;
