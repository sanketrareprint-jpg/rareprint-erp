CREATE INDEX IF NOT EXISTS "PrintSheet_status_updatedAt_idx" ON "PrintSheet"("status", "updatedAt");
CREATE INDEX IF NOT EXISTS "PrintSheet_gsm_status_idx" ON "PrintSheet"("gsm", "status");
CREATE INDEX IF NOT EXISTS "PrintSheetItem_sheetId_idx" ON "PrintSheetItem"("sheetId");
CREATE INDEX IF NOT EXISTS "PrintSheetItem_orderItemId_idx" ON "PrintSheetItem"("orderItemId");
CREATE INDEX IF NOT EXISTS "PrintSheetItem_productId_idx" ON "PrintSheetItem"("productId");
