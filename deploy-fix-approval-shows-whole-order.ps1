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
# ROUND 2: the first attempt at this deploy broke Accounts > Pending Approval
# and > Payment Verification (both went empty) because ensure-all-columns.js
# was missing `require('dotenv/config')` -- run locally it silently printed
# "No DATABASE_URL set, skipping all checks" (looks like an info line, not
# an error) and never actually added the column. Every Order query built
# with Prisma's `include` (pulls every column automatically) then broke
# against the real table, which was still missing it; queries using an
# explicit `select` list were unaffected, which is why only some tabs broke.
# Fixed the script itself this time -- this run will actually add the column.
#
# Files changed:
#   backend/prisma/schema.prisma (new Order.pendingDispatchItemIds field)
#   backend/scripts/ensure-all-columns.js (fixed: now loads .env; self-heals the new column)
#   backend/src/orders/orders.service.ts (submitDispatchBatch records it)
#   backend/src/accounts/accounts.service.ts (getPendingDispatchOrders filters by it)

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

Set-Location "$repo\backend"
Write-Host "Adding the new column to production now..." -ForegroundColor Cyan
node scripts/ensure-all-columns.js
Write-Host ""
Write-Host "Check the line above for 'Order.pendingDispatchItemIds: added.' (or 'already exists.') -- if it still says 'No DATABASE_URL set', STOP and tell me, do not continue." -ForegroundColor Red
Write-Host ""
npm run build

Set-Location $repo
git add backend/prisma/schema.prisma
git add backend/scripts/ensure-all-columns.js
git add backend/src/orders/orders.service.ts
git add backend/src/accounts/accounts.service.ts
git add deploy-fix-approval-shows-whole-order.ps1
git commit -m "Accounts Approve Dispatch: show only the item(s) actually submitted; fix ensure-all-columns.js missing dotenv"
git push

Write-Host ""
Write-Host "Pushed. After it deploys, check ALL THREE: Pending Approval, Payment Verification, and Dispatch Approval tabs load normally, then submit a single item for dispatch and confirm Approve Dispatch only shows that item." -ForegroundColor Yellow
