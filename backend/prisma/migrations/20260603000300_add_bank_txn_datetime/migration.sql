-- Add txnDateTime column for sub-day transaction ordering
ALTER TABLE "BankTransaction" ADD COLUMN "txnDateTime" TIMESTAMP(3);
