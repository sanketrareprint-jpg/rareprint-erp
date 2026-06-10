CREATE TYPE "TaskGoalHorizon" AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');

ALTER TABLE "Task"
  ADD COLUMN "goalHorizon" "TaskGoalHorizon" NOT NULL DEFAULT 'WEEKLY';

CREATE INDEX "Task_assignedToId_goalHorizon_status_idx" ON "Task"("assignedToId", "goalHorizon", "status");
