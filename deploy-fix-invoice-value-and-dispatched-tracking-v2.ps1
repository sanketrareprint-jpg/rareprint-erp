# -- Same fix as deploy-fix-invoice-value-and-dispatched-tracking.ps1, ----
# -- corrected: that deploy FAILED to build on Railway. ---------------------
# Run this from PowerShell on your own machine, from the repo root.
#
# WHAT WENT WRONG: 3 spots in backend/src/orders/orders.service.ts added the
# new dispatchedAt column to a Prisma query using
# `...({ dispatchedAt: true } as any)` spread INSIDE a nested items select.
# That pattern is safe at the top level of a select (already used elsewhere
# in this file, in production), but spreading an `any` into a NESTED
# select's object literal corrupted TypeScript's inferred type for the
# whole `items` field, and Railway's build failed outright with
# TS2367/TS2345/TS2339 -- nothing was actually deployed.
#
# FIX: switched those 3 spots to either a plain `dispatchedAt: true,` key
# (no spread -- Railway runs `prisma generate` before building, so this is
# a completely normal, correctly-typed field by build time) or, in
# submitDispatchBatch, to `include` instead of a narrow `select` (pulls
# every column automatically, no explicit key needed). No behavior change
# from the previous deploy attempt -- purely a build-compatibility fix.
#
# Files changed (same as before):
#   backend/prisma/schema.prisma (new OrderItem.dispatchedAt column)
#   backend/scripts/ensure-all-columns.js (self-heals the new column)
#   backend/src/dispatch/dispatch.service.ts (invoice value fix; sets/reads dispatchedAt everywhere)
#   backend/src/orders/orders.service.ts (badge data; reads dispatchedAt -- build error fixed here)
#   frontend/app/orders/page.tsx (renders the new Submitted/Approved/Dispatched badges)

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

Set-Location "$repo\backend"
Write-Host "Adding the new column to production now (skip if you already ran this from the last attempt -- it's idempotent, safe to run again)..." -ForegroundColor Cyan
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
git add deploy-fix-invoice-value-and-dispatched-tracking-v2.ps1
git commit -m "Fix Railway build failure from previous deploy: nested select spread broke TS inference for dispatchedAt"
git push

Write-Host ""
Write-Host "Pushed. Watch the Railway build log this time -- confirm it says 'Generated Prisma Client' and then completes with no red error text, unlike last time. Once it's live: book order 1473 again and check Bigship's declared invoice value, the Orders table badge, and that the item disappears from Dispatch's queue after showing shipped in Bigship." -ForegroundColor Yellow
