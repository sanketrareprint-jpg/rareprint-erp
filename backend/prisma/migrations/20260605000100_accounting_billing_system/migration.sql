CREATE TYPE "GstTreatment" AS ENUM ('INTRA_STATE', 'INTER_STATE', 'EXPORT', 'UNREGISTERED');
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'CANCELLED');
CREATE TYPE "WhatsAppDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');
CREATE TYPE "PurchaseBillStatus" AS ENUM ('OPEN', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');
CREATE TYPE "LedgerEntryType" AS ENUM ('SALE', 'PURCHASE', 'PAYMENT_IN', 'PAYMENT_OUT', 'CREDIT_NOTE', 'DEBIT_NOTE', 'GST', 'ADJUSTMENT');
CREATE TYPE "AccountingNoteType" AS ENUM ('CREDIT_NOTE', 'DEBIT_NOTE');
CREATE TYPE "AccountingPartyType" AS ENUM ('CUSTOMER', 'VENDOR');
CREATE TYPE "AccountingNoteStatus" AS ENUM ('ISSUED', 'CANCELLED');

ALTER TABLE "Invoice"
  ADD COLUMN "discountAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "taxableAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "cgstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "sgstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "igstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "gstTreatment" "GstTreatment" NOT NULL DEFAULT 'INTRA_STATE',
  ADD COLUMN "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
  ADD COLUMN "whatsappStatus" "WhatsAppDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "whatsappSentAt" TIMESTAMP(3),
  ADD COLUMN "whatsappError" TEXT;

UPDATE "Invoice"
SET "taxableAmount" = "subtotal" - "discountAmount"
WHERE "taxableAmount" = 0;

CREATE TABLE "InvoiceItem" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "sku" TEXT,
  "hsnSac" TEXT,
  "quantity" INTEGER NOT NULL,
  "unitPrice" DECIMAL(12,2) NOT NULL,
  "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "taxableAmount" DECIMAL(14,2) NOT NULL,
  "gstRatePct" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "cgstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "sgstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "igstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "lineTotal" DECIMAL(14,2) NOT NULL,
  CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PurchaseBill" (
  "id" TEXT NOT NULL,
  "vendorId" TEXT NOT NULL,
  "billNumber" TEXT NOT NULL,
  "billDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dueDate" TIMESTAMP(3),
  "subtotal" DECIMAL(14,2) NOT NULL,
  "taxableAmount" DECIMAL(14,2) NOT NULL,
  "cgstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "sgstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "igstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "totalAmount" DECIMAL(14,2) NOT NULL,
  "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "balanceAmount" DECIMAL(14,2) NOT NULL,
  "gstTreatment" "GstTreatment" NOT NULL DEFAULT 'INTRA_STATE',
  "status" "PurchaseBillStatus" NOT NULL DEFAULT 'OPEN',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchaseBill_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VendorPayment" (
  "id" TEXT NOT NULL,
  "vendorId" TEXT NOT NULL,
  "purchaseBillId" TEXT,
  "paymentAccountId" TEXT NOT NULL,
  "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "amount" DECIMAL(14,2) NOT NULL,
  "method" "PaymentMethod" NOT NULL,
  "referenceNumber" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VendorPayment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountingLedgerEntry" (
  "id" TEXT NOT NULL,
  "entryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "entryType" "LedgerEntryType" NOT NULL,
  "accountName" TEXT NOT NULL,
  "debitAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "creditAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "narration" TEXT,
  "referenceType" TEXT NOT NULL,
  "referenceId" TEXT NOT NULL,
  "customerId" TEXT,
  "vendorId" TEXT,
  "orderId" TEXT,
  "invoiceId" TEXT,
  "purchaseBillId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountingLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountingNote" (
  "id" TEXT NOT NULL,
  "noteNumber" TEXT NOT NULL,
  "noteType" "AccountingNoteType" NOT NULL,
  "partyType" "AccountingPartyType" NOT NULL,
  "customerId" TEXT,
  "vendorId" TEXT,
  "invoiceId" TEXT,
  "purchaseBillId" TEXT,
  "noteDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reason" TEXT NOT NULL,
  "taxableAmount" DECIMAL(14,2) NOT NULL,
  "cgstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "sgstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "igstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "totalAmount" DECIMAL(14,2) NOT NULL,
  "status" "AccountingNoteStatus" NOT NULL DEFAULT 'ISSUED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountingNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PurchaseBill_vendorId_billNumber_key" ON "PurchaseBill"("vendorId", "billNumber");
CREATE UNIQUE INDEX "AccountingNote_noteNumber_key" ON "AccountingNote"("noteNumber");
CREATE INDEX "InvoiceItem_invoiceId_idx" ON "InvoiceItem"("invoiceId");
CREATE INDEX "PurchaseBill_vendorId_billDate_idx" ON "PurchaseBill"("vendorId", "billDate");
CREATE INDEX "PurchaseBill_status_dueDate_idx" ON "PurchaseBill"("status", "dueDate");
CREATE INDEX "VendorPayment_vendorId_paymentDate_idx" ON "VendorPayment"("vendorId", "paymentDate");
CREATE INDEX "VendorPayment_purchaseBillId_idx" ON "VendorPayment"("purchaseBillId");
CREATE INDEX "AccountingLedgerEntry_entryDate_idx" ON "AccountingLedgerEntry"("entryDate");
CREATE INDEX "AccountingLedgerEntry_accountName_entryDate_idx" ON "AccountingLedgerEntry"("accountName", "entryDate");
CREATE INDEX "AccountingLedgerEntry_customerId_entryDate_idx" ON "AccountingLedgerEntry"("customerId", "entryDate");
CREATE INDEX "AccountingLedgerEntry_vendorId_entryDate_idx" ON "AccountingLedgerEntry"("vendorId", "entryDate");
CREATE INDEX "AccountingLedgerEntry_referenceType_referenceId_idx" ON "AccountingLedgerEntry"("referenceType", "referenceId");
CREATE INDEX "AccountingNote_noteType_noteDate_idx" ON "AccountingNote"("noteType", "noteDate");
CREATE INDEX "AccountingNote_customerId_noteDate_idx" ON "AccountingNote"("customerId", "noteDate");
CREATE INDEX "AccountingNote_vendorId_noteDate_idx" ON "AccountingNote"("vendorId", "noteDate");

ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseBill" ADD CONSTRAINT "PurchaseBill_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VendorPayment" ADD CONSTRAINT "VendorPayment_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VendorPayment" ADD CONSTRAINT "VendorPayment_purchaseBillId_fkey" FOREIGN KEY ("purchaseBillId") REFERENCES "PurchaseBill"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VendorPayment" ADD CONSTRAINT "VendorPayment_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "PaymentAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountingLedgerEntry" ADD CONSTRAINT "AccountingLedgerEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccountingLedgerEntry" ADD CONSTRAINT "AccountingLedgerEntry_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccountingLedgerEntry" ADD CONSTRAINT "AccountingLedgerEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingLedgerEntry" ADD CONSTRAINT "AccountingLedgerEntry_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingLedgerEntry" ADD CONSTRAINT "AccountingLedgerEntry_purchaseBillId_fkey" FOREIGN KEY ("purchaseBillId") REFERENCES "PurchaseBill"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccountingNote" ADD CONSTRAINT "AccountingNote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccountingNote" ADD CONSTRAINT "AccountingNote_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccountingNote" ADD CONSTRAINT "AccountingNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccountingNote" ADD CONSTRAINT "AccountingNote_purchaseBillId_fkey" FOREIGN KEY ("purchaseBillId") REFERENCES "PurchaseBill"("id") ON DELETE SET NULL ON UPDATE CASCADE;
