-- Marketing ROI tab: monthly Meta Ads + AiSensy spend, entered by hand each
-- month. Everything else the ROI report shows (contacts created, converted
-- customers, total sale, total profit) is computed on the fly from the
-- existing ImportedContact table (see 20260726120000_add_call_compliance)
-- cross-referenced against Customer/Order — no new contacts table needed.
--
-- Written idempotently (IF NOT EXISTS) to match this repo's existing
-- repair-migration pattern (see 20260721120000_add_complaint_tickets).

CREATE TABLE IF NOT EXISTS "MarketingRoiSpend" (
  "id"           TEXT NOT NULL,
  "monthKey"     TEXT NOT NULL,
  "metaAdSpend"  DECIMAL(12,2) NOT NULL DEFAULT 0,
  "aisensySpend" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "notes"        TEXT,
  "createdById"  TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MarketingRoiSpend_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MarketingRoiSpend_monthKey_key" ON "MarketingRoiSpend"("monthKey");
