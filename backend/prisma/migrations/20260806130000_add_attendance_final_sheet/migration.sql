-- "Mark Final" sheet-per-month: one import session per overlapping month can
-- be flagged as the authoritative sheet, so viewing/paying for that month
-- only reads that session's rows (plus any hand-corrected days, which still
-- take precedence over any import). See finalizeImportSession() in
-- attendance.service.ts for the enforcement (only one final session per
-- overlapping period; marking a new one final unmarks any prior one).

ALTER TABLE "AttendanceImportSession"
ADD COLUMN IF NOT EXISTS "isFinal" BOOLEAN NOT NULL DEFAULT false;
