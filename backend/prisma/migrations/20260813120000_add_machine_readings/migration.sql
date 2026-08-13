-- Workshop machine readings (envelope-making machine meter + operator payment
-- tracking). Written idempotently to match this repo's existing repair-
-- migration pattern (IF NOT EXISTS / duplicate_object guards).

CREATE TABLE IF NOT EXISTS "MachineReading" (
    "id"            TEXT NOT NULL,
    "machineName"   TEXT NOT NULL DEFAULT 'Envelope Machine',
    "readingDate"   TIMESTAMP(3) NOT NULL,
    "readingValue"  INTEGER NOT NULL,
    "wasReset"      BOOLEAN NOT NULL DEFAULT false,
    "notes"         TEXT,

    "isPaid"        BOOLEAN NOT NULL DEFAULT false,
    "unitsProduced" INTEGER,
    "paidAmount"    DECIMAL(10,2),
    "paidAt"        TIMESTAMP(3),
    "paidNote"      TEXT,
    "paidById"      TEXT,

    "recordedById"  TEXT,

    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MachineReading_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MachineReading_machineName_readingDate_idx" ON "MachineReading"("machineName", "readingDate");
CREATE INDEX IF NOT EXISTS "MachineReading_isPaid_idx" ON "MachineReading"("isPaid");

DO $$ BEGIN
  ALTER TABLE "MachineReading" ADD CONSTRAINT "MachineReading_paidById_fkey"
  FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "MachineReading" ADD CONSTRAINT "MachineReading_recordedById_fkey"
  FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
