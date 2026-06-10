CREATE INDEX IF NOT EXISTS "Order_status_updatedAt_idx" ON "Order"("status", "updatedAt");
CREATE INDEX IF NOT EXISTS "StatusLog_toStatus_orderId_idx" ON "StatusLog"("toStatus", "orderId");
CREATE INDEX IF NOT EXISTS "Notification_toUserId_isRead_idx" ON "Notification"("toUserId", "isRead");
CREATE INDEX IF NOT EXISTS "Notification_toUserId_createdAt_idx" ON "Notification"("toUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "Notification_copyToAdmin_createdAt_idx" ON "Notification"("copyToAdmin", "createdAt");
