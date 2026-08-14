-- Dispatch > Courier Charges: "Actual" and "Taken from Customer" were blank
-- because neither value was ever persisted anywhere queryable.
--
-- Shipment.courierChargeActual — the rate quote picked in "Fetch Rates" at
-- Dispatch Queue booking time, auto-captured going forward so Actual has a
-- number immediately (listCourierCharges still prefers the more accurate
-- ShippingChargeRecord.totalCharges from the monthly report when present).
--
-- Order.courierChargeQuoted — the courier charge the seller typed into
-- "Book Shipment" (Ready for Dispatch), captured separately from
-- Order.shippingCharge because that field gets overwritten by the
-- Bigship/Shiprocket quote once Dispatch books the shipment.

ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "courierChargeActual" DECIMAL(12,2);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "courierChargeQuoted" DECIMAL(12,2);
