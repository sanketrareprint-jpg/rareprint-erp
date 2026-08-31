# Adds a "Compare Bigship + Fship" option to Dispatch's "Ship via" dropdown.
# Fetching rates with it selected calls both couriers in parallel and shows
# their rates merged into one list, cheapest first, each tagged with a
# Bigship/Fship badge -- so you can see which is cheaper before booking.
#
# Booking afterward is completely unchanged: picking any rate from the
# combined list still routes through the existing bs-/fs- rateId-prefix
# logic in bookItems(), so no risk to the actual dispatch flow.
#
# Scope: Dispatch page only (where real courier booking happens). The
# Orders page's rate-fetch is only used for its submit-for-approval flow,
# not real booking -- can extend this there too later if wanted.
#
# Files changed:
#   backend/src/dispatch/dispatch.service.ts (new 'compare' branch in getRates)
#   backend/src/dispatch/dispatch.controller.ts (accept carrier=compare)
#   frontend/app/dispatch/page.tsx ("Compare Bigship + Fship" dropdown option + provider badge)

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

Set-Location "$repo\backend"
npm run build

Set-Location "$repo\frontend"
npm run build

Set-Location $repo
git add backend/src/dispatch/dispatch.service.ts
git add backend/src/dispatch/dispatch.controller.ts
git add frontend/app/dispatch/page.tsx
git add deploy-add-rate-comparison.ps1
git commit -m "Dispatch: add Bigship+Fship rate comparison option"
git push

Write-Host ""
Write-Host "Pushed. Once deployed: on Dispatch, set 'Ship via' to 'Compare Bigship + Fship' before Fetch Rates -- rates from both will show together, cheapest first." -ForegroundColor Yellow
