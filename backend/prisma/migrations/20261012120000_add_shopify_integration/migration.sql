-- Shopify integration: webhook log, checkout tracking, and two nullable
-- columns on Order (shopifyOrderId + shopifyData).
--
-- Additive only — two new tables, two new NULLABLE Order columns and one
-- unique index on a column that is NULL for every existing order. No existing
-- column, row or constraint is altered. Idempotent (IF NOT EXISTS), so it is
-- safe to re-run on any environment's DB. PrismaService.onModuleInit also adds
-- the two Order columns + unique index on boot, because Prisma reads them on
-- every Order query.

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "shopifyOrderId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "shopifyData" JSONB;
CREATE UNIQUE INDEX IF NOT EXISTS "Order_shopifyOrderId_key" ON "Order"("shopifyOrderId");

CREATE TABLE IF NOT EXISTS "ShopifyWebhookLog" (
  "id"          TEXT NOT NULL,
  "webhookId"   TEXT NOT NULL,
  "topic"       TEXT NOT NULL,
  "shopDomain"  TEXT,
  "resourceId"  TEXT,
  "payload"     JSONB NOT NULL,
  "status"      TEXT NOT NULL DEFAULT 'RECEIVED',
  "attempts"    INTEGER NOT NULL DEFAULT 0,
  "result"      TEXT,
  "error"       TEXT,
  "receivedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),

  CONSTRAINT "ShopifyWebhookLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ShopifyWebhookLog_webhookId_key" ON "ShopifyWebhookLog"("webhookId");
CREATE INDEX IF NOT EXISTS "ShopifyWebhookLog_status_receivedAt_idx" ON "ShopifyWebhookLog"("status", "receivedAt");
CREATE INDEX IF NOT EXISTS "ShopifyWebhookLog_resourceId_idx" ON "ShopifyWebhookLog"("resourceId");

CREATE TABLE IF NOT EXISTS "ShopifyCheckout" (
  "id"                TEXT NOT NULL,
  "token"             TEXT NOT NULL,
  "shopifyCheckoutId" TEXT,
  "status"            TEXT NOT NULL DEFAULT 'OPEN',
  "customerName"      TEXT,
  "phone"             TEXT,
  "email"             TEXT,
  "cartItems"         JSONB NOT NULL DEFAULT '[]',
  "cartValue"         DECIMAL(14,2) NOT NULL DEFAULT 0,
  "currency"          TEXT,
  "recoveryUrl"       TEXT,
  "completedAt"       TIMESTAMP(3),
  "lastActivityAt"    TIMESTAMP(3) NOT NULL,
  "abandonedAt"       TIMESTAMP(3),
  "convertedAt"       TIMESTAMP(3),
  "orderId"           TEXT,
  "leadId"            TEXT,
  "taskId"            TEXT,
  "raw"               JSONB,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ShopifyCheckout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ShopifyCheckout_token_key" ON "ShopifyCheckout"("token");
CREATE INDEX IF NOT EXISTS "ShopifyCheckout_status_lastActivityAt_idx" ON "ShopifyCheckout"("status", "lastActivityAt");
CREATE INDEX IF NOT EXISTS "ShopifyCheckout_shopifyCheckoutId_idx" ON "ShopifyCheckout"("shopifyCheckoutId");
CREATE INDEX IF NOT EXISTS "ShopifyCheckout_phone_idx" ON "ShopifyCheckout"("phone");
CREATE INDEX IF NOT EXISTS "ShopifyCheckout_email_idx" ON "ShopifyCheckout"("email");
