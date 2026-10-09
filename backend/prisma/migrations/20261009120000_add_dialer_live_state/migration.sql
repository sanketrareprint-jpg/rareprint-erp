-- Auto dialer: call state the phone reports (DIALING / ON_CALL / WRAP_UP),
-- so the PC popup shows only while the agent is actually on a lead call.
--
-- Additive only — two nullable columns on DialerLock (a per-call scratch
-- table). Idempotent; PrismaService.onModuleInit also adds them on boot.

ALTER TABLE "DialerLock" ADD COLUMN IF NOT EXISTS "liveState" TEXT;
ALTER TABLE "DialerLock" ADD COLUMN IF NOT EXISTS "liveStateAt" TIMESTAMP(3);
