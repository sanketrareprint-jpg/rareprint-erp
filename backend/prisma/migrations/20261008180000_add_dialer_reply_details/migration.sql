-- Auto dialer: products asked about, not-interested reason, and "end call
-- from the PC".
--
-- Additive only — nullable columns on DialerCall and DialerLock; no existing
-- column or row is changed. Idempotent, safe to re-run.

ALTER TABLE "DialerCall" ADD COLUMN IF NOT EXISTS "notInterestedReason" TEXT;
ALTER TABLE "DialerCall" ADD COLUMN IF NOT EXISTS "products" JSONB;

ALTER TABLE "DialerLock" ADD COLUMN IF NOT EXISTS "deskNotInterestedReason" TEXT;
ALTER TABLE "DialerLock" ADD COLUMN IF NOT EXISTS "deskProducts" JSONB;
ALTER TABLE "DialerLock" ADD COLUMN IF NOT EXISTS "deskEndCallAt" TIMESTAMP(3);
