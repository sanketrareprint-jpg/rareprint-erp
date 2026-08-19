# -- Fix: Suggested COD used the WHOLE order's outstanding balance on ------
# -- every shipment, regardless of what's actually in it, risking asking ---
# -- the customer to pay the same balance twice across multiple shipments --
# Run this from PowerShell on your own machine, from the repo root.
#
# BUG: the Book Shipment modal's "Suggested COD" was `order balance +
# courier charge` -- the WHOLE order's outstanding balance, no matter which
# item(s) were actually checked for this shipment. Two problems, confirmed
# via a real order (1498, SPARSH MEDICAL: paid Rs 4,000 of Rs 6,700,
# shipping just the Rs 1,700 ready item):
#   1. That Rs 4,000 advance already fully covers the Rs 1,700 item being
#      shipped now, so this shipment could go out with Rs 0 COD -- but the
#      suggestion showed Rs 2,700 (the order's whole remaining balance).
#   2. When the order's other item ships later, the SAME whole-order
#      balance would be suggested again (nothing reduces it after a partial
#      COD shipment), risking the customer being asked to pay the
#      remaining balance a second time.
#
# FIX (recommended approach, confirmed with Sanket before building):
# the advance payment is now treated as applying to the order's items in
# the order they ship. Each shipment's suggested COD = (value of items in
# THIS shipment) - (advance paid so far, minus the value of items already
# shipped in EARLIER batches of this order), floored at zero, plus courier
# charge. For an order that ships all at once (the common case), nothing
# has shipped earlier, so this comes out identical to the old formula --
# only multi-shipment orders behave differently, which is exactly the case
# that was wrong. New backend field `alreadyDispatchedValue` (sum of
# already-shipped items' value per order) feeds this calculation.
#
# Files changed:
#   backend/src/orders/orders.service.ts (getOrdersWithReadyItems: new alreadyDispatchedValue field)
#   frontend/app/orders/page.tsx (suggestedCod formula + wording)

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

Set-Location "$repo\backend"
npm run build

Set-Location $repo
git add backend/src/orders/orders.service.ts
git add frontend/app/orders/page.tsx
git add deploy-fix-suggested-cod-partial-shipment.ps1
git commit -m "Suggested COD: apply advance payment against items in shipping order, not whole-order balance on every shipment"
git push

Write-Host ""
Write-Host "Pushed. After it deploys, open order 1498's Book Shipment modal with only the STICKER item checked -- Suggested COD should now show Rs 0 (the Rs 4,000 already paid covers the Rs 1,700 item). Once that item is dispatched, check the envelope item's later shipment suggests the true remaining Rs 2,700, not the same amount twice." -ForegroundColor Yellow
