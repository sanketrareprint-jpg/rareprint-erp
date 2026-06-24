-- Repair migration: safely add paperType to Product if it was missed
-- This is always safe to re-run (IF NOT EXISTS guard).
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "paperType" TEXT;
