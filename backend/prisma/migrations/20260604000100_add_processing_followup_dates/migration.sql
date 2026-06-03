-- AddColumn: processingFollowUpDate on OrderItem (Inhouse processing follow-up)
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "processingFollowUpDate" TIMESTAMP(3);

-- AddColumn: processingFollowUpDate on PrintSheet (Sheet processing follow-up)
ALTER TABLE "PrintSheet" ADD COLUMN IF NOT EXISTS "processingFollowUpDate" TIMESTAMP(3);
