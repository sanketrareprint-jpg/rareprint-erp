ALTER TABLE "Task"
  ADD COLUMN "orderIndex" INTEGER NOT NULL DEFAULT 0;

WITH ranked_tasks AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      ORDER BY "priority" DESC, "dueDate" ASC NULLS LAST, "createdAt" DESC
    ) AS row_number
  FROM "Task"
)
UPDATE "Task"
SET "orderIndex" = ranked_tasks.row_number * 1000
FROM ranked_tasks
WHERE "Task"."id" = ranked_tasks."id";

CREATE INDEX "Task_assignedToId_orderIndex_idx" ON "Task"("assignedToId", "orderIndex");
