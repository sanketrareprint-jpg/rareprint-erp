# -- Fix: can't submit a second, separately-ready item from an order that -
# -- already has ANOTHER item pending accounts approval ("Order status ----
# -- (PENDING_DISPATCH_APPROVAL) isn't eligible for dispatch submission") --
# Run this from PowerShell on your own machine, from the repo root.
#
# BUG: same class of gap as the PARTIALLY_DISPATCHED fix from a few days
# ago (deploy-fix-partial-dispatched-resubmit-blocked.ps1), just for a
# different status. Once one item on an order is submitted, order.status
# moves to PENDING_DISPATCH_APPROVAL. If a DIFFERENT item on that same
# order finishes production afterward, Orders > Ready for Dispatch
# correctly showed the order again (it has a genuinely free ready item) --
# but actually submitting that second item was still hard-blocked with
# "Order status (PENDING_DISPATCH_APPROVAL) isn't eligible for dispatch
# submission." Confirmed via a real order (1453, SATYA HOMEOPATHY),
# 2026-08-20.
#
# FIX: PENDING_DISPATCH_APPROVAL added to submitDispatchBatch's allowed
# statuses. Safe to allow: the function only ever touches items that are
# ready AND not already locked/dispatched, so it can only submit the
# genuinely new item, never re-touch the one already pending.
#
# Found and fixed a related bug while making this change: the write that
# records which items a submission covers (pendingDispatchItemIds) was
# OVERWRITING the list each time, not merging. Submitting a second item
# while the first was still pending approval would have silently un-locked
# the first item (Accounts' approval screen would stop showing it as
# pending). Now merges instead of overwriting.
#
# Files changed:
#   backend/src/orders/orders.service.ts (submitDispatchBatch)

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

Set-Location "$repo\backend"
npm run build

Set-Location $repo
git add backend/src/orders/orders.service.ts
git add deploy-fix-pending-approval-resubmit-blocked.ps1
git commit -m "submitDispatchBatch: allow submitting a new ready item while another is still pending approval; merge pendingDispatchItemIds instead of overwriting"
git push

Write-Host ""
Write-Host "Pushed. After it deploys, try submitting order 1453's remaining ready item again -- should go through. Then check Accounts > Dispatch Approval shows BOTH items (the earlier one and this new one) for that order." -ForegroundColor Yellow
