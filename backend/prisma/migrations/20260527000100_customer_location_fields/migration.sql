ALTER TABLE "Customer" ADD COLUMN "city" TEXT;
ALTER TABLE "Customer" ADD COLUMN "state" TEXT;
ALTER TABLE "Customer" ADD COLUMN "pincode" TEXT;

CREATE INDEX "Customer_city_idx" ON "Customer"("city");
CREATE INDEX "Customer_state_idx" ON "Customer"("state");
