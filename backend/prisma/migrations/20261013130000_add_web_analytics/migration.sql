-- Web Analytics: owner-only GA4 + Search Console dashboard storage.
--
-- Additive only — two new tables and their indexes. No existing table,
-- column, row or constraint is touched. Idempotent (IF NOT EXISTS), safe to
-- re-run.

CREATE TABLE IF NOT EXISTS "WebAnalyticsReport" (
  "id"        TEXT NOT NULL,
  "source"    TEXT NOT NULL,
  "report"    TEXT NOT NULL,
  "rangeDays" INTEGER NOT NULL,
  "period"    TEXT NOT NULL,
  "startDate" TEXT NOT NULL,
  "endDate"   TEXT NOT NULL,
  "rows"      JSONB NOT NULL,
  "syncedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WebAnalyticsReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WebAnalyticsReport_source_report_rangeDays_period_key"
  ON "WebAnalyticsReport"("source", "report", "rangeDays", "period");

CREATE TABLE IF NOT EXISTS "WebAnalyticsSyncLog" (
  "id"          TEXT NOT NULL,
  "trigger"     TEXT NOT NULL,
  "status"      TEXT NOT NULL DEFAULT 'RUNNING',
  "ga4Ok"       BOOLEAN,
  "gscOk"       BOOLEAN,
  "gscDataUpTo" TEXT,
  "error"       TEXT,
  "startedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt"  TIMESTAMP(3),

  CONSTRAINT "WebAnalyticsSyncLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WebAnalyticsSyncLog_startedAt_idx"
  ON "WebAnalyticsSyncLog"("startedAt");
