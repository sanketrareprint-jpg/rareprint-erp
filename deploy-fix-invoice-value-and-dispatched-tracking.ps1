# -- Fix: courier invoice showing the WHOLE order's value, items never ----
# -- leaving the Dispatch queue after they're actually shipped, and no ----
# -- badge to tell a submitted/approved/dispatched item apart from a free -
# -- "Ready" one ------------------------------------------------------------
# Run this from PowerShell on your own machine, from the repo root.
#
# BUG 1 -- courier invoice value: Bigship/Shiprocket were always told the
# shipment's declared value was order.grandTotal (the WHOLE order's total),
# even when only some of the order's items were actually in that shipment.
# A 4-item, ₹22,000 order where only one much-cheaper item was booked still
# declared ₹22,000 to the courier. Confirmed via a real order (1473, ABCDE),
# 2026-08-10.
# FIX: the pre-submission rate estimate (Orders page) now uses the total of
# the order's actually-ready items; the real booking step (Dispatch) now
# uses the exact value of the item(s) selected for that specific shipment.
#
# BUG 2 -- items persisting in Dispatch's queue forever, even after they
# show up as shipped in Bigship: itemProductionStage (which most of the
# dispatch logic reads to mean "still needs action") never changes away
# from READY_FOR_DISPATCH even after an item is actually, physically
# dispatched -- it tracks PRODUCTION readiness, not shipment status. There
# was no separate marker for "has this specific item actually shipped."
# FIX: new OrderItem.dispatchedAt column, set the moment an item is
# actually booked (courier, transport, or by-hand/self-collect). Every
# place that decides "is this item still actionable" (Dispatch's queue,
# Orders' Ready for Dispatch tab, the booking checklist, rate estimates,
# and the booking functions themselves) now excludes items with
# dispatchedAt set. Also lets Orders' Ready for Dispatch tab safely include
# PARTIALLY_DISPATCHED orders again (previously excluded entirely because
# there was no reliable way to tell "already shipped" apart from "still
# ready" on those orders).
#
# BUG 3 -- no way to tell a submitted/approved/dispatched item apart from a
# genuinely free "Ready" one in the Orders table: the badge just echoed
# itemProductionStage, which never changes. Now shows "Submitted" (pending
# accounts approval), "Approved, awaiting booking", or "Dispatched" instead
# of a plain "Ready" tag once an item is no longer actually free.
#
# Files changed:
#   backend/prisma/schema.prisma (new OrderItem.dispatchedAt column)
#   backend/scripts/ensure-all-columns.js (self-heals the new column)
#   backend/src/dispatch/dispatch.service.ts (invoice value fix; sets/reads dispatchedAt everywhere)
#   backend/src/orders/orders.service.ts (badge data; reads dispatchedAt in Ready for Dispatch tab, All Orders table, submit batch)
#   frontend/app/orders/page.tsx (renders the new Submitted/Approved/Dispatched badges)

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

Set-Location "$repo\backend"
Write-Host "Adding the new column to production now..." -ForegroundColor Cyan
node scripts/ensure-all-columns.js
Write-Host ""
Write-Host "Check the line above for 'OrderItem.dispatchedAt: added.' (or 'already exists.') -- if it still says 'No DATABASE_URL set', STOP and tell me, do not continue." -ForegroundColor Red
Write-Host ""
npm run build

Set-Location $repo
git add backend/prisma/schema.prisma
git add backend/scripts/ensure-all-columns.js
git add backend/src/dispatch/dispatch.service.ts
git add backend/src/orders/orders.service.ts
git add frontend/app/orders/page.tsx
git add deploy-fix-invoice-value-and-dispatched-tracking.ps1
git commit -m "Track per-item dispatch state (dispatchedAt): fixes courier invoice value, items persisting in Dispatch queue after shipping, adds Submitted/Approved/Dispatched badges"
git push

Write-Host ""
Write-Host "Pushed. After it deploys: book order 1473 (or any order) again and check Bigship's declared invoice value matches just the item(s) you actually selected, not the whole order. Then check the Orders table shows a distinct badge (Submitted / Approved / Dispatched) instead of plain 'Ready' for that item, and that it disappears from Dispatch's own queue once it shows as shipped in Bigship." -ForegroundColor Yellow
