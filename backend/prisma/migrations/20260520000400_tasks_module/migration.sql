CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED');
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

CREATE TABLE "Task" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
  "priority" "TaskPriority" NOT NULL DEFAULT 'NORMAL',
  "dueDate" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "assignedToId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),

  CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Task_assignedToId_status_dueDate_idx" ON "Task"("assignedToId", "status", "dueDate");
CREATE INDEX "Task_createdById_createdAt_idx" ON "Task"("createdById", "createdAt");
CREATE INDEX "Task_status_dueDate_idx" ON "Task"("status", "dueDate");

ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
