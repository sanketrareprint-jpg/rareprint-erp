# ── Customer name/address always saved in caps ─────────────────────────────
# Run this from PowerShell on your own machine (not inside any sandbox).
#
# Going forward: whenever an order is created or edited, the customer's name
# and address (address/city/state — not phone, email, pincode) are converted
# to ALL CAPS before being saved, no matter how the sales agent typed them.
#
# Files changed: backend/src/orders/orders.service.ts (createOrder + editOrder)
#
# This does NOT fix orders/customers already in the database — that needs a
# one-time backfill (backend/scripts/backfill-uppercase-customer-fields.js),
# which this script does NOT run automatically. After deploying, run it
# yourself:
#
#   cd backend
#   node scripts/backfill-uppercase-customer-fields.js            (dry run first — prints what would change)
#   node scripts/backfill-uppercase-customer-fields.js --apply    (then actually apply it)
#
# It only touches businessName, contactPerson, shippingAddress,
# billingAddress, city, state — nothing else.

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

Set-Location "$repo\backend"
npm install
npm run build

Set-Location $repo
git add backend/src/orders/orders.service.ts
git add backend/scripts/backfill-uppercase-customer-fields.js
git add deploy-uppercase-customer-name-address.ps1
git commit -m "Orders: always store customer name/address in caps; add one-time backfill script for existing customers"
git push

Write-Host ""
Write-Host "Deployed. Now run the backfill for EXISTING customers (dry run first):" -ForegroundColor Yellow
Write-Host "  cd backend" -ForegroundColor Yellow
Write-Host "  node scripts/backfill-uppercase-customer-fields.js" -ForegroundColor Yellow
Write-Host "  node scripts/backfill-uppercase-customer-fields.js --apply" -ForegroundColor Yellow
