-- Phase 1b of docs/SaaS_Conversion_Roadmap_v2.md: tenantId rollout.
-- Adds a nullable tenantId to every tenant-scoped table, backfills every
-- existing row onto a single default "RarePrint" tenant, then makes the
-- column NOT NULL + FK + indexed. Also converts formerly-global unique
-- constraints (orderNumber, invoiceNumber, sku, employeeCode, etc.) into
-- composite (tenantId, field) uniques so two future tenants can reuse the
-- same numbering without colliding.
--
-- Excluded (stay global/shared, no tenantId): SalesTopic, TopicQuestion,
-- MilestoneTest, MilestoneQuestion (shared sales-training content library).
--
-- Also excluded from tenant scoping (kept as plain unique, token-style
-- lookups with no tenant context at read time): User.passwordResetToken,
-- Employee.agreementToken.
--
-- SAFE TO RE-RUN: every statement is idempotent (IF NOT EXISTS / IF EXISTS /
-- guarded DO blocks), matching this repo's migration convention. This still
-- touches every row of every business table, so it should run inside one
-- transaction and be reviewed before being applied to the live DB.

BEGIN;

-- 1) Default tenant every existing row gets backfilled onto.
INSERT INTO "Tenant" ("id", "name", "subdomain", "status", "createdAt", "updatedAt")
VALUES ('tenant_rareprint_default', 'RarePrint', 'rareprint', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- 2) Add tenantId (nullable) to every tenant-scoped table.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "ProductCategory" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "AgencyRateProduct" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "AgencyRateQuantityColumn" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "AgencyRate" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "OfferCode" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "ProductRule" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "ProductCostSlab" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "ProductRateSlab" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "CommissionRule" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "PaymentAccount" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "JobWork" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "PrintSheet" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "PrintSheetItem" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "SheetStageVendor" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "ItemStageLog" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Godown" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "InvoiceItem" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "PurchaseBill" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "VendorPayment" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "AccountingLedgerEntry" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "AccountingNote" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Commission" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "CommissionVerification" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "CommissionOverride" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "SalesIncentivePlan" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "CompanyTerms" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "PolicyDocument" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "CompanyHoliday" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "EmployeeKra" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "EmployeeLeaveEntry" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "AttendanceRecord" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "AttendanceImportSession" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "ProductionJob" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "StatusLog" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "OrderReassuranceLog" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "LeadActivity" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "LeadFollowUp" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "CallLogImport" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "CallLogRecord" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "ContactImport" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "ImportedContact" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "ImportedContactFollowUp" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "MarketingRoiSpend" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "UserTopicProgress" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "QuizAttempt" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "MilestoneAttempt" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "DailyLearningStreak" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "CallAnalysis" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "SystemConfig" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "QuoteHistory" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "RewardWallet" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "RewardTransaction" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "BonusActivity" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "BonusClaim" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "CustomerLoyaltyWallet" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "CustomerLoyaltyTransaction" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "PaperPurchaseOrder" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "PaperPurchaseItem" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "PaperInventory" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "PaperTransaction" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "MarketingContact" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "MarketingTemplate" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "MarketingSegment" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "MarketingCampaign" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "MarketingCampaignStep" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "MarketingBroadcastJob" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "MarketingMessageEvent" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "BankImportSession" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "BankTransaction" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "RemittanceImportSession" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "RemittanceRecord" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "ShippingChargeRecord" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "VendorKeyword" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "UserPaymentKeyword" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "ExpenseCategory" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "ExpenseKeyword" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "InHouseStickerStock" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "InHouseStickerTransaction" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "BusinessRule" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "UserActivitySession" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Complaint" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "ComplaintComment" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "ComplaintAttachment" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "ComplaintStatusLog" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "MachineReading" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "CertificateTemplate" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "CertificateJob" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "EventFlyerTemplate" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "EventPerson" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Festival" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "EventBrandProfile" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "EventClientBusiness" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "EventClientWishLog" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "EventSendLog" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- 3) Backfill every existing row onto the default tenant.
UPDATE "User" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "Customer" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "ProductCategory" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "Product" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "AgencyRateProduct" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "AgencyRateQuantityColumn" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "AgencyRate" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "OfferCode" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "ProductRule" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "ProductCostSlab" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "ProductRateSlab" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "CommissionRule" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "PaymentAccount" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "Vendor" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "JobWork" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "PrintSheet" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "PrintSheetItem" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "SheetStageVendor" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "ItemStageLog" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "Godown" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "Order" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "OrderItem" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "Payment" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "Invoice" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "InvoiceItem" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "PurchaseBill" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "VendorPayment" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "AccountingLedgerEntry" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "AccountingNote" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "Commission" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "CommissionVerification" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "CommissionOverride" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "SalesIncentivePlan" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "Employee" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "CompanyTerms" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "PolicyDocument" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "CompanyHoliday" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "EmployeeKra" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "EmployeeLeaveEntry" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "AttendanceRecord" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "AttendanceImportSession" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "ProductionJob" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "Shipment" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "StatusLog" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "OrderReassuranceLog" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "Lead" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "LeadActivity" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "LeadFollowUp" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "CallLogImport" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "CallLogRecord" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "ContactImport" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "ImportedContact" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "ImportedContactFollowUp" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "MarketingRoiSpend" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "UserTopicProgress" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "QuizAttempt" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "MilestoneAttempt" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "DailyLearningStreak" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "Task" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "CallAnalysis" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "SystemConfig" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "QuoteHistory" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "RewardWallet" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "RewardTransaction" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "BonusActivity" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "BonusClaim" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "CustomerLoyaltyWallet" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "CustomerLoyaltyTransaction" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "Notification" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "PaperPurchaseOrder" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "PaperPurchaseItem" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "PaperInventory" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "PaperTransaction" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "MarketingContact" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "MarketingTemplate" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "MarketingSegment" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "MarketingCampaign" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "MarketingCampaignStep" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "MarketingBroadcastJob" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "MarketingMessageEvent" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "BankImportSession" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "BankTransaction" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "RemittanceImportSession" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "RemittanceRecord" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "ShippingChargeRecord" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "VendorKeyword" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "UserPaymentKeyword" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "ExpenseCategory" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "ExpenseKeyword" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "InHouseStickerStock" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "InHouseStickerTransaction" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "BusinessRule" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "UserActivitySession" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "Complaint" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "ComplaintComment" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "ComplaintAttachment" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "ComplaintStatusLog" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "MachineReading" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "CertificateTemplate" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "CertificateJob" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "EventFlyerTemplate" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "EventPerson" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "Festival" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "EventBrandProfile" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "EventClientBusiness" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "EventClientWishLog" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;
UPDATE "EventSendLog" SET "tenantId" = 'tenant_rareprint_default' WHERE "tenantId" IS NULL;

-- 4) Make tenantId required now that every row has a value.
ALTER TABLE "User" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Customer" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "ProductCategory" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Product" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "AgencyRateProduct" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "AgencyRateQuantityColumn" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "AgencyRate" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "OfferCode" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "ProductRule" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "ProductCostSlab" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "ProductRateSlab" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "CommissionRule" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "PaymentAccount" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Vendor" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "JobWork" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "PrintSheet" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "PrintSheetItem" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "SheetStageVendor" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "ItemStageLog" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Godown" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Order" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "OrderItem" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Payment" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Invoice" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "InvoiceItem" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "PurchaseBill" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "VendorPayment" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "AccountingLedgerEntry" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "AccountingNote" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Commission" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "CommissionVerification" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "CommissionOverride" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "SalesIncentivePlan" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Employee" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "CompanyTerms" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "PolicyDocument" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "CompanyHoliday" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "EmployeeKra" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "EmployeeLeaveEntry" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "AttendanceRecord" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "AttendanceImportSession" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "ProductionJob" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Shipment" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "StatusLog" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "OrderReassuranceLog" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Lead" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "LeadActivity" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "LeadFollowUp" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "CallLogImport" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "CallLogRecord" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "ContactImport" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "ImportedContact" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "ImportedContactFollowUp" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "MarketingRoiSpend" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "UserTopicProgress" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "QuizAttempt" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "MilestoneAttempt" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "DailyLearningStreak" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Task" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "CallAnalysis" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "SystemConfig" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "QuoteHistory" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "RewardWallet" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "RewardTransaction" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "BonusActivity" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "BonusClaim" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "CustomerLoyaltyWallet" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "CustomerLoyaltyTransaction" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Notification" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "PaperPurchaseOrder" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "PaperPurchaseItem" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "PaperInventory" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "PaperTransaction" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "MarketingContact" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "MarketingTemplate" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "MarketingSegment" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "MarketingCampaign" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "MarketingCampaignStep" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "MarketingBroadcastJob" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "MarketingMessageEvent" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "BankImportSession" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "BankTransaction" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "RemittanceImportSession" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "RemittanceRecord" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "ShippingChargeRecord" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "VendorKeyword" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "UserPaymentKeyword" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "ExpenseCategory" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "ExpenseKeyword" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "InHouseStickerStock" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "InHouseStickerTransaction" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "BusinessRule" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "UserActivitySession" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Complaint" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "ComplaintComment" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "ComplaintAttachment" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "ComplaintStatusLog" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "MachineReading" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "CertificateTemplate" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "CertificateJob" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "EventFlyerTemplate" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "EventPerson" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Festival" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "EventBrandProfile" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "EventClientBusiness" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "EventClientWishLog" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "EventSendLog" ALTER COLUMN "tenantId" SET NOT NULL;

-- 5) Foreign key + index on tenantId for every tenant-scoped table.
DO $$ BEGIN
  ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "User_tenantId_idx" ON "User"("tenantId");
DO $$ BEGIN
  ALTER TABLE "Customer" ADD CONSTRAINT "Customer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "Customer_tenantId_idx" ON "Customer"("tenantId");
DO $$ BEGIN
  ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "ProductCategory_tenantId_idx" ON "ProductCategory"("tenantId");
DO $$ BEGIN
  ALTER TABLE "Product" ADD CONSTRAINT "Product_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "Product_tenantId_idx" ON "Product"("tenantId");
DO $$ BEGIN
  ALTER TABLE "AgencyRateProduct" ADD CONSTRAINT "AgencyRateProduct_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "AgencyRateProduct_tenantId_idx" ON "AgencyRateProduct"("tenantId");
DO $$ BEGIN
  ALTER TABLE "AgencyRateQuantityColumn" ADD CONSTRAINT "AgencyRateQuantityColumn_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "AgencyRateQuantityColumn_tenantId_idx" ON "AgencyRateQuantityColumn"("tenantId");
DO $$ BEGIN
  ALTER TABLE "AgencyRate" ADD CONSTRAINT "AgencyRate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "AgencyRate_tenantId_idx" ON "AgencyRate"("tenantId");
DO $$ BEGIN
  ALTER TABLE "OfferCode" ADD CONSTRAINT "OfferCode_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "OfferCode_tenantId_idx" ON "OfferCode"("tenantId");
DO $$ BEGIN
  ALTER TABLE "ProductRule" ADD CONSTRAINT "ProductRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "ProductRule_tenantId_idx" ON "ProductRule"("tenantId");
DO $$ BEGIN
  ALTER TABLE "ProductCostSlab" ADD CONSTRAINT "ProductCostSlab_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "ProductCostSlab_tenantId_idx" ON "ProductCostSlab"("tenantId");
DO $$ BEGIN
  ALTER TABLE "ProductRateSlab" ADD CONSTRAINT "ProductRateSlab_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "ProductRateSlab_tenantId_idx" ON "ProductRateSlab"("tenantId");
DO $$ BEGIN
  ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "CommissionRule_tenantId_idx" ON "CommissionRule"("tenantId");
DO $$ BEGIN
  ALTER TABLE "PaymentAccount" ADD CONSTRAINT "PaymentAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "PaymentAccount_tenantId_idx" ON "PaymentAccount"("tenantId");
DO $$ BEGIN
  ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "Vendor_tenantId_idx" ON "Vendor"("tenantId");
DO $$ BEGIN
  ALTER TABLE "JobWork" ADD CONSTRAINT "JobWork_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "JobWork_tenantId_idx" ON "JobWork"("tenantId");
DO $$ BEGIN
  ALTER TABLE "PrintSheet" ADD CONSTRAINT "PrintSheet_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "PrintSheet_tenantId_idx" ON "PrintSheet"("tenantId");
DO $$ BEGIN
  ALTER TABLE "PrintSheetItem" ADD CONSTRAINT "PrintSheetItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "PrintSheetItem_tenantId_idx" ON "PrintSheetItem"("tenantId");
DO $$ BEGIN
  ALTER TABLE "SheetStageVendor" ADD CONSTRAINT "SheetStageVendor_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "SheetStageVendor_tenantId_idx" ON "SheetStageVendor"("tenantId");
DO $$ BEGIN
  ALTER TABLE "ItemStageLog" ADD CONSTRAINT "ItemStageLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "ItemStageLog_tenantId_idx" ON "ItemStageLog"("tenantId");
DO $$ BEGIN
  ALTER TABLE "Godown" ADD CONSTRAINT "Godown_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "Godown_tenantId_idx" ON "Godown"("tenantId");
DO $$ BEGIN
  ALTER TABLE "Order" ADD CONSTRAINT "Order_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "Order_tenantId_idx" ON "Order"("tenantId");
DO $$ BEGIN
  ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "OrderItem_tenantId_idx" ON "OrderItem"("tenantId");
DO $$ BEGIN
  ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "Payment_tenantId_idx" ON "Payment"("tenantId");
DO $$ BEGIN
  ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "Invoice_tenantId_idx" ON "Invoice"("tenantId");
DO $$ BEGIN
  ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "InvoiceItem_tenantId_idx" ON "InvoiceItem"("tenantId");
DO $$ BEGIN
  ALTER TABLE "PurchaseBill" ADD CONSTRAINT "PurchaseBill_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "PurchaseBill_tenantId_idx" ON "PurchaseBill"("tenantId");
DO $$ BEGIN
  ALTER TABLE "VendorPayment" ADD CONSTRAINT "VendorPayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "VendorPayment_tenantId_idx" ON "VendorPayment"("tenantId");
DO $$ BEGIN
  ALTER TABLE "AccountingLedgerEntry" ADD CONSTRAINT "AccountingLedgerEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "AccountingLedgerEntry_tenantId_idx" ON "AccountingLedgerEntry"("tenantId");
DO $$ BEGIN
  ALTER TABLE "AccountingNote" ADD CONSTRAINT "AccountingNote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "AccountingNote_tenantId_idx" ON "AccountingNote"("tenantId");
DO $$ BEGIN
  ALTER TABLE "Commission" ADD CONSTRAINT "Commission_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "Commission_tenantId_idx" ON "Commission"("tenantId");
DO $$ BEGIN
  ALTER TABLE "CommissionVerification" ADD CONSTRAINT "CommissionVerification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "CommissionVerification_tenantId_idx" ON "CommissionVerification"("tenantId");
DO $$ BEGIN
  ALTER TABLE "CommissionOverride" ADD CONSTRAINT "CommissionOverride_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "CommissionOverride_tenantId_idx" ON "CommissionOverride"("tenantId");
DO $$ BEGIN
  ALTER TABLE "SalesIncentivePlan" ADD CONSTRAINT "SalesIncentivePlan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "SalesIncentivePlan_tenantId_idx" ON "SalesIncentivePlan"("tenantId");
DO $$ BEGIN
  ALTER TABLE "Employee" ADD CONSTRAINT "Employee_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "Employee_tenantId_idx" ON "Employee"("tenantId");
DO $$ BEGIN
  ALTER TABLE "CompanyTerms" ADD CONSTRAINT "CompanyTerms_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "CompanyTerms_tenantId_idx" ON "CompanyTerms"("tenantId");
DO $$ BEGIN
  ALTER TABLE "PolicyDocument" ADD CONSTRAINT "PolicyDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "PolicyDocument_tenantId_idx" ON "PolicyDocument"("tenantId");
DO $$ BEGIN
  ALTER TABLE "CompanyHoliday" ADD CONSTRAINT "CompanyHoliday_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "CompanyHoliday_tenantId_idx" ON "CompanyHoliday"("tenantId");
DO $$ BEGIN
  ALTER TABLE "EmployeeKra" ADD CONSTRAINT "EmployeeKra_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "EmployeeKra_tenantId_idx" ON "EmployeeKra"("tenantId");
DO $$ BEGIN
  ALTER TABLE "EmployeeLeaveEntry" ADD CONSTRAINT "EmployeeLeaveEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "EmployeeLeaveEntry_tenantId_idx" ON "EmployeeLeaveEntry"("tenantId");
DO $$ BEGIN
  ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "AttendanceRecord_tenantId_idx" ON "AttendanceRecord"("tenantId");
DO $$ BEGIN
  ALTER TABLE "AttendanceImportSession" ADD CONSTRAINT "AttendanceImportSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "AttendanceImportSession_tenantId_idx" ON "AttendanceImportSession"("tenantId");
DO $$ BEGIN
  ALTER TABLE "ProductionJob" ADD CONSTRAINT "ProductionJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "ProductionJob_tenantId_idx" ON "ProductionJob"("tenantId");
DO $$ BEGIN
  ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "Shipment_tenantId_idx" ON "Shipment"("tenantId");
DO $$ BEGIN
  ALTER TABLE "StatusLog" ADD CONSTRAINT "StatusLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "StatusLog_tenantId_idx" ON "StatusLog"("tenantId");
DO $$ BEGIN
  ALTER TABLE "OrderReassuranceLog" ADD CONSTRAINT "OrderReassuranceLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "OrderReassuranceLog_tenantId_idx" ON "OrderReassuranceLog"("tenantId");
DO $$ BEGIN
  ALTER TABLE "Lead" ADD CONSTRAINT "Lead_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "Lead_tenantId_idx" ON "Lead"("tenantId");
DO $$ BEGIN
  ALTER TABLE "LeadActivity" ADD CONSTRAINT "LeadActivity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "LeadActivity_tenantId_idx" ON "LeadActivity"("tenantId");
DO $$ BEGIN
  ALTER TABLE "LeadFollowUp" ADD CONSTRAINT "LeadFollowUp_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "LeadFollowUp_tenantId_idx" ON "LeadFollowUp"("tenantId");
DO $$ BEGIN
  ALTER TABLE "CallLogImport" ADD CONSTRAINT "CallLogImport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "CallLogImport_tenantId_idx" ON "CallLogImport"("tenantId");
DO $$ BEGIN
  ALTER TABLE "CallLogRecord" ADD CONSTRAINT "CallLogRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "CallLogRecord_tenantId_idx" ON "CallLogRecord"("tenantId");
DO $$ BEGIN
  ALTER TABLE "ContactImport" ADD CONSTRAINT "ContactImport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "ContactImport_tenantId_idx" ON "ContactImport"("tenantId");
DO $$ BEGIN
  ALTER TABLE "ImportedContact" ADD CONSTRAINT "ImportedContact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "ImportedContact_tenantId_idx" ON "ImportedContact"("tenantId");
DO $$ BEGIN
  ALTER TABLE "ImportedContactFollowUp" ADD CONSTRAINT "ImportedContactFollowUp_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "ImportedContactFollowUp_tenantId_idx" ON "ImportedContactFollowUp"("tenantId");
DO $$ BEGIN
  ALTER TABLE "MarketingRoiSpend" ADD CONSTRAINT "MarketingRoiSpend_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "MarketingRoiSpend_tenantId_idx" ON "MarketingRoiSpend"("tenantId");
DO $$ BEGIN
  ALTER TABLE "UserTopicProgress" ADD CONSTRAINT "UserTopicProgress_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "UserTopicProgress_tenantId_idx" ON "UserTopicProgress"("tenantId");
DO $$ BEGIN
  ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "QuizAttempt_tenantId_idx" ON "QuizAttempt"("tenantId");
DO $$ BEGIN
  ALTER TABLE "MilestoneAttempt" ADD CONSTRAINT "MilestoneAttempt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "MilestoneAttempt_tenantId_idx" ON "MilestoneAttempt"("tenantId");
DO $$ BEGIN
  ALTER TABLE "DailyLearningStreak" ADD CONSTRAINT "DailyLearningStreak_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "DailyLearningStreak_tenantId_idx" ON "DailyLearningStreak"("tenantId");
DO $$ BEGIN
  ALTER TABLE "Task" ADD CONSTRAINT "Task_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "Task_tenantId_idx" ON "Task"("tenantId");
DO $$ BEGIN
  ALTER TABLE "CallAnalysis" ADD CONSTRAINT "CallAnalysis_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "CallAnalysis_tenantId_idx" ON "CallAnalysis"("tenantId");
DO $$ BEGIN
  ALTER TABLE "SystemConfig" ADD CONSTRAINT "SystemConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "SystemConfig_tenantId_idx" ON "SystemConfig"("tenantId");
DO $$ BEGIN
  ALTER TABLE "QuoteHistory" ADD CONSTRAINT "QuoteHistory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "QuoteHistory_tenantId_idx" ON "QuoteHistory"("tenantId");
DO $$ BEGIN
  ALTER TABLE "RewardWallet" ADD CONSTRAINT "RewardWallet_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "RewardWallet_tenantId_idx" ON "RewardWallet"("tenantId");
DO $$ BEGIN
  ALTER TABLE "RewardTransaction" ADD CONSTRAINT "RewardTransaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "RewardTransaction_tenantId_idx" ON "RewardTransaction"("tenantId");
DO $$ BEGIN
  ALTER TABLE "BonusActivity" ADD CONSTRAINT "BonusActivity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "BonusActivity_tenantId_idx" ON "BonusActivity"("tenantId");
DO $$ BEGIN
  ALTER TABLE "BonusClaim" ADD CONSTRAINT "BonusClaim_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "BonusClaim_tenantId_idx" ON "BonusClaim"("tenantId");
DO $$ BEGIN
  ALTER TABLE "CustomerLoyaltyWallet" ADD CONSTRAINT "CustomerLoyaltyWallet_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "CustomerLoyaltyWallet_tenantId_idx" ON "CustomerLoyaltyWallet"("tenantId");
DO $$ BEGIN
  ALTER TABLE "CustomerLoyaltyTransaction" ADD CONSTRAINT "CustomerLoyaltyTransaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "CustomerLoyaltyTransaction_tenantId_idx" ON "CustomerLoyaltyTransaction"("tenantId");
DO $$ BEGIN
  ALTER TABLE "Notification" ADD CONSTRAINT "Notification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "Notification_tenantId_idx" ON "Notification"("tenantId");
DO $$ BEGIN
  ALTER TABLE "PaperPurchaseOrder" ADD CONSTRAINT "PaperPurchaseOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "PaperPurchaseOrder_tenantId_idx" ON "PaperPurchaseOrder"("tenantId");
DO $$ BEGIN
  ALTER TABLE "PaperPurchaseItem" ADD CONSTRAINT "PaperPurchaseItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "PaperPurchaseItem_tenantId_idx" ON "PaperPurchaseItem"("tenantId");
DO $$ BEGIN
  ALTER TABLE "PaperInventory" ADD CONSTRAINT "PaperInventory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "PaperInventory_tenantId_idx" ON "PaperInventory"("tenantId");
DO $$ BEGIN
  ALTER TABLE "PaperTransaction" ADD CONSTRAINT "PaperTransaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "PaperTransaction_tenantId_idx" ON "PaperTransaction"("tenantId");
DO $$ BEGIN
  ALTER TABLE "MarketingContact" ADD CONSTRAINT "MarketingContact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "MarketingContact_tenantId_idx" ON "MarketingContact"("tenantId");
DO $$ BEGIN
  ALTER TABLE "MarketingTemplate" ADD CONSTRAINT "MarketingTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "MarketingTemplate_tenantId_idx" ON "MarketingTemplate"("tenantId");
DO $$ BEGIN
  ALTER TABLE "MarketingSegment" ADD CONSTRAINT "MarketingSegment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "MarketingSegment_tenantId_idx" ON "MarketingSegment"("tenantId");
DO $$ BEGIN
  ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "MarketingCampaign_tenantId_idx" ON "MarketingCampaign"("tenantId");
DO $$ BEGIN
  ALTER TABLE "MarketingCampaignStep" ADD CONSTRAINT "MarketingCampaignStep_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "MarketingCampaignStep_tenantId_idx" ON "MarketingCampaignStep"("tenantId");
DO $$ BEGIN
  ALTER TABLE "MarketingBroadcastJob" ADD CONSTRAINT "MarketingBroadcastJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "MarketingBroadcastJob_tenantId_idx" ON "MarketingBroadcastJob"("tenantId");
DO $$ BEGIN
  ALTER TABLE "MarketingMessageEvent" ADD CONSTRAINT "MarketingMessageEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "MarketingMessageEvent_tenantId_idx" ON "MarketingMessageEvent"("tenantId");
DO $$ BEGIN
  ALTER TABLE "BankImportSession" ADD CONSTRAINT "BankImportSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "BankImportSession_tenantId_idx" ON "BankImportSession"("tenantId");
DO $$ BEGIN
  ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "BankTransaction_tenantId_idx" ON "BankTransaction"("tenantId");
DO $$ BEGIN
  ALTER TABLE "RemittanceImportSession" ADD CONSTRAINT "RemittanceImportSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "RemittanceImportSession_tenantId_idx" ON "RemittanceImportSession"("tenantId");
DO $$ BEGIN
  ALTER TABLE "RemittanceRecord" ADD CONSTRAINT "RemittanceRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "RemittanceRecord_tenantId_idx" ON "RemittanceRecord"("tenantId");
DO $$ BEGIN
  ALTER TABLE "ShippingChargeRecord" ADD CONSTRAINT "ShippingChargeRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "ShippingChargeRecord_tenantId_idx" ON "ShippingChargeRecord"("tenantId");
DO $$ BEGIN
  ALTER TABLE "VendorKeyword" ADD CONSTRAINT "VendorKeyword_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "VendorKeyword_tenantId_idx" ON "VendorKeyword"("tenantId");
DO $$ BEGIN
  ALTER TABLE "UserPaymentKeyword" ADD CONSTRAINT "UserPaymentKeyword_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "UserPaymentKeyword_tenantId_idx" ON "UserPaymentKeyword"("tenantId");
DO $$ BEGIN
  ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "ExpenseCategory_tenantId_idx" ON "ExpenseCategory"("tenantId");
DO $$ BEGIN
  ALTER TABLE "ExpenseKeyword" ADD CONSTRAINT "ExpenseKeyword_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "ExpenseKeyword_tenantId_idx" ON "ExpenseKeyword"("tenantId");
DO $$ BEGIN
  ALTER TABLE "InHouseStickerStock" ADD CONSTRAINT "InHouseStickerStock_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "InHouseStickerStock_tenantId_idx" ON "InHouseStickerStock"("tenantId");
DO $$ BEGIN
  ALTER TABLE "InHouseStickerTransaction" ADD CONSTRAINT "InHouseStickerTransaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "InHouseStickerTransaction_tenantId_idx" ON "InHouseStickerTransaction"("tenantId");
DO $$ BEGIN
  ALTER TABLE "BusinessRule" ADD CONSTRAINT "BusinessRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "BusinessRule_tenantId_idx" ON "BusinessRule"("tenantId");
DO $$ BEGIN
  ALTER TABLE "UserActivitySession" ADD CONSTRAINT "UserActivitySession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "UserActivitySession_tenantId_idx" ON "UserActivitySession"("tenantId");
DO $$ BEGIN
  ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "Complaint_tenantId_idx" ON "Complaint"("tenantId");
DO $$ BEGIN
  ALTER TABLE "ComplaintComment" ADD CONSTRAINT "ComplaintComment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "ComplaintComment_tenantId_idx" ON "ComplaintComment"("tenantId");
DO $$ BEGIN
  ALTER TABLE "ComplaintAttachment" ADD CONSTRAINT "ComplaintAttachment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "ComplaintAttachment_tenantId_idx" ON "ComplaintAttachment"("tenantId");
DO $$ BEGIN
  ALTER TABLE "ComplaintStatusLog" ADD CONSTRAINT "ComplaintStatusLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "ComplaintStatusLog_tenantId_idx" ON "ComplaintStatusLog"("tenantId");
DO $$ BEGIN
  ALTER TABLE "MachineReading" ADD CONSTRAINT "MachineReading_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "MachineReading_tenantId_idx" ON "MachineReading"("tenantId");
DO $$ BEGIN
  ALTER TABLE "CertificateTemplate" ADD CONSTRAINT "CertificateTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "CertificateTemplate_tenantId_idx" ON "CertificateTemplate"("tenantId");
DO $$ BEGIN
  ALTER TABLE "CertificateJob" ADD CONSTRAINT "CertificateJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "CertificateJob_tenantId_idx" ON "CertificateJob"("tenantId");
DO $$ BEGIN
  ALTER TABLE "EventFlyerTemplate" ADD CONSTRAINT "EventFlyerTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "EventFlyerTemplate_tenantId_idx" ON "EventFlyerTemplate"("tenantId");
DO $$ BEGIN
  ALTER TABLE "EventPerson" ADD CONSTRAINT "EventPerson_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "EventPerson_tenantId_idx" ON "EventPerson"("tenantId");
DO $$ BEGIN
  ALTER TABLE "Festival" ADD CONSTRAINT "Festival_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "Festival_tenantId_idx" ON "Festival"("tenantId");
DO $$ BEGIN
  ALTER TABLE "EventBrandProfile" ADD CONSTRAINT "EventBrandProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "EventBrandProfile_tenantId_idx" ON "EventBrandProfile"("tenantId");
DO $$ BEGIN
  ALTER TABLE "EventClientBusiness" ADD CONSTRAINT "EventClientBusiness_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "EventClientBusiness_tenantId_idx" ON "EventClientBusiness"("tenantId");
DO $$ BEGIN
  ALTER TABLE "EventClientWishLog" ADD CONSTRAINT "EventClientWishLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "EventClientWishLog_tenantId_idx" ON "EventClientWishLog"("tenantId");
DO $$ BEGIN
  ALTER TABLE "EventSendLog" ADD CONSTRAINT "EventSendLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "EventSendLog_tenantId_idx" ON "EventSendLog"("tenantId");

-- 6) Convert formerly-global single-field unique constraints to composite
--    (tenantId, field) so each tenant gets its own numbering space.
DROP INDEX IF EXISTS "User_email_key";
CREATE UNIQUE INDEX IF NOT EXISTS "User_tenantId_email_key" ON "User"("tenantId", "email");
DROP INDEX IF EXISTS "Customer_customerCode_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Customer_tenantId_customerCode_key" ON "Customer"("tenantId", "customerCode");
DROP INDEX IF EXISTS "ProductCategory_name_key";
CREATE UNIQUE INDEX IF NOT EXISTS "ProductCategory_tenantId_name_key" ON "ProductCategory"("tenantId", "name");
DROP INDEX IF EXISTS "Product_sku_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Product_tenantId_sku_key" ON "Product"("tenantId", "sku");
DROP INDEX IF EXISTS "AgencyRateProduct_productId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "AgencyRateProduct_tenantId_productId_key" ON "AgencyRateProduct"("tenantId", "productId");
DROP INDEX IF EXISTS "AgencyRateQuantityColumn_quantity_key";
CREATE UNIQUE INDEX IF NOT EXISTS "AgencyRateQuantityColumn_tenantId_quantity_key" ON "AgencyRateQuantityColumn"("tenantId", "quantity");
DROP INDEX IF EXISTS "OfferCode_code_key";
CREATE UNIQUE INDEX IF NOT EXISTS "OfferCode_tenantId_code_key" ON "OfferCode"("tenantId", "code");
DROP INDEX IF EXISTS "ProductRule_productId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "ProductRule_tenantId_productId_key" ON "ProductRule"("tenantId", "productId");
DROP INDEX IF EXISTS "JobWork_poNumber_key";
CREATE UNIQUE INDEX IF NOT EXISTS "JobWork_tenantId_poNumber_key" ON "JobWork"("tenantId", "poNumber");
DROP INDEX IF EXISTS "PrintSheet_sheetNo_key";
CREATE UNIQUE INDEX IF NOT EXISTS "PrintSheet_tenantId_sheetNo_key" ON "PrintSheet"("tenantId", "sheetNo");
DROP INDEX IF EXISTS "Godown_code_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Godown_tenantId_code_key" ON "Godown"("tenantId", "code");
DROP INDEX IF EXISTS "Order_orderNumber_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Order_tenantId_orderNumber_key" ON "Order"("tenantId", "orderNumber");
DROP INDEX IF EXISTS "Invoice_orderId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_tenantId_orderId_key" ON "Invoice"("tenantId", "orderId");
DROP INDEX IF EXISTS "Invoice_invoiceNumber_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_tenantId_invoiceNumber_key" ON "Invoice"("tenantId", "invoiceNumber");
DROP INDEX IF EXISTS "AccountingNote_noteNumber_key";
CREATE UNIQUE INDEX IF NOT EXISTS "AccountingNote_tenantId_noteNumber_key" ON "AccountingNote"("tenantId", "noteNumber");
DROP INDEX IF EXISTS "CommissionOverride_orderItemId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "CommissionOverride_tenantId_orderItemId_key" ON "CommissionOverride"("tenantId", "orderItemId");
DROP INDEX IF EXISTS "SalesIncentivePlan_label_key";
CREATE UNIQUE INDEX IF NOT EXISTS "SalesIncentivePlan_tenantId_label_key" ON "SalesIncentivePlan"("tenantId", "label");
DROP INDEX IF EXISTS "Employee_employeeCode_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Employee_tenantId_employeeCode_key" ON "Employee"("tenantId", "employeeCode");
DROP INDEX IF EXISTS "Employee_biometricId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Employee_tenantId_biometricId_key" ON "Employee"("tenantId", "biometricId");
DROP INDEX IF EXISTS "Employee_userId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Employee_tenantId_userId_key" ON "Employee"("tenantId", "userId");
DROP INDEX IF EXISTS "CompanyTerms_version_key";
CREATE UNIQUE INDEX IF NOT EXISTS "CompanyTerms_tenantId_version_key" ON "CompanyTerms"("tenantId", "version");
DROP INDEX IF EXISTS "CompanyHoliday_date_key";
CREATE UNIQUE INDEX IF NOT EXISTS "CompanyHoliday_tenantId_date_key" ON "CompanyHoliday"("tenantId", "date");
DROP INDEX IF EXISTS "ProductionJob_jobCode_key";
CREATE UNIQUE INDEX IF NOT EXISTS "ProductionJob_tenantId_jobCode_key" ON "ProductionJob"("tenantId", "jobCode");
DROP INDEX IF EXISTS "Shipment_shipmentNumber_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Shipment_tenantId_shipmentNumber_key" ON "Shipment"("tenantId", "shipmentNumber");
DROP INDEX IF EXISTS "ImportedContact_phone_key";
CREATE UNIQUE INDEX IF NOT EXISTS "ImportedContact_tenantId_phone_key" ON "ImportedContact"("tenantId", "phone");
DROP INDEX IF EXISTS "MarketingRoiSpend_monthKey_key";
CREATE UNIQUE INDEX IF NOT EXISTS "MarketingRoiSpend_tenantId_monthKey_key" ON "MarketingRoiSpend"("tenantId", "monthKey");
DROP INDEX IF EXISTS "RewardWallet_userId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "RewardWallet_tenantId_userId_key" ON "RewardWallet"("tenantId", "userId");
DROP INDEX IF EXISTS "CustomerLoyaltyWallet_phone_key";
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerLoyaltyWallet_tenantId_phone_key" ON "CustomerLoyaltyWallet"("tenantId", "phone");
DROP INDEX IF EXISTS "PaperPurchaseOrder_poNumber_key";
CREATE UNIQUE INDEX IF NOT EXISTS "PaperPurchaseOrder_tenantId_poNumber_key" ON "PaperPurchaseOrder"("tenantId", "poNumber");
DROP INDEX IF EXISTS "MarketingContact_mobile_key";
CREATE UNIQUE INDEX IF NOT EXISTS "MarketingContact_tenantId_mobile_key" ON "MarketingContact"("tenantId", "mobile");
DROP INDEX IF EXISTS "RemittanceRecord_importKey_key";
CREATE UNIQUE INDEX IF NOT EXISTS "RemittanceRecord_tenantId_importKey_key" ON "RemittanceRecord"("tenantId", "importKey");
DROP INDEX IF EXISTS "RemittanceRecord_postedPaymentId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "RemittanceRecord_tenantId_postedPaymentId_key" ON "RemittanceRecord"("tenantId", "postedPaymentId");
DROP INDEX IF EXISTS "ShippingChargeRecord_awbNumber_key";
CREATE UNIQUE INDEX IF NOT EXISTS "ShippingChargeRecord_tenantId_awbNumber_key" ON "ShippingChargeRecord"("tenantId", "awbNumber");
DROP INDEX IF EXISTS "VendorKeyword_keyword_key";
CREATE UNIQUE INDEX IF NOT EXISTS "VendorKeyword_tenantId_keyword_key" ON "VendorKeyword"("tenantId", "keyword");
DROP INDEX IF EXISTS "UserPaymentKeyword_keyword_key";
CREATE UNIQUE INDEX IF NOT EXISTS "UserPaymentKeyword_tenantId_keyword_key" ON "UserPaymentKeyword"("tenantId", "keyword");
DROP INDEX IF EXISTS "ExpenseCategory_name_key";
CREATE UNIQUE INDEX IF NOT EXISTS "ExpenseCategory_tenantId_name_key" ON "ExpenseCategory"("tenantId", "name");
DROP INDEX IF EXISTS "ExpenseKeyword_keyword_key";
CREATE UNIQUE INDEX IF NOT EXISTS "ExpenseKeyword_tenantId_keyword_key" ON "ExpenseKeyword"("tenantId", "keyword");
DROP INDEX IF EXISTS "BusinessRule_ruleCode_key";
CREATE UNIQUE INDEX IF NOT EXISTS "BusinessRule_tenantId_ruleCode_key" ON "BusinessRule"("tenantId", "ruleCode");
DROP INDEX IF EXISTS "Complaint_ticketNumber_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Complaint_tenantId_ticketNumber_key" ON "Complaint"("tenantId", "ticketNumber");

-- 7) Convert formerly-global composite unique constraints the same way.
DROP INDEX IF EXISTS "AgencyRate_productId_quantity_key";
CREATE UNIQUE INDEX IF NOT EXISTS "AgencyRate_tenantId_productId_quantity_key" ON "AgencyRate"("tenantId", "productId", "quantity");
DROP INDEX IF EXISTS "PurchaseBill_vendorId_billNumber_key";
CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseBill_tenantId_vendorId_billNumber_key" ON "PurchaseBill"("tenantId", "vendorId", "billNumber");
DROP INDEX IF EXISTS "CommissionVerification_agentId_year_month_key";
CREATE UNIQUE INDEX IF NOT EXISTS "CommissionVerification_tenantId_agentId_year_month_key" ON "CommissionVerification"("tenantId", "agentId", "year", "month");
DROP INDEX IF EXISTS "AttendanceRecord_employeeId_date_key";
CREATE UNIQUE INDEX IF NOT EXISTS "AttendanceRecord_tenantId_employeeId_date_key" ON "AttendanceRecord"("tenantId", "employeeId", "date");
DROP INDEX IF EXISTS "CallLogRecord_agentId_phone_calledAt_key";
CREATE UNIQUE INDEX IF NOT EXISTS "CallLogRecord_tenantId_agentId_phone_calledAt_key" ON "CallLogRecord"("tenantId", "agentId", "phone", "calledAt");
DROP INDEX IF EXISTS "UserTopicProgress_userId_topicId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "UserTopicProgress_tenantId_userId_topicId_key" ON "UserTopicProgress"("tenantId", "userId", "topicId");
DROP INDEX IF EXISTS "DailyLearningStreak_userId_date_key";
CREATE UNIQUE INDEX IF NOT EXISTS "DailyLearningStreak_tenantId_userId_date_key" ON "DailyLearningStreak"("tenantId", "userId", "date");
DROP INDEX IF EXISTS "CustomerLoyaltyTransaction_orderId_type_key";
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerLoyaltyTransaction_tenantId_orderId_type_key" ON "CustomerLoyaltyTransaction"("tenantId", "orderId", "type");
DROP INDEX IF EXISTS "PaperInventory_pressId_gsm_quality_key";
CREATE UNIQUE INDEX IF NOT EXISTS "PaperInventory_tenantId_pressId_gsm_quality_key" ON "PaperInventory"("tenantId", "pressId", "gsm", "quality");
DROP INDEX IF EXISTS "MarketingCampaignStep_campaignId_stepOrder_key";
CREATE UNIQUE INDEX IF NOT EXISTS "MarketingCampaignStep_tenantId_campaignId_stepOrder_key" ON "MarketingCampaignStep"("tenantId", "campaignId", "stepOrder");
DROP INDEX IF EXISTS "MarketingBroadcastJob_campaignId_stepId_contactId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "MarketingBroadcastJob_tenantId_campaignId_stepId_contactId_key" ON "MarketingBroadcastJob"("tenantId", "campaignId", "stepId", "contactId");
DROP INDEX IF EXISTS "BankTransaction_accountNumber_importKey_key";
CREATE UNIQUE INDEX IF NOT EXISTS "BankTransaction_tenantId_accountNumber_importKey_key" ON "BankTransaction"("tenantId", "accountNumber", "importKey");

COMMIT;
