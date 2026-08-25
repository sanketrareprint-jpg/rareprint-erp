-- Events module follow-up: switch Festival from a one-off exact date
-- (re-added every year) to a recurring month/day (added once, fires every
-- year) — Sanket's explicit choice, made after 20260824090000_add_events_module
-- had already been applied to production. See docs/Events_Module_Context.md.
--
-- This is a SEPARATE migration, not an edit to 20260824090000's own
-- migration.sql, on purpose: `prisma migrate deploy` checksums each already-
-- applied migration file, and editing one in place after it has run makes
-- deploy refuse to apply anything further (silently, in this app's case,
-- since scripts/railway-migrate.js treats a `migrate deploy` failure as a
-- non-fatal warning and lets the app boot anyway) — which is exactly what
-- happened here and is why this fix exists. Never edit an already-applied
-- migration file again; always add a new one, however small the change.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Festival' AND column_name = 'date') THEN
    ALTER TABLE "Festival" ADD COLUMN IF NOT EXISTS "month" INTEGER;
    ALTER TABLE "Festival" ADD COLUMN IF NOT EXISTS "day" INTEGER;
    UPDATE "Festival" SET "month" = EXTRACT(MONTH FROM "date")::INTEGER, "day" = EXTRACT(DAY FROM "date")::INTEGER WHERE "month" IS NULL;
    ALTER TABLE "Festival" ALTER COLUMN "month" SET NOT NULL;
    ALTER TABLE "Festival" ALTER COLUMN "day" SET NOT NULL;
    ALTER TABLE "Festival" DROP COLUMN "date";
    ALTER TABLE "Festival" DROP COLUMN IF EXISTS "sentAt";
  END IF;
END $$;

DROP INDEX IF EXISTS "Festival_date_idx";
CREATE INDEX IF NOT EXISTS "Festival_month_day_idx" ON "Festival"("month", "day");
