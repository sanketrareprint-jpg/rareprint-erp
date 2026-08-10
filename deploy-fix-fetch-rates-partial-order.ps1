# -- Fix: "Order must be in a dispatchable status to fetch rates" firing --
# -- on orders that clearly have items ready to book -----------------------
# Run this from PowerShell on your own machine, from the repo root.
#
# BUG: dispatch.service.ts's getRates() (called by the Orders page's
# "Fetch Courier Rates" button, before an order is even submitted to
# Accounts) required the WHOLE order's status to already be
# READY_FOR_DISPATCH or PARTIALLY_DISPATCHED. But with partial dispatch
# booking, an order can have SOME items ready (itemProductionStage =
# READY_FOR_DISPATCH) while order.status is still APPROVED/IN_PRODUCTION,
# because the rest of production isn't finished yet -- that is the normal,
# expected state for the "book what's ready" flow. The Orders page decides
# whether to show an order in that flow based on item readiness
# (hasReadyItem/readyItemsCount), not order.status -- so getRates() was
# stricter than the very screen that calls it, and rejected orders that
# were legitimately ready to have some items booked.
#
# FIX: getRates() now allows fetching rates whenever the order has at
# least one ready item, matching the same rule the Orders page already uses
# to decide whether to show the order at all. Still blocks orders that are
# already submitted (PENDING_DISPATCH_APPROVAL) or finished
# (DISPATCHED/DELIVERED/CANCELLED). The actual physical booking step
# (assertCanDispatch, used once Accounts approves) was already correct and
# is untouched -- it still requires full approval before booking for real.
#
# Files changed:
#   backend/src/dispatch/dispatch.service.ts (getRates: item-level readiness check)

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

Set-Location "$repo\backend"
npm run build

Set-Location $repo
git add backend/src/dispatch/dispatch.service.ts
git add deploy-fix-fetch-rates-partial-order.ps1
git commit -m "dispatch.getRates: allow rate fetching based on item readiness, not whole-order status"
git push

Write-Host ""
Write-Host "Pushed. After it deploys, try Fetch Courier Rates again on order 1466 (ABCD TEST) or any order with at least one ready item." -ForegroundColor Yellow
