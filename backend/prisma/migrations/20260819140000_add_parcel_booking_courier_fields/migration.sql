-- Parcel Booking: courier charge + payment type quoted at booking time.
-- See Order.parcelCourierCharge / Order.parcelPaymentType doc comment in
-- schema.prisma.

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "parcelCourierCharge" DECIMAL(12,2);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "parcelPaymentType" TEXT;
