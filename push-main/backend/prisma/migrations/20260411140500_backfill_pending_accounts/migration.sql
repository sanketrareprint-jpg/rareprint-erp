-- Runs in a separate migration/transaction after PENDING_ACCOUNTS is committed.
UPDATE "Order"
SET status = 'PENDING_ACCOUNTS'::"OrderStatus"
WHERE status = 'PENDING_APPROVAL'::"OrderStatus";
