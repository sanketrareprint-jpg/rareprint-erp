-- CreateEnum
CREATE TYPE "BankImportStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "BankTxnType" AS ENUM ('CR', 'DR');

-- CreateEnum
CREATE TYPE "BankReconcileStatus" AS ENUM ('UNMATCHED', 'MATCHED_PAYMENT', 'MATCHED_VENDOR', 'MATCHED_EXPENSE', 'MANUAL_REVIEW', 'IGNORED');

-- CreateTable: BankImportSession
CREATE TABLE "BankImportSession" (
    "id"              TEXT NOT NULL,
    "accountNumber"   TEXT NOT NULL,
    "fileName"        TEXT NOT NULL,
    "importedById"    TEXT NOT NULL,
    "rowsFound"       INTEGER NOT NULL DEFAULT 0,
    "rowsImported"    INTEGER NOT NULL DEFAULT 0,
    "rowsSkipped"     INTEGER NOT NULL DEFAULT 0,
    "lastSrlImported" INTEGER,
    "lastBalance"     DECIMAL(14,2),
    "status"          "BankImportStatus" NOT NULL DEFAULT 'PROCESSING',
    "errorMessage"    TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankImportSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable: BankTransaction
CREATE TABLE "BankTransaction" (
    "id"                TEXT NOT NULL,
    "sessionId"         TEXT NOT NULL,
    "accountNumber"     TEXT NOT NULL,
    "srl"               INTEGER NOT NULL,
    "txnDate"           TIMESTAMP(3) NOT NULL,
    "valueDate"         TIMESTAMP(3) NOT NULL,
    "description"       TEXT NOT NULL,
    "chequeNo"          TEXT,
    "crDr"              "BankTxnType" NOT NULL,
    "amount"            DECIMAL(14,2) NOT NULL,
    "balance"           DECIMAL(14,2) NOT NULL,
    "reconcileStatus"   "BankReconcileStatus" NOT NULL DEFAULT 'UNMATCHED',
    "matchedPaymentId"  TEXT,
    "matchedVendorId"   TEXT,
    "expenseCategoryId" TEXT,
    "reviewNote"        TEXT,
    "reconciledAt"      TIMESTAMP(3),
    "reconciledById"    TEXT,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable: VendorKeyword
CREATE TABLE "VendorKeyword" (
    "id"        TEXT NOT NULL,
    "keyword"   TEXT NOT NULL,
    "vendorId"  TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorKeyword_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ExpenseCategory
CREATE TABLE "ExpenseCategory" (
    "id"          TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "description" TEXT,
    "isActive"    BOOLEAN NOT NULL DEFAULT true,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ExpenseKeyword
CREATE TABLE "ExpenseKeyword" (
    "id"         TEXT NOT NULL,
    "keyword"    TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseKeyword_pkey" PRIMARY KEY ("id")
);

-- Unique constraints
ALTER TABLE "BankTransaction"  ADD CONSTRAINT "BankTransaction_accountNumber_srl_key"  UNIQUE ("accountNumber", "srl");
ALTER TABLE "VendorKeyword"    ADD CONSTRAINT "VendorKeyword_keyword_key"               UNIQUE ("keyword");
ALTER TABLE "ExpenseCategory"  ADD CONSTRAINT "ExpenseCategory_name_key"                UNIQUE ("name");
ALTER TABLE "ExpenseKeyword"   ADD CONSTRAINT "ExpenseKeyword_keyword_key"              UNIQUE ("keyword");

-- Indexes
CREATE INDEX "BankImportSession_accountNumber_createdAt_idx" ON "BankImportSession"("accountNumber", "createdAt");
CREATE INDEX "BankTransaction_accountNumber_txnDate_idx"     ON "BankTransaction"("accountNumber", "txnDate");
CREATE INDEX "BankTransaction_reconcileStatus_idx"           ON "BankTransaction"("reconcileStatus");
CREATE INDEX "BankTransaction_txnDate_idx"                   ON "BankTransaction"("txnDate");

-- Foreign keys
ALTER TABLE "BankImportSession"
    ADD CONSTRAINT "BankImportSession_importedById_fkey"
    FOREIGN KEY ("importedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BankTransaction"
    ADD CONSTRAINT "BankTransaction_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "BankImportSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BankTransaction"
    ADD CONSTRAINT "BankTransaction_matchedPaymentId_fkey"
    FOREIGN KEY ("matchedPaymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BankTransaction"
    ADD CONSTRAINT "BankTransaction_matchedVendorId_fkey"
    FOREIGN KEY ("matchedVendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BankTransaction"
    ADD CONSTRAINT "BankTransaction_expenseCategoryId_fkey"
    FOREIGN KEY ("expenseCategoryId") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BankTransaction"
    ADD CONSTRAINT "BankTransaction_reconciledById_fkey"
    FOREIGN KEY ("reconciledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "VendorKeyword"
    ADD CONSTRAINT "VendorKeyword_vendorId_fkey"
    FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExpenseKeyword"
    ADD CONSTRAINT "ExpenseKeyword_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
