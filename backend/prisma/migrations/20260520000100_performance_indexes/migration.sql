CREATE INDEX IF NOT EXISTS "Order_status_orderDate_idx" ON "Order"("status", "orderDate");
CREATE INDEX IF NOT EXISTS "Order_salesAgentId_orderDate_idx" ON "Order"("salesAgentId", "orderDate");
CREATE INDEX IF NOT EXISTS "Order_customerId_orderDate_idx" ON "Order"("customerId", "orderDate");
CREATE INDEX IF NOT EXISTS "Order_productionStage_idx" ON "Order"("productionStage");
CREATE INDEX IF NOT EXISTS "OrderItem_itemProductionStage_updatedAt_idx" ON "OrderItem"("itemProductionStage", "updatedAt");
CREATE INDEX IF NOT EXISTS "OrderItem_productionCategory_itemProductionStage_idx" ON "OrderItem"("productionCategory", "itemProductionStage");
CREATE INDEX IF NOT EXISTS "Payment_orderId_verificationStatus_idx" ON "Payment"("orderId", "verificationStatus");
CREATE INDEX IF NOT EXISTS "Payment_paymentDate_idx" ON "Payment"("paymentDate");
