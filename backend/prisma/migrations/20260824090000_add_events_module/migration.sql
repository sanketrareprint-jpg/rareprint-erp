-- Events module: register customers/friends/others with a DOB and/or
-- anniversary date + WhatsApp number, define flyer templates (background
-- image + variable name/photo/text field positions), define festival dates,
-- and log every automated WhatsApp send. See backend/src/events/.
--
-- Purely additive — four new tables, no existing table touched.

DO $$ BEGIN
  CREATE TYPE "EventOccasionType" AS ENUM ('BIRTHDAY', 'ANNIVERSARY', 'FESTIVAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "EventSendStatus" AS ENUM ('SUCCESS', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "EventFlyerTemplate" (
  "id"           TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "occasionType" "EventOccasionType" NOT NULL,
  "imageDataUrl" TEXT NOT NULL,
  "fields"       JSONB NOT NULL,
  "isActive"     BOOLEAN NOT NULL DEFAULT true,
  "createdById"  TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EventFlyerTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EventFlyerTemplate_occasionType_idx" ON "EventFlyerTemplate"("occasionType");
CREATE INDEX IF NOT EXISTS "EventFlyerTemplate_createdById_idx" ON "EventFlyerTemplate"("createdById");

CREATE TABLE IF NOT EXISTS "EventPerson" (
  "id"              TEXT NOT NULL,
  "name"            TEXT NOT NULL,
  "whatsappNumber"  TEXT NOT NULL,
  "relation"        TEXT NOT NULL DEFAULT 'CUSTOMER',
  "dob"             DATE,
  "anniversaryDate" DATE,
  "photoDataUrl"    TEXT,
  "notes"           TEXT,
  "isActive"        BOOLEAN NOT NULL DEFAULT true,
  "createdById"     TEXT NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EventPerson_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EventPerson_isActive_idx" ON "EventPerson"("isActive");

CREATE TABLE IF NOT EXISTS "Festival" (
  "id"          TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "date"        DATE NOT NULL,
  "templateId"  TEXT,
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  "sentAt"      TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Festival_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Festival_date_idx" ON "Festival"("date");
CREATE INDEX IF NOT EXISTS "Festival_templateId_idx" ON "Festival"("templateId");

DO $$ BEGIN
  ALTER TABLE "Festival" ADD CONSTRAINT "Festival_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "EventFlyerTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "EventSendLog" (
  "id"                TEXT NOT NULL,
  "personId"          TEXT NOT NULL,
  "templateId"        TEXT,
  "festivalId"        TEXT,
  "occasionType"      "EventOccasionType" NOT NULL,
  "occasionYear"      INTEGER NOT NULL,
  "recipientPhone"    TEXT NOT NULL,
  "sentToOwner"        BOOLEAN NOT NULL DEFAULT false,
  "flyerImageDataUrl" TEXT,
  "status"            "EventSendStatus" NOT NULL,
  "errorMessage"      TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EventSendLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EventSendLog_personId_occasionType_occasionYear_idx" ON "EventSendLog"("personId", "occasionType", "occasionYear");
CREATE INDEX IF NOT EXISTS "EventSendLog_festivalId_idx" ON "EventSendLog"("festivalId");
CREATE INDEX IF NOT EXISTS "EventSendLog_createdAt_idx" ON "EventSendLog"("createdAt");

DO $$ BEGIN
  ALTER TABLE "EventSendLog" ADD CONSTRAINT "EventSendLog_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "EventPerson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "EventSendLog" ADD CONSTRAINT "EventSendLog_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "EventFlyerTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "EventSendLog" ADD CONSTRAINT "EventSendLog_festivalId_fkey"
    FOREIGN KEY ("festivalId") REFERENCES "Festival"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
