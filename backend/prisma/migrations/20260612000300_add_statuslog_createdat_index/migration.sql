-- Add index on StatusLog.createdAt to speed up dashboard production KPI queries
CREATE INDEX IF NOT EXISTS "StatusLog_createdAt_idx" ON "StatusLog"("createdAt");
