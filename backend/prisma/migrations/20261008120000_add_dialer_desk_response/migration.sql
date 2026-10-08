-- Auto dialer: response typed in the PC popup during a phone call.
--
-- Additive only — four nullable columns on DialerLock (a per-call scratch
-- table); no existing column or row is changed. Idempotent, safe to re-run.

ALTER TABLE "DialerLock" ADD COLUMN IF NOT EXISTS "deskOutcome" "DialerOutcome";
ALTER TABLE "DialerLock" ADD COLUMN IF NOT EXISTS "deskNote" TEXT;
ALTER TABLE "DialerLock" ADD COLUMN IF NOT EXISTS "deskCallbackAt" TIMESTAMP(3);
ALTER TABLE "DialerLock" ADD COLUMN IF NOT EXISTS "deskSubmittedAt" TIMESTAMP(3);
