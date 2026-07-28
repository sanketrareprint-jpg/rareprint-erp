-- Adds columns needed to pull the real AWB + live tracking status back from
-- Bigship on demand (the "Sync" action in Dispatch > History), instead of
-- only ever storing whatever we captured at booking time.
--
-- bigshipOrderId  — Bigship's CustomGlobalOrderId/MasterCustomOrderId for this
--                    shipment, so we know which order to query later.
-- bigshipStatus   — last raw status string returned by Bigship
--                    (order-shipment-details), for display/debugging.
-- bigshipSyncedAt — when we last successfully synced this shipment.

ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "bigshipOrderId" TEXT;
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "bigshipStatus" TEXT;
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "bigshipSyncedAt" TIMESTAMP(3);
