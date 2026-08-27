-- Events module follow-up #2: one-time custom-date festivals (alongside the
-- existing recurring month/day ones) + a reusable firm brand profile (logo/
-- name/address/phone/email/website/products) that every flyer template's
-- BRAND_LOGO/BRAND_TEXT fields can pull from, instead of a template
-- designer re-typing (or baking into the background image) the firm's
-- identity for every single template. Added 2026-08-27.
--
-- Like 20260825120000_events_recurring_festivals, this is a SEPARATE
-- migration rather than an edit to 20260824090000_add_events_module's own
-- (already-applied) migration.sql — see that migration's comment, and the
-- 2026-08-25 incident writeup in docs/Events_Module_Context.md, for why:
-- `prisma migrate deploy` checksums each already-applied migration file,
-- and editing one in place after it has run makes deploy silently refuse to
-- apply anything further (railway-migrate.js treats a `migrate deploy`
-- failure as a non-fatal warning so the app can still boot, which is what
-- let that drift go unnoticed the first time). Never edit an already-
-- applied migration file again; always add a new one, however small.

ALTER TABLE "Festival" ADD COLUMN IF NOT EXISTS "isRecurring" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Festival" ADD COLUMN IF NOT EXISTS "oneTimeDate" DATE;
ALTER TABLE "Festival" ALTER COLUMN "month" DROP NOT NULL;
ALTER TABLE "Festival" ALTER COLUMN "day" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "Festival_oneTimeDate_idx" ON "Festival"("oneTimeDate");

CREATE TABLE IF NOT EXISTS "EventBrandProfile" (
  "id"          TEXT NOT NULL DEFAULT 'singleton',
  "logoDataUrl" TEXT,
  "firmName"    TEXT,
  "address"     TEXT,
  "phone"       TEXT,
  "email"       TEXT,
  "website"     TEXT,
  "products"    TEXT,
  "updatedById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EventBrandProfile_pkey" PRIMARY KEY ("id")
);
