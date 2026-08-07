# ── Order Journey: explain what's actually blocking dispatch ───────────────
# Run this from PowerShell on your own machine (not inside any sandbox).
#
# WHAT WAS ACTUALLY HAPPENING (not one bug — two different situations that
# both LOOK like "stuck in Ready for Dispatch"):
#
# 1. AMAN PHARMACY (order 1076): its journey jumps straight from
#    IN_PRODUCTION to READY_FOR_DISPATCH — it never went through the
#    Sales-submits -> Accounts-approves loop (there's no
#    "PENDING_DISPATCH_APPROVAL -> READY_FOR_DISPATCH" entry anywhere in its
#    history). The Dispatch team's own queue (dispatch.service.ts
#    listReadyForDispatch) requires that exact log entry before showing a
#    non-sample order, as a safety guard — so this order is invisible there
#    no matter how many times someone clicks around Accounts or Orders.
#    FIX: on the Orders page, "Ready for Dispatch" tab, select this order,
#    fill in courier/COD details and click Submit — then Accounts needs to
#    approve it once (Accounts > Dispatch Approval). That creates the log
#    entry, and only then will Dispatch be able to see and book it.
#
# 2. The other order you flagged, that shows "Accounts approved dispatch" in
#    its journey: that one DID go through the loop correctly. Approving
#    dispatch deliberately sets the order BACK to READY_FOR_DISPATCH (same
#    tag as before submission) — that's by design, it means "cleared, ready
#    to physically ship" — but it makes it look like nothing happened. The
#    order is sitting correctly in the Dispatch module's own queue right now;
#    the last remaining step is for someone to open Dispatch (left sidebar,
#    not Orders/Accounts) and actually book/ship it. Nobody had done that
#    yet — not a bug, just a step waiting on a different page/person.
#
# THE FIX IN THIS COMMIT: the Order Journey view (on any order sitting in
# READY_FOR_DISPATCH or PENDING_DISPATCH_APPROVAL) now shows a banner that
# says exactly which of the above applies and who needs to act next, instead
# of just showing the same "Ready" tag with no explanation either way.
#
# ALSO FIXED IN PASSING: the "isSample" flag was missing from the Prisma
# `select` in both order-list queries (findAllForTable, getOrdersWithReadyItems)
# even though findAllForTable's output already tried to read it — so it was
# silently always false. Added to both selects.
#
# Files changed: backend/src/orders/orders.service.ts, frontend/app/orders/page.tsx
#
# THIS DOES NOT MOVE ANY EXISTING STUCK ORDER FORWARD BY ITSELF — it only
# explains what's needed. To find every order affected by situation #1 above
# (not just AMAN PHARMACY), run the diagnostic script that's already in this
# repo for exactly this:
#
#   cd backend
#   node scripts/diagnose-stuck-dispatch-orders.js
#
# It sorts every order currently stuck in Ready for Dispatch into the exact
# reason it's stuck (missing approval log / approved but not booked yet /
# shipment booked but not manifested / etc.) with the specific fix for each.

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

Set-Location "$repo\backend"
npm install
npm run build

Set-Location "$repo\frontend"
npm install
npm run build

Set-Location $repo
git add backend/src/orders/orders.service.ts
git add frontend/app/orders/page.tsx
git add deploy-dispatch-next-step-banner.ps1
git commit -m "Order Journey: show who needs to act next on Ready for Dispatch / Pending Dispatch Approval orders"
git push

Write-Host ""
Write-Host "Deployed. To see every order stuck for the 'missing approval log' reason (like AMAN PHARMACY), run:" -ForegroundColor Yellow
Write-Host "  cd backend" -ForegroundColor Yellow
Write-Host "  node scripts/diagnose-stuck-dispatch-orders.js" -ForegroundColor Yellow
