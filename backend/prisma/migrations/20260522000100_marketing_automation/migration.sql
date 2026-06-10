CREATE TYPE "MarketingLeadTemperature" AS ENUM ('COLD', 'WARM', 'HOT', 'BLOCKED');
CREATE TYPE "MarketingContactStatus" AS ENUM ('UNKNOWN', 'VALID', 'INVALID', 'BLOCKED', 'UNSUBSCRIBED');
CREATE TYPE "MarketingCampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');
CREATE TYPE "MarketingTemplateType" AS ENUM ('TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT');
CREATE TYPE "MarketingJobStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'FAILED', 'SKIPPED');
CREATE TYPE "MarketingEventType" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'CLICKED', 'REPLIED', 'FAILED', 'BLOCKED', 'UNSUBSCRIBED', 'ORDER_PLACED');

CREATE TABLE "MarketingContact" (
  "id" TEXT NOT NULL,
  "mobile" TEXT NOT NULL,
  "shopName" TEXT,
  "ownerName" TEXT,
  "city" TEXT,
  "state" TEXT,
  "productCategory" TEXT,
  "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "lastOrderDate" TIMESTAMP(3),
  "lastBroadcastDate" TIMESTAMP(3),
  "lastReplyDate" TIMESTAMP(3),
  "leadTemperature" "MarketingLeadTemperature" NOT NULL DEFAULT 'COLD',
  "engagementScore" INTEGER NOT NULL DEFAULT 0,
  "assignedAgentId" TEXT,
  "whatsappStatus" "MarketingContactStatus" NOT NULL DEFAULT 'UNKNOWN',
  "isBlacklisted" BOOLEAN NOT NULL DEFAULT false,
  "optedOutAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketingContact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketingTemplate" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "aisensyCampaignName" TEXT NOT NULL,
  "templateType" "MarketingTemplateType" NOT NULL DEFAULT 'TEXT',
  "language" TEXT NOT NULL DEFAULT 'en',
  "body" TEXT NOT NULL,
  "mediaUrl" TEXT,
  "variables" JSONB NOT NULL DEFAULT '[]',
  "ctaButtons" JSONB NOT NULL DEFAULT '[]',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketingTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketingSegment" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "filters" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketingSegment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketingCampaign" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "MarketingCampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "segmentId" TEXT,
  "dailyLimit" INTEGER NOT NULL DEFAULT 10000,
  "cooldownDays" INTEGER NOT NULL DEFAULT 30,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "lastRotatedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketingCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketingCampaignStep" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "stepOrder" INTEGER NOT NULL,
  "delayHours" INTEGER NOT NULL DEFAULT 0,
  "filters" JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "MarketingCampaignStep_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketingBroadcastJob" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "stepId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "status" "MarketingJobStatus" NOT NULL DEFAULT 'QUEUED',
  "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  "providerMessageId" TEXT,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketingBroadcastJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketingMessageEvent" (
  "id" TEXT NOT NULL,
  "contactId" TEXT,
  "campaignId" TEXT,
  "providerMessageId" TEXT,
  "eventType" "MarketingEventType" NOT NULL,
  "rawPayload" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketingMessageEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketingContact_mobile_key" ON "MarketingContact"("mobile");
CREATE INDEX "MarketingContact_city_idx" ON "MarketingContact"("city");
CREATE INDEX "MarketingContact_state_idx" ON "MarketingContact"("state");
CREATE INDEX "MarketingContact_assignedAgentId_idx" ON "MarketingContact"("assignedAgentId");
CREATE INDEX "MarketingContact_engagementScore_idx" ON "MarketingContact"("engagementScore");
CREATE INDEX "MarketingContact_leadTemperature_idx" ON "MarketingContact"("leadTemperature");
CREATE INDEX "MarketingTemplate_isActive_language_idx" ON "MarketingTemplate"("isActive", "language");
CREATE INDEX "MarketingCampaign_status_startsAt_priority_idx" ON "MarketingCampaign"("status", "startsAt", "priority");
CREATE UNIQUE INDEX "MarketingCampaignStep_campaignId_stepOrder_key" ON "MarketingCampaignStep"("campaignId", "stepOrder");
CREATE INDEX "MarketingCampaignStep_campaignId_idx" ON "MarketingCampaignStep"("campaignId");
CREATE UNIQUE INDEX "MarketingBroadcastJob_campaignId_stepId_contactId_key" ON "MarketingBroadcastJob"("campaignId", "stepId", "contactId");
CREATE INDEX "MarketingBroadcastJob_status_scheduledAt_idx" ON "MarketingBroadcastJob"("status", "scheduledAt");
CREATE INDEX "MarketingBroadcastJob_providerMessageId_idx" ON "MarketingBroadcastJob"("providerMessageId");
CREATE INDEX "MarketingMessageEvent_contactId_occurredAt_idx" ON "MarketingMessageEvent"("contactId", "occurredAt");
CREATE INDEX "MarketingMessageEvent_campaignId_occurredAt_idx" ON "MarketingMessageEvent"("campaignId", "occurredAt");
CREATE INDEX "MarketingMessageEvent_providerMessageId_idx" ON "MarketingMessageEvent"("providerMessageId");

ALTER TABLE "MarketingContact" ADD CONSTRAINT "MarketingContact_assignedAgentId_fkey" FOREIGN KEY ("assignedAgentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketingCampaignStep" ADD CONSTRAINT "MarketingCampaignStep_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingCampaignStep" ADD CONSTRAINT "MarketingCampaignStep_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MarketingTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketingBroadcastJob" ADD CONSTRAINT "MarketingBroadcastJob_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingBroadcastJob" ADD CONSTRAINT "MarketingBroadcastJob_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "MarketingCampaignStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingBroadcastJob" ADD CONSTRAINT "MarketingBroadcastJob_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "MarketingContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingMessageEvent" ADD CONSTRAINT "MarketingMessageEvent_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "MarketingContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketingMessageEvent" ADD CONSTRAINT "MarketingMessageEvent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
