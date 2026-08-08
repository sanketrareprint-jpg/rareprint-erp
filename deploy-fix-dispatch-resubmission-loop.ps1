# -- Fix orders looping forever at Ready for Dispatch (AMAN PHARMACY etc) --
# Run this from PowerShell on your own machine.
#
# ROOT CAUSE FOUND: Accounts' "approve dispatch" action deliberately puts an
# order's status BACK to READY_FOR_DISPATCH (same status it had right after
# production finished, before it was ever submitted) -- that's intentional,
# it's how Dispatch's own queue recognizes it as bookable. But the Orders
# page's "Ready for Dispatch" tab (getOrdersWithReadyItems) had no way to
# tell "just finished production, needs submitting" apart from "already
# approved, just waiting on Dispatch to book it" -- both look identical:
# same status, same ready item. So an already-approved order kept
# reappearing in that tab looking exactly like a fresh one. If it got
# selected and submitted again, that just re-creates a new
# PENDING_DISPATCH_APPROVAL -> (re-approved) -> READY_FOR_DISPATCH cycle,
# forever, without ever landing in the Dispatch team's actual booking queue.
# That's exactly the "click verify, it stays stuck" behavior reported for
# AMAN PHARMACY and SHRI VIJAY NURSING HOME.
#
# THE FIX:
#   - orders.service.ts getOrdersWithReadyItems: orders that already have a
#     PENDING_DISPATCH_APPROVAL -> READY_FOR_DISPATCH StatusLog entry (i.e.
#     already accounts-approved) are now excluded from this tab entirely --
#     they belong in the Dispatch module now, not back here for resubmission.
#   - orders.service.ts submitDispatchBatch: added the same check as a
#     server-side guard, so even a stale/cached frontend list can't trigger
#     a resubmission of an already-approved order.
#
# After this deploys, AMAN PHARMACY and SHRI VIJAY NURSING HOME (if already
# approved) should disappear from Orders > Ready for Dispatch and should be
# checked for in the Dispatch module instead -- that's where they've likely
# been sitting, waiting to be booked, this whole time.
#
# File changed: backend/src/orders/orders.service.ts

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

Set-Location "$repo\backend"
npm run build

Set-Location $repo
git add backend/src/orders/orders.service.ts
git add deploy-fix-dispatch-resubmission-loop.ps1
git commit -m "Fix orders looping forever at Ready for Dispatch: exclude already-approved orders from the resubmission tab"
git push

Write-Host ""
Write-Host "Pushed. After it deploys:" -ForegroundColor Yellow
Write-Host "  1. Check AMAN PHARMACY and SHRI VIJAY NURSING HOME in the Dispatch module (not Orders) - they may already be sitting there ready to book." -ForegroundColor Yellow
Write-Host "  2. Confirm they no longer show up in Orders > Ready for Dispatch." -ForegroundColor Yellow
