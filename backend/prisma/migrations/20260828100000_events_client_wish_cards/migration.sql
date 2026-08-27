-- Events module: "Client Business Festival Wish Cards" (added 2026-08-28).
-- See docs/Events_Module_Client_Wish_Cards_Build_Prompt.md and
-- docs/Events_Module_Context.md.
--
-- This is a NEW, separate migration folder — never an edit to
-- 20260824090000/20260825120000/20260827130000's migration.sql files, which
-- are already applied to production. See those migrations' own comments and
-- docs/Events_Module_Context.md's "Never edit an already-applied migration
-- file" section for why (checksum drift silently blocks `prisma migrate
-- deploy` on this app's Railway setup). Purely additive: one new enum value,
-- one new nullable column + index on the existing Festival table, and two
-- new tables. No existing column or table is altered destructively.

-- New EventOccasionType value for templates designed around a CLIENT
-- BUSINESS's own branding (CLIENT_LOGO/CLIENT_TEXT fields), distinct from
-- the existing FESTIVAL value used for RarePrint's own EventPerson contacts.
ALTER TYPE "EventOccasionType" ADD VALUE IF NOT EXISTS 'CLIENT_FESTIVAL';

-- Second, independent template link on Festival — a festival can have both
-- its existing `templateId` (own-customer flyer) and this new
-- `clientTemplateId` (client-business wish card) set independently.
ALTER TABLE "Festival" ADD COLUMN IF NOT EXISTS "clientTemplateId" TEXT;
CREATE INDEX IF NOT EXISTS "Festival_clientTemplateId_idx" ON "Festival"("clientTemplateId");

DO $$ BEGIN
  ALTER TABLE "Festival" ADD CONSTRAINT "Festival_clientTemplateId_fkey"
    FOREIGN KEY ("clientTemplateId") REFERENCES "EventFlyerTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- RarePrint's own list of client businesses (its printing/design customers)
-- who receive an auto-generated, self-branded festival wish image — NOT the
-- same as EventBrandProfile (RarePrint's own singleton brand identity) and
-- NOT the same as EventPerson (RarePrint's own birthday/anniversary/festival
-- contacts). One row per client business.
CREATE TABLE IF NOT EXISTS "EventClientBusiness" (
  "id"             TEXT NOT NULL,
  "businessName"   TEXT NOT NULL,
  "logoDataUrl"    TEXT,
  "phone"          TEXT,
  "address"        TEXT,
  "tagline"        TEXT,
  "whatsappNumber" TEXT NOT NULL,
  "isActive"       BOOLEAN NOT NULL DEFAULT true,
  "createdById"    TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EventClientBusiness_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EventClientBusiness_isActive_idx" ON "EventClientBusiness"("isActive");

-- Parallel to EventSendLog (kept separate rather than reusing it — see the
-- schema.prisma comment above EventClientWishLog for why).
CREATE TABLE IF NOT EXISTS "EventClientWishLog" (
  "id"                TEXT NOT NULL,
  "clientBusinessId"  TEXT NOT NULL,
  "templateId"        TEXT,
  "festivalId"        TEXT NOT NULL,
  "occasionYear"      INTEGER NOT NULL,
  "recipientPhone"    TEXT NOT NULL,
  "flyerImageDataUrl" TEXT,
  "status"            "EventSendStatus" NOT NULL,
  "errorMessage"      TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EventClientWishLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EventClientWishLog_clientBusinessId_festivalId_occasionYear_idx" ON "EventClientWishLog"("clientBusinessId", "festivalId", "occasionYear");
CREATE INDEX IF NOT EXISTS "EventClientWishLog_festivalId_idx" ON "EventClientWishLog"("festivalId");
CREATE INDEX IF NOT EXISTS "EventClientWishLog_createdAt_idx" ON "EventClientWishLog"("createdAt");

DO $$ BEGIN
  ALTER TABLE "EventClientWishLog" ADD CONSTRAINT "EventClientWishLog_clientBusinessId_fkey"
    FOREIGN KEY ("clientBusinessId") REFERENCES "EventClientBusiness"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "EventClientWishLog" ADD CONSTRAINT "EventClientWishLog_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "EventFlyerTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "EventClientWishLog" ADD CONSTRAINT "EventClientWishLog_festivalId_fkey"
    FOREIGN KEY ("festivalId") REFERENCES "Festival"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
