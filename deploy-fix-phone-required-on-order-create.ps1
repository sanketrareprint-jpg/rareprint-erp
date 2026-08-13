# -- Fix: orders could be created with no phone number at all --------------
# Run this from PowerShell on your own machine, from the repo root.
#
# BUG: the Create Order form's validation was
#   if (customer.phone && customer.phone.length !== 10) { ...error... }
# -- this only checked the LENGTH when a phone was already typed in. An
# empty phone field skipped the check entirely and the order went through
# with no phone number saved at all. Confirmed via a real order (1491,
# SURBHI MEDICAL STORE), which has "--" for phone in the Orders table.
#
# FIX:
#   - Frontend (Create Order form): phone is now required, not just
#     "must be 10 digits if present." A small red "*Phone number is
#     required" line appears under the Phone field once the agent tries to
#     submit without one (matches the existing "must be 10 digits" error
#     style right above it).
#   - Backend (orders.service.ts's create()): same requirement enforced
#     server-side too, so this can't be bypassed by anything that calls the
#     API directly -- the UI check alone isn't the source of truth, per this
#     project's rule that backend validation is mandatory.
#
# Files changed:
#   frontend/app/orders/create/page.tsx
#   backend/src/orders/orders.service.ts

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

Set-Location "$repo\backend"
npm run build

Set-Location $repo
git add frontend/app/orders/create/page.tsx
git add backend/src/orders/orders.service.ts
git add deploy-fix-phone-required-on-order-create.ps1
git commit -m "Require phone number to create an order (frontend + backend validation)"
git push

Write-Host ""
Write-Host "Pushed. After it deploys, try creating an order with the phone field left blank -- should show '*Phone number is required' under the field and refuse to submit." -ForegroundColor Yellow
