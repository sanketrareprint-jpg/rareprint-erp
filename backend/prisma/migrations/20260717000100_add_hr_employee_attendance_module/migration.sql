-- HR Employee Master + Attendance module.
--
-- Adds the Employee table as the single source of truth for pay/attendance
-- calculations (mirrors the old "HR master" columns from the legacy Google
-- Sheet: SR, EMPLOYEE ID, NAME, POST, SALARY, WORKING HOURS, PAID LEAVE,
-- PER DAY, PER HR, ADDRESS, MOBILE, JOINING), plus EmployeeKra (KRA /
-- responsibilities) and EmployeeLeaveEntry (leave ledger) underneath it.
--
-- Also adds AttendanceRecord (one row per employee per day, sourced from the
-- biometric machine's "Exception Stat." export or entered/corrected by hand
-- when a punch is missed) and AttendanceImportSession (one row per uploaded
-- machine report, for audit/undo).
--
-- Written idempotently (IF NOT EXISTS / duplicate_object guards) to match
-- this repo's existing repair-migration pattern (see
-- 20260715000100_add_commission_override).

-- Enums

DO $$ BEGIN
  CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'RESIGNED', 'TERMINATED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "EmployeeKraType" AS ENUM ('KRA', 'RESPONSIBILITY');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "LeaveType" AS ENUM ('PAID', 'UNPAID', 'SICK', 'CASUAL', 'HALF_DAY', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "AttendanceSource" AS ENUM ('IMPORTED', 'MANUAL', 'EDITED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Employee

CREATE TABLE IF NOT EXISTS "Employee" (
  "id"                    TEXT NOT NULL,
  "employeeCode"          TEXT NOT NULL,
  "biometricId"           TEXT,
  "userId"                TEXT,
  "fullName"              TEXT NOT NULL,
  "designation"           TEXT NOT NULL,
  "department"            TEXT,
  "status"                "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
  "baseSalary"            DECIMAL(12,2) NOT NULL,
  "workingHoursPerDay"    DECIMAL(5,2) NOT NULL DEFAULT 8,
  "paidLeavePerMonth"     DECIMAL(4,2) NOT NULL DEFAULT 2,
  "annualPaidLeaveQuota"  DECIMAL(5,2),
  "dateOfJoining"         TIMESTAMP(3),
  "dateOfBirth"           TIMESTAMP(3),
  "gender"                TEXT,
  "address"               TEXT,
  "mobileNumber"          TEXT,
  "alternateMobile"       TEXT,
  "emergencyContactName"  TEXT,
  "emergencyContactPhone" TEXT,
  "idProofType"           TEXT,
  "idProofNumber"         TEXT,
  "bankAccountNumber"     TEXT,
  "bankIfsc"              TEXT,
  "photoUrl"              TEXT,
  "idProofDocUrl"         TEXT,
  "offerLetterUrl"        TEXT,
  "notes"                 TEXT,
  "resignedAt"            TIMESTAMP(3),
  "isActive"              BOOLEAN NOT NULL DEFAULT true,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Employee_employeeCode_key" ON "Employee"("employeeCode");
CREATE UNIQUE INDEX IF NOT EXISTS "Employee_biometricId_key" ON "Employee"("biometricId");
CREATE UNIQUE INDEX IF NOT EXISTS "Employee_userId_key" ON "Employee"("userId");
CREATE INDEX IF NOT EXISTS "Employee_status_idx" ON "Employee"("status");

DO $$ BEGIN
  ALTER TABLE "Employee"
  ADD CONSTRAINT "Employee_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- EmployeeKra (KRA / responsibilities)

CREATE TABLE IF NOT EXISTS "EmployeeKra" (
  "id"           TEXT NOT NULL,
  "employeeId"   TEXT NOT NULL,
  "type"         "EmployeeKraType" NOT NULL DEFAULT 'KRA',
  "title"        TEXT NOT NULL,
  "description"  TEXT,
  "targetMetric" TEXT,
  "isActive"     BOOLEAN NOT NULL DEFAULT true,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EmployeeKra_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EmployeeKra_employeeId_idx" ON "EmployeeKra"("employeeId");

DO $$ BEGIN
  ALTER TABLE "EmployeeKra"
  ADD CONSTRAINT "EmployeeKra_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- EmployeeLeaveEntry (leave ledger)

CREATE TABLE IF NOT EXISTS "EmployeeLeaveEntry" (
  "id"           TEXT NOT NULL,
  "employeeId"   TEXT NOT NULL,
  "date"         TIMESTAMP(3) NOT NULL,
  "endDate"      TIMESTAMP(3),
  "days"         DECIMAL(4,2) NOT NULL DEFAULT 1,
  "type"         "LeaveType" NOT NULL DEFAULT 'PAID',
  "reason"       TEXT,
  "recordedById" TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EmployeeLeaveEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EmployeeLeaveEntry_employeeId_date_idx" ON "EmployeeLeaveEntry"("employeeId", "date");

DO $$ BEGIN
  ALTER TABLE "EmployeeLeaveEntry"
  ADD CONSTRAINT "EmployeeLeaveEntry_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "EmployeeLeaveEntry"
  ADD CONSTRAINT "EmployeeLeaveEntry_recordedById_fkey"
  FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AttendanceImportSession (created before AttendanceRecord since the latter references it)

CREATE TABLE IF NOT EXISTS "AttendanceImportSession" (
  "id"           TEXT NOT NULL,
  "fileName"     TEXT NOT NULL,
  "periodStart"  DATE NOT NULL,
  "periodEnd"    DATE NOT NULL,
  "importedById" TEXT NOT NULL,
  "rowsFound"    INTEGER NOT NULL DEFAULT 0,
  "rowsImported" INTEGER NOT NULL DEFAULT 0,
  "rowsSkipped"  INTEGER NOT NULL DEFAULT 0,
  "unmatchedIds" TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AttendanceImportSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AttendanceImportSession_periodStart_periodEnd_idx" ON "AttendanceImportSession"("periodStart", "periodEnd");

DO $$ BEGIN
  ALTER TABLE "AttendanceImportSession"
  ADD CONSTRAINT "AttendanceImportSession_importedById_fkey"
  FOREIGN KEY ("importedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AttendanceRecord

CREATE TABLE IF NOT EXISTS "AttendanceRecord" (
  "id"                TEXT NOT NULL,
  "employeeId"        TEXT NOT NULL,
  "date"              DATE NOT NULL,
  "timeIn"            TEXT,
  "timeOut"           TEXT,
  "secondTimeIn"      TEXT,
  "secondTimeOut"     TEXT,
  "hoursWorked"       DECIMAL(5,2) NOT NULL DEFAULT 0,
  "lateMinutes"       INTEGER,
  "earlyLeaveMinutes" INTEGER,
  "isAbsent"          BOOLEAN NOT NULL DEFAULT false,
  "isPaidLeave"       BOOLEAN NOT NULL DEFAULT false,
  "source"            "AttendanceSource" NOT NULL DEFAULT 'IMPORTED',
  "note"              TEXT,
  "editedById"        TEXT,
  "importSessionId"   TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AttendanceRecord_employeeId_date_key" ON "AttendanceRecord"("employeeId", "date");
CREATE INDEX IF NOT EXISTS "AttendanceRecord_date_idx" ON "AttendanceRecord"("date");

DO $$ BEGIN
  ALTER TABLE "AttendanceRecord"
  ADD CONSTRAINT "AttendanceRecord_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "AttendanceRecord"
  ADD CONSTRAINT "AttendanceRecord_editedById_fkey"
  FOREIGN KEY ("editedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "AttendanceRecord"
  ADD CONSTRAINT "AttendanceRecord_importSessionId_fkey"
  FOREIGN KEY ("importSessionId") REFERENCES "AttendanceImportSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
