-- Courier Charges (Dispatch > Courier Charges) — separates courier/shipping
-- money from the order's own product balance.
--
-- Root problem this fixes: Bigship's COD remittance sometimes bundles
-- freight into "collected amount", which used to get posted straight onto
-- the order as a payment, inflating the customer's paid amount and later
-- getting silently "adjusted" against their next order.
--
-- ShippingChargeRecord — Bigship's monthly "Shipping Charges" report, one
-- row per AWB, giving the real actual courier cost (Total Charges already
-- includes freight + any overweight/RTO surcharge). Upserted by AWB on every
-- upload; joined to Shipment.awbNumber at read time, no review workflow
-- needed since the AWB was set by the ERP itself at dispatch time.
--
-- Shipment.courierChargeCollected — what the agent actually collected from
-- the customer for shipping, entered by hand. Deliberately lives only here,
-- never touching Order.grandTotal/payments.

CREATE TABLE IF NOT EXISTS "ShippingChargeRecord" (
  "id"               TEXT NOT NULL,
  "awbNumber"        TEXT NOT NULL,
  "bigshipOrderId"   TEXT,
  "courierName"      TEXT,
  "orderStatus"      TEXT,
  "courierCreatedAt" TIMESTAMP(3),
  "manifestedWeight" DECIMAL(10,2),
  "appliedWeight"    DECIMAL(10,2),
  "weightParameter"  TEXT,
  "freightCharges"   DECIMAL(12,2),
  "totalCharges"     DECIMAL(12,2) NOT NULL,
  "orderValue"       DECIMAL(12,2),
  "productsRaw"      TEXT,
  "sourceFileName"   TEXT,
  "importedById"     TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ShippingChargeRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ShippingChargeRecord_awbNumber_key" ON "ShippingChargeRecord"("awbNumber");
CREATE INDEX IF NOT EXISTS "ShippingChargeRecord_awbNumber_idx" ON "ShippingChargeRecord"("awbNumber");

DO $$ BEGIN
  ALTER TABLE "ShippingChargeRecord" ADD CONSTRAINT "ShippingChargeRecord_importedById_fkey"
  FOREIGN KEY ("importedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "courierChargeCollected" DECIMAL(12,2);
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "courierChargeUpdatedAt" TIMESTAMP(3);
