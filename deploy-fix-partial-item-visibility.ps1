# -- Fix: partially-submitted orders vanishing, and Dispatch queue showing -
# -- items nobody approved --------------------------------------------------
# Run this from PowerShell on your own machine, from the repo root.
#
# Root cause: dispatch-submission status only ever lived on the ORDER
# (order.status), not per item. Once you submitted even one item, the whole
# order flipped to PENDING_DISPATCH_APPROVAL, which hid the ENTIRE order --
# including any other still-untouched ready items -- from Orders > Ready
# for Dispatch. And even after that one item got approved/rejected, the
# order never came back for the other items, because it then looked
# "already handled" to that screen. Separately, Dispatch's own booking
# queue showed EVERY item at "ready" production stage on an approved order,
# not just the specific item(s) that were actually submitted and approved --
# so it could show items nobody from Accounts had signed off on yet.
# Confirmed and root-caused via a real order (1469, 3 items / 2 ready / 1
# submitted) on 2026-08-10.
#
# FIX: everywhere that decides "is this item actually part of the current
# dispatch submission" now checks the Order.pendingDispatchItemIds column
# (added earlier for the Accounts approval-screen fix) at the ITEM level,
# instead of relying on the order's single overall status:
#   - Orders > Ready for Dispatch tab: now shows an order whenever it has
#     at least one ready item NOT locked into a submission, regardless of
#     the order's other items or its overall status. The "Ready" count and
#     the booking modal's checklist both only count/offer free items.
#   - Dispatch's booking queue: now only lists items that are actually in
#     the current submitted+approved batch (sample orders, which skip
#     accounts approval by design, are unaffected -- they still show all
#     their ready items).
#   - Reject Dispatch: now clears pendingDispatchItemIds when rejecting, so
#     the rejected items become resubmittable again (approving deliberately
#     leaves this alone -- that's what keeps an approved order out of the
#     resubmission list).
#
# This also FULLY replaces the earlier AMAN PHARMACY / SHRI VIJAY NURSING
# HOME resubmission-loop fix's status+history-log check with something more
# precise (item-level lock, not order-level history) -- it still prevents
# that loop, just more accurately.
#
# Files changed:
#   backend/src/orders/orders.service.ts (getOrdersWithReadyItems, getOrderItems)
#   backend/src/dispatch/dispatch.service.ts (listReadyForDispatch)
#   backend/src/accounts/accounts.service.ts (rejectDispatch: clears the lock)
#   frontend/app/orders/page.tsx (booking modal respects the new dispatchLocked flag)

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

Set-Location "$repo\backend"
npm run build

Set-Location $repo
git add backend/src/orders/orders.service.ts
git add backend/src/dispatch/dispatch.service.ts
git add backend/src/accounts/accounts.service.ts
git add frontend/app/orders/page.tsx
git add deploy-fix-partial-item-visibility.ps1
git commit -m "Track dispatch submission per item (pendingDispatchItemIds), not just per order: fixes orders vanishing on partial submit and Dispatch queue showing unapproved items"
git push

Write-Host ""
Write-Host "Pushed. After it deploys: order 1466 (ABCD TEST) should reappear in Orders > Ready for Dispatch (it's still sitting at PENDING_DISPATCH_APPROVAL from the earlier failed reject-dispatch attempt -- reject it again now that the FK bug is fixed, or approve it, and check the remaining items behave correctly). For order 1469, open the booking modal again -- the 1 still-ready, unsubmitted item should now show up and be selectable." -ForegroundColor Yellow
