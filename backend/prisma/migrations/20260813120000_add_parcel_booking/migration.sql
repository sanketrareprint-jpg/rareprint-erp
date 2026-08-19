-- Parcel Booking: a sales-agent-facing way to book non-sale shipments (free
-- gifts, samples) that still need to go through the normal Order Approval /
-- Dispatch Approval pipeline — unlike isSample, which skips approval
-- entirely. See Order.isParcelBooking doc comment in schema.prisma.

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "isParcelBooking" BOOLEAN NOT NULL DEFAULT false;
