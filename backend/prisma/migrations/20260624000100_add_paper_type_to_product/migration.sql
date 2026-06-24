-- AlterTable: add paperType column to Product
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "paperType" TEXT;
