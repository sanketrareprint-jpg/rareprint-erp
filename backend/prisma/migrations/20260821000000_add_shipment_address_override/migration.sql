-- Adds an optional per-shipment "ship to a different address" override, for
-- when separate items on the same order need to go to different delivery
-- addresses (e.g. different branches/offices of the same customer).
--
-- Deliberately NOT added to Customer or OrderItem: the dispatcher types this
-- fresh at Book Shipment time for the specific item(s) in that booking, it
-- is not saved back anywhere and is not reused automatically on future
-- orders. See backend/src/dispatch/dispatch.service.ts bookItems().
--
-- All nullable — existing shipments (and every normal booking that doesn't
-- use this) are completely unaffected.

ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "overrideReceiverName" TEXT;
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "overrideReceiverPhone" TEXT;
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "overrideShippingAddress" TEXT;
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "overrideShippingCity" TEXT;
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "overrideShippingState" TEXT;
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "overrideShippingPincode" TEXT;
