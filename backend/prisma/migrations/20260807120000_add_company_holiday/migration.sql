-- Company-wide holiday / extra-leave calendar (Attendance > Holidays tab).
-- Written idempotently to match this repo's existing repair-migration
-- pattern (IF NOT EXISTS / duplicate_object guards).

DO $$ BEGIN
  CREATE TYPE "CompanyHolidayType" AS ENUM ('HOLIDAY', 'EXTRA_LEAVE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "CompanyHoliday" (
    "id"          TEXT NOT NULL,
    "date"        TIMESTAMP(3) NOT NULL,
    "label"       TEXT NOT NULL,
    "type"        "CompanyHolidayType" NOT NULL DEFAULT 'HOLIDAY',
    "createdById" TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyHoliday_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "CompanyHoliday" ADD CONSTRAINT "CompanyHoliday_date_key" UNIQUE ("date");
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "CompanyHoliday_date_idx" ON "CompanyHoliday"("date");

DO $$ BEGIN
  ALTER TABLE "CompanyHoliday"
  ADD CONSTRAINT "CompanyHoliday_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
