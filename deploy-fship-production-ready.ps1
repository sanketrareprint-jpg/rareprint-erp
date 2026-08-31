# Fship production token is now active (confirmed by Anurag Agrawal,
# 2026-08-31). This ships everything needed for real Fship bookings to work
# correctly, in case either fix wasn't deployed yet:
#
# 1. dispatch.service.ts -- Fship bookings now fall back to
#    noreply@example.com when a customer has no email on file, matching
#    Bigship/Shiprocket. Without this, real bookings for customers with no
#    email would fail the same way our staging test did ("Email Id is
#    required.").
# 2. fship.service.ts -- status lookups now call the CORRECT endpoint,
#    /api/shipmentcurrentstatus (Fship support confirmed the PDF's
#    documented /api/shipmentsummary 404s), and read the real response
#    field name "remarks" (not "remark").
#
# No env var changes needed -- FSHIP_ENV was never set to "staging" on
# Railway (our staging tests hit Fship's API directly via a standalone
# script, never through the deployed app), so the app has been pointed at
# Fship's production URL with your production Client Key all along. Now that
# Fship activated that key, real bookings should just work.

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

Set-Location "$repo\backend"
npm run build

Set-Location $repo
git add backend/src/dispatch/dispatch.service.ts
git add backend/src/fship/fship.service.ts
git add deploy-fship-production-ready.ps1
git commit -m "Fship: fix email fallback + correct status endpoint/field for production"
git push

Write-Host ""
Write-Host "Pushed. Once deployed, try a real Fship booking from the Dispatch page -- 'Ship via' Fship, pick a real order." -ForegroundColor Yellow
