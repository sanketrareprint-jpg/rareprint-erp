# Fix: Fship createforwardorder was sending an empty email, which their
# staging API rejects ("Email Id is required.") -- Bigship/Shiprocket already
# fall back to noreply@example.com when a customer has no email on file;
# Fship's branch was missing that same fallback. One-line fix.
#
# File changed: backend/src/dispatch/dispatch.service.ts

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

Set-Location "$repo\backend"
npm run build

Set-Location $repo
git add backend/src/dispatch/dispatch.service.ts
git add deploy-fix-fship-email-required.ps1
git commit -m "Fship: fall back to noreply@example.com when customer has no email, matching Bigship/Shiprocket"
git push

Write-Host ""
Write-Host "Pushed. This only affects real bookings through the app -- your staging test script (test-fship-staging.ps1) doesn't call the deployed app at all, it hits Fship's API directly. So you can rerun the test script right now without waiting for this deploy; rerun it again after deploying to confirm the same fix works end-to-end in the ERP too." -ForegroundColor Yellow
