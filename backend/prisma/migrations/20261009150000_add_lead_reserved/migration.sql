-- CRM import: leads can be imported into a "Reserved leads" list, which the
-- auto dialer calls only after the agent's new leads run out.
--
-- Additive only — one NOT NULL column with a constant default (metadata-only,
-- existing leads become non-reserved, i.e. unchanged). Idempotent;
-- PrismaService.onModuleInit also adds it on boot.

ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "isReserved" BOOLEAN NOT NULL DEFAULT false;
