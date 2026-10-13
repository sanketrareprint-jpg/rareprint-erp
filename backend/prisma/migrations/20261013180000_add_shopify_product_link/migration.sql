-- Shopify product → ERP product links (remembered matches for the inbox).
--
-- Additive only — one new table. No existing column, row or constraint is
-- altered. Idempotent (IF NOT EXISTS), safe to re-run on any environment's DB.
-- PrismaService.onModuleInit also creates it on boot, because the Shopify
-- inbox reads it on every order review.

CREATE TABLE IF NOT EXISTS "ShopifyProductLink" (
  "id"               TEXT NOT NULL,
  "shopifyProductId" TEXT NOT NULL,
  "shopifyTitle"     TEXT,
  "productId"        TEXT NOT NULL,
  "linkedById"       TEXT,
  "linkedByName"     TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ShopifyProductLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ShopifyProductLink_shopifyProductId_key" ON "ShopifyProductLink"("shopifyProductId");
CREATE INDEX IF NOT EXISTS "ShopifyProductLink_productId_idx" ON "ShopifyProductLink"("productId");
