# Switches Bigship's risk type from Third-Party Insurance (riskTypeId 1) to
# Owner Risk (riskTypeId 2) everywhere the ERP talks to Bigship: the rate
# quote/comparison call AND the actual place-order call, so quoted rates and
# booked rates stay consistent (booking always used the same risk type the
# quote showed).
#
# What this means: shipments are no longer covered by Bigship's third-party
# insurance -- loss/damage in transit is on RarePrint's own risk instead of
# an insured claim. Rates are cheaper under Owner Risk (per Bigship's own
# per-courier riskCharges breakdown), which is the whole point of the change.
#
# File changed: backend/src/bigship/bigship.service.ts (3 hardcoded
# riskTypeId occurrences: fetchCourierRates, postPlaceOrderBasic (unused
# dead code path, updated for consistency), postPlaceOrderMultipart (the
# one that's actually called on every real booking)).

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

Set-Location "$repo\backend"
npm run build

Set-Location $repo
git add backend/src/bigship/bigship.service.ts
git add deploy-bigship-owner-risk.ps1
git commit -m "Bigship: switch default risk type to Owner Risk"
git push

Write-Host ""
Write-Host "Pushed. Once deployed, Bigship rate quotes and bookings will both use Owner Risk instead of Third-Party Insurance." -ForegroundColor Yellow
