# -- Fix: can't submit a second batch of items from an order that already -
# -- had some items dispatched ("Order status (PARTIALLY_DISPATCHED) isn't -
# -- eligible for dispatch submission") -------------------------------------
# Run this from PowerShell on your own machine, from the repo root.
#
# BUG: after the dispatchedAt fix, an order with some items already shipped
# correctly REAPPEARED in Orders > Ready for Dispatch with its remaining
# free items -- but actually trying to submit those remaining items still
# hit a hard block: submitDispatchBatch's allowed-status list never
# included PARTIALLY_DISPATCHED, so it always got rejected with "Order
# status (PARTIALLY_DISPATCHED) isn't eligible for dispatch submission."
# Confirmed via a real order (1473), 2026-08-10.
#
# FIX: PARTIALLY_DISPATCHED added to submitDispatchBatch's allowed
# statuses. Safe to allow: the function already only ever looks at items
# that are itemProductionStage READY_FOR_DISPATCH AND not already
# dispatchedAt, so it can only ever submit the genuinely still-free items,
# never re-touch anything already shipped.
#
# Files changed:
#   backend/src/orders/orders.service.ts (submitDispatchBatch)

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

Set-Location "$repo\backend"
npm run build

Set-Location $repo
git add backend/src/orders/orders.service.ts
git add deploy-fix-partial-dispatched-resubmit-blocked.ps1
git commit -m "submitDispatchBatch: allow submitting remaining items from a PARTIALLY_DISPATCHED order"
git push

Write-Host ""
Write-Host "Pushed. After it deploys, try submitting order 1473's remaining ready item(s) again -- should go through to Accounts approval this time." -ForegroundColor Yellow
