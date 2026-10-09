-- Auto dialer: what the phone does after saving the PC popup's reply
-- (NEXT / PAUSE / STOP — "Save & call next / pause / stop" on the PC).
--
-- Additive only — one nullable column on DialerLock (a per-call scratch
-- table). Idempotent; PrismaService.onModuleInit also adds it on boot.

ALTER TABLE "DialerLock" ADD COLUMN IF NOT EXISTS "deskThen" TEXT;
