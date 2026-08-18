-- Order/item cancellation request + approval workflow.
-- Additive only — safe on the live production DB, matches the
-- pendingDispatchItemIds / dispatchedAt pattern already used for
-- Dispatch Approval.

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "cancellationRequestedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "cancellationRequestedByName" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "cancellationReason" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "pendingCancelItemIds" TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);
