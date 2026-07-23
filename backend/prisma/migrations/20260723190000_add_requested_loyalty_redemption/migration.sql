-- Lets the sales agent request a loyalty-points redemption right at order
-- creation time (when the customer is matched by phone), instead of only at
-- billing time. The request is just captured on the Order here; it's
-- actually applied through the existing, already-tested LoyaltyService
-- .redeemForOrder engine (row locks, redemption cap, etc.) once accounts
-- approves the order and the invoice is created — see AccountsService
-- .approveOrder, which now fires this the same fire-and-forget way it
-- already does loyalty.earnForOrder.
--
-- Written idempotently (IF NOT EXISTS) to match this repo's existing
-- repair-migration pattern.

ALTER TABLE "Order"
ADD COLUMN IF NOT EXISTS "requestedLoyaltyRedemption" INTEGER;
