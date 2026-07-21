-- Complaint / Ticket Management module (see complaint-ticket-module-spec.md).
--
-- Written idempotently (IF NOT EXISTS / duplicate_object guards) to match
-- this repo's existing repair-migration pattern (see
-- 20260718090000_add_loyalty_points).

DO $$ BEGIN
  CREATE TYPE "ComplaintChannel" AS ENUM ('WHATSAPP', 'CALL', 'EMAIL', 'WEB_PORTAL', 'WALK_IN', 'SALES_AGENT');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ComplaintCategory" AS ENUM ('PRODUCT_QUALITY', 'DELIVERY_DELAY', 'WRONG_ITEM', 'DAMAGED_IN_TRANSIT', 'DESIGN_ERROR', 'PRODUCTION_DEFECT', 'BILLING_DISPUTE', 'PAYMENT_ISSUE', 'VENDOR_ISSUE', 'SERVICE_COMPLAINT', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ComplaintPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ComplaintStatus" AS ENUM ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'PENDING_CUSTOMER', 'PENDING_VENDOR', 'RESOLVED', 'CLOSED', 'REOPENED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ComplaintResolutionType" AS ENUM ('REPRINT', 'REFUND', 'PARTIAL_REFUND', 'REPLACEMENT', 'DISCOUNT_CREDIT', 'APOLOGY_ONLY', 'NO_FAULT_FOUND', 'GOODWILL');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ComplaintCommentVisibility" AS ENUM ('INTERNAL', 'CUSTOMER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "Complaint" (
  "id"                 TEXT NOT NULL,
  "ticketNumber"       TEXT NOT NULL,
  "customerId"         TEXT NOT NULL,
  "orderId"            TEXT,
  "orderItemId"        TEXT,
  "productId"          TEXT,
  "channel"            "ComplaintChannel" NOT NULL,
  "category"           "ComplaintCategory" NOT NULL,
  "priority"           "ComplaintPriority" NOT NULL DEFAULT 'MEDIUM',
  "status"             "ComplaintStatus" NOT NULL DEFAULT 'OPEN',
  "subject"            TEXT NOT NULL,
  "description"        TEXT NOT NULL,
  "raisedById"         TEXT,
  "assignedToId"       TEXT,
  "assignedTeam"       TEXT,
  "slaResponseDueAt"   TIMESTAMP(3),
  "slaResolutionDueAt" TIMESTAMP(3),
  "firstRespondedAt"   TIMESTAMP(3),
  "resolvedAt"         TIMESTAMP(3),
  "closedAt"           TIMESTAMP(3),
  "resolutionType"     "ComplaintResolutionType",
  "resolutionNotes"    TEXT,
  "rootCause"          TEXT,
  "vendorId"           TEXT,
  "reopenCount"        INTEGER NOT NULL DEFAULT 0,
  "escalatedToAdmin"   BOOLEAN NOT NULL DEFAULT false,
  "escalatedAt"        TIMESTAMP(3),
  "csatRating"         INTEGER,
  "csatFeedback"       TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Complaint_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Complaint_ticketNumber_key" ON "Complaint"("ticketNumber");
CREATE INDEX IF NOT EXISTS "Complaint_status_priority_idx" ON "Complaint"("status", "priority");
CREATE INDEX IF NOT EXISTS "Complaint_customerId_createdAt_idx" ON "Complaint"("customerId", "createdAt");
CREATE INDEX IF NOT EXISTS "Complaint_orderId_idx" ON "Complaint"("orderId");
CREATE INDEX IF NOT EXISTS "Complaint_assignedToId_status_idx" ON "Complaint"("assignedToId", "status");
CREATE INDEX IF NOT EXISTS "Complaint_slaResolutionDueAt_status_idx" ON "Complaint"("slaResolutionDueAt", "status");

DO $$ BEGIN
  ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "ComplaintComment" (
  "id"          TEXT NOT NULL,
  "complaintId" TEXT NOT NULL,
  "authorId"    TEXT,
  "authorName"  TEXT NOT NULL,
  "visibility"  "ComplaintCommentVisibility" NOT NULL DEFAULT 'INTERNAL',
  "message"     TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ComplaintComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ComplaintComment_complaintId_createdAt_idx" ON "ComplaintComment"("complaintId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "ComplaintComment" ADD CONSTRAINT "ComplaintComment_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "Complaint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "ComplaintAttachment" (
  "id"           TEXT NOT NULL,
  "complaintId"  TEXT NOT NULL,
  "url"          TEXT NOT NULL,
  "fileName"     TEXT NOT NULL,
  "fileType"     TEXT,
  "uploadedById" TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ComplaintAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ComplaintAttachment_complaintId_idx" ON "ComplaintAttachment"("complaintId");

DO $$ BEGIN
  ALTER TABLE "ComplaintAttachment" ADD CONSTRAINT "ComplaintAttachment_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "Complaint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "ComplaintStatusLog" (
  "id"          TEXT NOT NULL,
  "complaintId" TEXT NOT NULL,
  "fromStatus"  "ComplaintStatus",
  "toStatus"    "ComplaintStatus" NOT NULL,
  "changedById" TEXT,
  "reason"      TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ComplaintStatusLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ComplaintStatusLog_complaintId_createdAt_idx" ON "ComplaintStatusLog"("complaintId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "ComplaintStatusLog" ADD CONSTRAINT "ComplaintStatusLog_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "Complaint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
