-- Add a second/alternate phone number to Customer, for the Create Order
-- form's new "Phone 2" field.

ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "phone2" TEXT;
