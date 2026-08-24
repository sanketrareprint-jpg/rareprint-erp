# -- Fix: "Dispatched!" shown even when the courier never actually --------
# -- confirmed the booking (no real AWB) --------------------------------
# Run this from PowerShell on your own machine, from the repo root.
#
# BUG: booked a real order via Fship (after recharging the wallet) --
# the ERP still said "Dispatched!" and showed a code in the popup, but
# History showed a blank tracking field, and searching that popup code on
# Fship's own dashboard came back "no matching orders."
#
# ROOT CAUSE: the popup was never showing a real courier AWB at all -- it
# was showing this ERP's own internal shipment reference number
# (SHP-<timestamp>-...), which looks like a tracking code but isn't one.
# The actual booking result returned by the backend never included the
# real AWB or any indication of whether the courier (Bigship/Shiprocket/
# Fship) actually accepted the shipment -- so when a courier silently
# rejected a booking (wrong param, still-insufficient balance, whatever),
# the ERP recorded it as done regardless, with no visible warning. This
# gap existed for all three couriers, not just Fship -- Fship's test just
# happened to surface it first.
#
# FIX: bookItems() now returns the real awbNumber (may be null) and a new
# courierBookingWarning field carrying the courier's own rejection message
# (already being saved into the Shipment's notes field, just never surfaced
# to the UI before). The Dispatch page's booking popup now shows that
# warning plainly instead of a blanket "Dispatched!", and shows the real
# AWB when there is one.
#
# NEXT STEP AFTER THIS DEPLOYS: retry booking the same test order via
# Fship. This time the popup will show Fship's actual rejection reason
# (previously invisible) -- send me that exact text and we can pin down
# the real cause (my sandbox can't reach the production database directly
# to pull it myself, confirmed while investigating this).
#
# Files changed:
#   backend/src/dispatch/dispatch.service.ts (bookItems return value)
#   frontend/app/dispatch/page.tsx (book() success alert)

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

Set-Location "$repo\backend"
npm run build

Set-Location $repo
git add backend/src/dispatch/dispatch.service.ts
git add frontend/app/dispatch/page.tsx
git add deploy-fix-silent-courier-booking-failure.ps1
git commit -m "Surface real courier booking failures instead of always showing Dispatched!"
git push

Write-Host ""
Write-Host "Pushed. After it deploys, retry the same Fship test order -- the popup will now show Fship's real rejection reason (or a real AWB if it actually worked this time). Send me exactly what it says." -ForegroundColor Yellow
