-- CreateTable
CREATE TABLE "UserActivitySession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "page" TEXT NOT NULL DEFAULT '/',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastPingAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activeSeconds" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserActivitySession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserActivitySession_userId_idx" ON "UserActivitySession"("userId");

-- CreateIndex
CREATE INDEX "UserActivitySession_startedAt_idx" ON "UserActivitySession"("startedAt");

-- AddForeignKey
ALTER TABLE "UserActivitySession" ADD CONSTRAINT "UserActivitySession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
