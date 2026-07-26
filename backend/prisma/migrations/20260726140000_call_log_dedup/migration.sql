-- Prevents double-counted calls when an agent's overlapping-period phone
-- statement gets uploaded more than once (e.g. a 1st-15th statement, then
-- later a 1st-20th statement that re-includes the same 1st-15th calls).
--
-- Step 1: remove any duplicate rows that already exist from imports done
-- before this constraint was added — same agent, same destination number,
-- same exact call timestamp is the same call, so keep exactly one copy.
-- Step 2: add a unique index so future imports can't recreate the problem
-- (the application uses `skipDuplicates` on insert, relying on this index).

DELETE FROM "CallLogRecord" a
USING "CallLogRecord" b
WHERE a.id > b.id
  AND a."agentId" = b."agentId"
  AND a."phone" = b."phone"
  AND a."calledAt" = b."calledAt";

CREATE UNIQUE INDEX IF NOT EXISTS "CallLogRecord_agentId_phone_calledAt_key" ON "CallLogRecord"("agentId", "phone", "calledAt");
