# -- Allow booking a single ready item for dispatch, without waiting for ---
# -- the rest of the order to finish production ----------------------------
# Run this from PowerShell on your own machine.
#
# Previously, "Ready for Dispatch" only let you submit an order once EVERY
# item on it had finished production (order.status === READY_FOR_DISPATCH).
# An order like #1452 (ENVELOPE not printed yet, READYMADE STICKER ready)
# showed up in the tab but wasn't selectable at all.
#
# The frontend booking modal / itemIdsByOrder plumbing for per-item and
# multi-order-combine booking already existed (built earlier, commit
# 31b5cf0) — but the backend gate that let you START a submission was
# reverted (d922e23) because flipping the WHOLE order's status early made
# the still-printing item vanish from Production's queue.
#
# This time the queue visibility gap itself is fixed instead of reverting
# the feature:
#   - orders.service.ts: submitDispatchBatch now allows submission as soon
#     as an order has >=1 ready item, not just when the whole order is done.
#   - production.service.ts: the order-status auto-rollup (fires when an
#     item's production stage changes) now leaves order.status alone once
#     it's moved past IN_PRODUCTION -- so a partial dispatch submission
#     doesn't get silently overwritten back to IN_PRODUCTION when a sibling
#     item's stage changes.
#   - production.service.ts: listInProduction() (the print team's queue)
#     now keys off "order still has an unfinished item", not order.status
#     alone -- so the order stays visible to Production for the remaining
#     item even after the ready item has been submitted/approved/dispatched.
#   - frontend/app/orders/page.tsx: the Ready for Dispatch checkbox is now
#     enabled as soon as an order has any ready item, not only when fully
#     ready. The booking modal already only lists actually-ready items.
#
# Files changed:
#   backend/src/orders/orders.service.ts
#   backend/src/production/production.service.ts
#   frontend/app/orders/page.tsx

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

Set-Location "$repo\backend"
npm run build

Set-Location $repo
git add backend/src/orders/orders.service.ts
git add backend/src/production/production.service.ts
git add frontend/app/orders/page.tsx
git add deploy-partial-dispatch-booking.ps1
git commit -m "Allow booking individual ready items for dispatch, separately or combined, without waiting for the whole order"
git push

Write-Host ""
Write-Host "Pushed. After it deploys, test with an order that has a mix of ready and not-ready items (like #1452) - confirm:" -ForegroundColor Yellow
Write-Host "  1. The ready item is now selectable in Ready for Dispatch and can be booked on its own or combined with others." -ForegroundColor Yellow
Write-Host "  2. The order STILL shows up in Production's queue for the unfinished item." -ForegroundColor Yellow
