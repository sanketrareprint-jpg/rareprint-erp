-- Certificate Generator module: a saved template (background image + size/DPI
-- + dynamic text field positions) generates one certificate per row of an
-- uploaded Excel/CSV file, imposed onto print-ready sheets and exported as a
-- single combined PDF. See backend/src/certificate-generator/.
--
-- Purely additive — two new tables, no existing table touched.

DO $$ BEGIN
  CREATE TYPE "CertificateJobStatus" AS ENUM ('DRAFT', 'PROCESSING', 'COMPLETED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "CertificateTemplate" (
  "id"           TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "imageDataUrl" TEXT NOT NULL,
  "widthIn"      DECIMAL(6,3) NOT NULL,
  "heightIn"     DECIMAL(6,3) NOT NULL,
  "dpi"          INTEGER NOT NULL DEFAULT 300,
  "fields"       JSONB NOT NULL,
  "createdById"  TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CertificateTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CertificateTemplate_createdById_idx" ON "CertificateTemplate"("createdById");

CREATE TABLE IF NOT EXISTS "CertificateJob" (
  "id"             TEXT NOT NULL,
  "templateId"     TEXT NOT NULL,
  "fileName"       TEXT NOT NULL,
  "rawRows"        JSONB NOT NULL,
  "columnMapping"  JSONB NOT NULL,
  "sheetSettings"  JSONB NOT NULL,
  "invalidRowMode" TEXT NOT NULL DEFAULT 'SKIP',
  "rowsTotal"      INTEGER NOT NULL DEFAULT 0,
  "rowsGenerated"  INTEGER NOT NULL DEFAULT 0,
  "rowsFailed"     INTEGER NOT NULL DEFAULT 0,
  "status"         "CertificateJobStatus" NOT NULL DEFAULT 'DRAFT',
  "errorMessage"   TEXT,
  "resultPdfUrl"   TEXT,
  "createdById"    TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CertificateJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CertificateJob_templateId_idx" ON "CertificateJob"("templateId");
CREATE INDEX IF NOT EXISTS "CertificateJob_status_idx" ON "CertificateJob"("status");

DO $$ BEGIN
  ALTER TABLE "CertificateJob" ADD CONSTRAINT "CertificateJob_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "CertificateTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
