# -- Fix: Accounts > Approve Dispatch shows the WHOLE order even when only -
# -- one item was submitted -------------------------------------------------
# Run this from PowerShell on your own machine.
# Run this together with (or after) deploy-fix-dispatch-resubmission-loop.ps1
# -- both touch backend/src/orders/orders.service.ts.
#
# BUG: When you submit just one ready item for dispatch (the new partial-
# booking feature), Accounts' "Approve Dispatch" screen showed every item on
# the order, not just the one actually submitted -- because
# getPendingDispatchOrders just read order.items (all of them) with no way
# to know which item(s) THIS particular submission covered.
#
# FIX: submitDispatchBatch now records which item id(s) are covered by the
# current submission on the order itself (new Order.pendingDispatchItemIds
# column). getPendingDispatchOrders uses that to show only those items when
# present, falling back to showing everything for older orders or
# submissions that genuinely covered the whole order.
#
# Files changed:
#   backend/prisma/schema.prisma (new Order.pendingDispatchItemIds field)
#   backend/scripts/ensure-all-columns.js (self-heals the new column)
#   backend/src/orders/orders.service.ts (submitDispatchBatch records it)
#   backend/src/accounts/accounts.service.ts (getPendingDispatchOrders filters by it)

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

Set-Location "$repo\backend"
Write-Host "Adding the new column to production now (self-heal script, safe to run anytime)..." -ForegroundColor Cyan
node scripts/ensure-all-columns.js
npm run build

Set-Location $repo
git add backend/prisma/schema.prisma
git add backend/scripts/ensure-all-columns.js
git add backend/src/orders/orders.service.ts
git add backend/src/accounts/accounts.service.ts
git add deploy-fix-approval-shows-whole-order.ps1
git commit -m "Accounts Approve Dispatch: show only the item(s) actually submitted, not the whole order"
git push

Write-Host ""
Write-Host "Pushed. After it deploys, submit a single item for dispatch again and confirm Approve Dispatch only shows that item." -ForegroundColor Yellow
