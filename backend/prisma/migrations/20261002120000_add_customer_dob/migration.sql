-- Customer date of birth, required on the Create Order form. Additive,
-- nullable and idempotent — existing customers keep NULL until their next
-- order; safe to re-run on any environment's DB.

ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "dateOfBirth" DATE;
