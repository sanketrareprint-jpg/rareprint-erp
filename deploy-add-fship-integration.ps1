# -- Fship courier integration: per-shipment "Ship via: Bigship / Fship / --
# -- Shiprocket" choice, alongside the existing global default. -----------
# Run this from PowerShell on your own machine, from the repo root.
#
# WHAT THIS ADDS (built from Fship's own "API Integration Guide V1.2.3.2"
# PDF you sent, 2026-08-20 -- every field/endpoint below matches that doc):
#
#   - New backend/src/fship/ module (FshipService): courier list, rate
#     calculator, create forward order (books + assigns AWB in one step,
#     unlike Bigship's separate draft-then-place), register pickup
#     (auto-manifest, same UX as Bigship's auto-manifest), shipment status
#     poll, cancel.
#   - CarrierConfigService extended with a third carrier ('fship') --
#     Settings' "Active Courier Provider" toggle is now just the DEFAULT
#     pre-selected option, not a hard switch. New Settings > Fship API
#     Credentials panel for the Client Key + pickup pincode + pickup
#     address id.
#   - Orders page (Book Shipment modal) and Dispatch page both get a
#     "Ship via" dropdown next to Fetch Rates -- picks which carrier THIS
#     shipment quotes/books from, independent of the Settings default.
#     Leaving it on "Default" changes nothing from before.
#   - New Shipment.fshipOrderId / fshipStatus / fshipSyncedAt columns
#     (additive migration), mirroring the existing bigship* columns.
#
# IMPORTANT -- one-time setup needed before Fship bookings will actually
# work (the dropdown will show, but booking will fail with a clear error
# until these are set):
#
#   1. In Railway's backend service, add environment variable:
#        FSHIP_CLIENT_KEY = <the Client Key you gave me in chat>
#      (Never put this key directly in code/git -- set it in Railway's
#      dashboard, or paste it into the new Settings > Fship API Credentials
#      field once this deploy is live -- either one works, env var wins if
#      both are set.)
#   2. Log into Fship's own dashboard > Manage Warehouse, create your
#      pickup address there (Fship's API can only ADD warehouses, it has no
#      way to LIST existing ones, so this has to be a one-time manual step).
#      Take the numeric Address Id it gives you and set:
#        FSHIP_PICKUP_ADDRESS_ID = <that number>
#      (or fill it into Settings > Fship API Credentials > Pickup Address Id
#      after deploying).
#   3. Optional: FSHIP_PICKUP_PINCODE (defaults to 440032, same default as
#      Bigship's) if your Fship pickup location's pincode differs.
#
# Files changed:
#   backend/src/fship/fship.service.ts        (new)
#   backend/src/fship/fship.module.ts          (new)
#   backend/src/carrier-config/carrier-config.service.ts
#   backend/src/carrier-config/carrier-config.controller.ts
#   backend/src/dispatch/dispatch.module.ts
#   backend/src/dispatch/dispatch.service.ts
#   backend/src/dispatch/dispatch.controller.ts
#   backend/prisma/schema.prisma
#   backend/prisma/migrations/20260820150000_add_shipment_fship_sync/migration.sql (new)
#   backend/scripts/ensure-all-columns.js
#   frontend/app/orders/page.tsx
#   frontend/app/dispatch/page.tsx
#   frontend/app/settings/page.tsx
#   docs/Fship_Integration_Build_Prompt.md (planning doc, for reference)

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

# Apply the new Shipment.fship* columns to the LIVE database first (same
# reasoning as every other schema change in this repo -- see
# .claude/rules/team-history.md: never run migrations from Railway's boot
# path, always apply locally before/after pushing).
Set-Location "$repo\backend"
node scripts/railway-migrate.js

npm run build

Set-Location $repo
git add backend/src/fship/fship.service.ts
git add backend/src/fship/fship.module.ts
git add backend/src/carrier-config/carrier-config.service.ts
git add backend/src/carrier-config/carrier-config.controller.ts
git add backend/src/dispatch/dispatch.module.ts
git add backend/src/dispatch/dispatch.service.ts
git add backend/src/dispatch/dispatch.controller.ts
git add backend/prisma/schema.prisma
git add "backend/prisma/migrations/20260820150000_add_shipment_fship_sync/migration.sql"
git add backend/scripts/ensure-all-columns.js
git add frontend/app/orders/page.tsx
git add frontend/app/dispatch/page.tsx
git add frontend/app/settings/page.tsx
git add docs/Fship_Integration_Build_Prompt.md
git add deploy-add-fship-integration.ps1
git commit -m "Add Fship courier integration with per-shipment carrier selection"
git push

Write-Host ""
Write-Host "Pushed. Once it deploys:" -ForegroundColor Yellow
Write-Host "  1. Set FSHIP_CLIENT_KEY in Railway (or Settings > Fship API Credentials)." -ForegroundColor Yellow
Write-Host "  2. Create your pickup warehouse in Fship's own dashboard, then set FSHIP_PICKUP_ADDRESS_ID." -ForegroundColor Yellow
Write-Host "  3. On Orders > Book Shipment or the Dispatch page, pick 'Fship' from the new Ship via dropdown, Fetch Rates, and book a real low-value order end-to-end to confirm the AWB comes back correctly." -ForegroundColor Yellow
