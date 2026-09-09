-- Events module: register contacts (customers/friends/family/anyone) with a
-- WhatsApp number, DOB and/or anniversary date and an optional photo. A
-- daily job matches today's date against contacts (birthday/anniversary) and
-- against owner-defined EventFestival dates, generates a personalised flyer
-- from an EventTemplate, and sends it via AiSensy to the contact and the
-- owner. See backend/src/events/.
--
-- Purely additive — four new tables, two new enums, no existing table touched.

DO $$ BEGIN
  CREATE TYPE "OccasionType" AS ENUM ('BIRTHDAY', 'ANNIVERSARY', 'FESTIVAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "EventMessageStatus" AS ENUM ('SENT', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "EventContact" (
  "id"              TEXT NOT NULL,
  "fullName"        TEXT NOT NULL,
  "whatsappNumber"  TEXT NOT NULL,
  "relation"        TEXT,
  "photoDataUrl"    TEXT,
  "dateOfBirth"     TIMESTAMP(3),
  "anniversaryDate" TIMESTAMP(3),
  "notes"           TEXT,
  "isActive"        BOOLEAN NOT NULL DEFAULT true,
  "createdById"     TEXT NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EventContact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EventContact_createdById_idx" ON "EventContact"("createdById");

CREATE TABLE IF NOT EXISTS "EventTemplate" (
  "id"                TEXT NOT NULL,
  "name"              TEXT NOT NULL,
  "occasionType"      "OccasionType" NOT NULL,
  "backgroundDataUrl" TEXT NOT NULL,
  "canvasWidthPx"     INTEGER NOT NULL,
  "canvasHeightPx"    INTEGER NOT NULL,
  "namePlaceholder"   JSONB NOT NULL,
  "subPlaceholder"    JSONB,
  "photoPlaceholder"  JSONB,
  "isActive"          BOOLEAN NOT NULL DEFAULT true,
  "createdById"       TEXT NOT NULL,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EventTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EventTemplate_occasionType_idx" ON "EventTemplate"("occasionType");

CREATE TABLE IF NOT EXISTS "EventFestival" (
  "id"          TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "month"       INTEGER NOT NULL,
  "day"         INTEGER NOT NULL,
  "templateId"  TEXT NOT NULL,
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EventFestival_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EventFestival_month_day_idx" ON "EventFestival"("month", "day");
CREATE INDEX IF NOT EXISTS "EventFestival_templateId_idx" ON "EventFestival"("templateId");

DO $$ BEGIN
  ALTER TABLE "EventFestival" ADD CONSTRAINT "EventFestival_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "EventTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "EventMessage" (
  "id"            TEXT NOT NULL,
  "contactId"     TEXT NOT NULL,
  "occasionType"  "OccasionType" NOT NULL,
  "occasionKey"   TEXT NOT NULL,
  "eventYear"     INTEGER NOT NULL,
  "festivalId"    TEXT,
  "templateId"    TEXT,
  "imageDataUrl"  TEXT,
  "status"        "EventMessageStatus" NOT NULL,
  "sentToContact" BOOLEAN NOT NULL DEFAULT false,
  "sentToOwner"   BOOLEAN NOT NULL DEFAULT false,
  "failureReason" TEXT,
  "isTest"        BOOLEAN NOT NULL DEFAULT false,
  "createdById"   TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EventMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EventMessage_contactId_idx" ON "EventMessage"("contactId");
CREATE INDEX IF NOT EXISTS "EventMessage_status_idx" ON "EventMessage"("status");
CREATE UNIQUE INDEX IF NOT EXISTS "EventMessage_contactId_occasionKey_eventYear_key"
  ON "EventMessage"("contactId", "occasionKey", "eventYear");

DO $$ BEGIN
  ALTER TABLE "EventMessage" ADD CONSTRAINT "EventMessage_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "EventContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "EventMessage" ADD CONSTRAINT "EventMessage_festivalId_fkey"
    FOREIGN KEY ("festivalId") REFERENCES "EventFestival"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "EventMessage" ADD CONSTRAINT "EventMessage_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "EventTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
