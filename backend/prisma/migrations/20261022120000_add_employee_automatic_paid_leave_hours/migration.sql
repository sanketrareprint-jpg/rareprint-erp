-- Per-employee automatic monthly paid-leave hours (Employee.automaticPaidLeaveHours).
--
-- Replaces the first-name list that used to live in hr.service.ts
-- (automaticMonthlyPaidLeaveHours): 16h for names containing one of the words
-- below, 14h for everyone else. The backfill reproduces that rule exactly, on
-- every deployment, so no salary changes when this ships.
--
-- Additive only — one new column. The backfill runs only in the same step that
-- creates the column, so re-running this file never overwrites a value an
-- admin has since edited. Idempotent, safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'Employee'
      AND column_name = 'automaticPaidLeaveHours'
  ) THEN
    ALTER TABLE "Employee" ADD COLUMN "automaticPaidLeaveHours" DECIMAL(5,2) NOT NULL DEFAULT 14;

    UPDATE "Employee"
    SET "automaticPaidLeaveHours" = 16
    WHERE upper("fullName") ~ '\m(PRAJAKTA|VAISHALI|SANDIP|YASH|DEEPAK|WARSHA|SUNITA)\M';
  END IF;
END $$;
