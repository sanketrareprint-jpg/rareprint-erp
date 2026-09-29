-- Half-day holiday support (Attendance > Holidays tab).
-- Additive only — existing rows default to 1 (full day), so current payroll is unchanged.

ALTER TABLE "CompanyHoliday" ADD COLUMN IF NOT EXISTS "days" DECIMAL(4,2) NOT NULL DEFAULT 1;
