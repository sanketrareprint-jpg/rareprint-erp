-- Shopify inbox: Shopify orders are reviewed before becoming ERP orders.
--
-- Additive only — one new table and seven new NULLABLE columns on
-- ShopifyCheckout (itself added 2026-10-12). No existing column, row or
-- constraint is altered. Idempotent (IF NOT EXISTS), safe to re-run.

CREATE TABLE IF NOT EXISTS "ShopifyInboxOrder" (
  "id"               TEXT NOT NULL,
  "shopifyOrderId"   TEXT NOT NULL,
  "shopDomain"       TEXT,
  "shopifyName"      TEXT NOT NULL,
  "status"           TEXT NOT NULL DEFAULT 'NEW',
  "isTest"           BOOLEAN NOT NULL DEFAULT false,
  "orderDate"        TIMESTAMP(3) NOT NULL,
  "customerName"     TEXT,
  "phone"            TEXT,
  "email"            TEXT,
  "city"             TEXT,
  "state"            TEXT,
  "itemsSummary"     TEXT,
  "totalPrice"       DECIMAL(14,2) NOT NULL DEFAULT 0,
  "gateway"          TEXT,
  "financialStatus"  TEXT,
  "cancelledAt"      TIMESTAMP(3),
  "shopifyUpdatedAt" TEXT,
  "payload"          JSONB NOT NULL,
  "orderId"          TEXT,
  "approvedById"     TEXT,
  "approvedByName"   TEXT,
  "approvedAt"       TIMESTAMP(3),
  "rejectedById"     TEXT,
  "rejectedByName"   TEXT,
  "rejectedAt"       TIMESTAMP(3),
  "rejectReason"     TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ShopifyInboxOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ShopifyInboxOrder_shopifyOrderId_key" ON "ShopifyInboxOrder"("shopifyOrderId");
CREATE UNIQUE INDEX IF NOT EXISTS "ShopifyInboxOrder_orderId_key" ON "ShopifyInboxOrder"("orderId");
CREATE INDEX IF NOT EXISTS "ShopifyInboxOrder_status_orderDate_idx" ON "ShopifyInboxOrder"("status", "orderDate");
CREATE INDEX IF NOT EXISTS "ShopifyInboxOrder_phone_idx" ON "ShopifyInboxOrder"("phone");

ALTER TABLE "ShopifyCheckout" ADD COLUMN IF NOT EXISTS "inboxOrderId" TEXT;
ALTER TABLE "ShopifyCheckout" ADD COLUMN IF NOT EXISTS "contactedAt" TIMESTAMP(3);
ALTER TABLE "ShopifyCheckout" ADD COLUMN IF NOT EXISTS "contactedById" TEXT;
ALTER TABLE "ShopifyCheckout" ADD COLUMN IF NOT EXISTS "contactedByName" TEXT;
ALTER TABLE "ShopifyCheckout" ADD COLUMN IF NOT EXISTS "dismissedAt" TIMESTAMP(3);
ALTER TABLE "ShopifyCheckout" ADD COLUMN IF NOT EXISTS "dismissedById" TEXT;
ALTER TABLE "ShopifyCheckout" ADD COLUMN IF NOT EXISTS "dismissedByName" TEXT;
