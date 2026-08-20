-- Adds the Fship equivalents of the Bigship sync columns added in
-- 20260728180000_add_shipment_bigship_sync, for the Fship courier
-- integration (see backend/src/fship/fship.service.ts).
--
-- fshipOrderId  — Fship's apiorderid for this shipment, so we know which
--                  order to query later (waybill/AWB is also stored on the
--                  existing generic awbNumber column).
-- fshipStatus   — last raw status string returned by Fship's Shipment
--                  Current Status endpoint, for display/debugging.
-- fshipSyncedAt — when we last successfully synced this shipment.

ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "fshipOrderId" TEXT;
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "fshipStatus" TEXT;
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "fshipSyncedAt" TIMESTAMP(3);
