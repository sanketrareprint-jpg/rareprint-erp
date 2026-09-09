# ── HOTFIX: "New Paper Purchase Order" save fails with Internal server error ──
# Run this from PowerShell on your own machine (not inside any sandbox).
#
# ROOT CAUSE: migration 20260612000400_add_billing_fields_to_paper_po (adds
# PaperPurchaseOrder.transportCharges, PaperPurchaseOrder.totalBillAmount,
# PaperPurchaseItem.ratePerUnit) is already on the RECOVERABLE_MIGRATIONS
# list in backend/scripts/railway-migrate.js — meaning it's already known to
# be prone to drifting in _prisma_migrations (marked applied without the
# columns actually existing on the DB). But unlike every other recoverable
# migration, it never had a matching self-heal check in
# ensure-all-columns.js. createPurchaseOrder() writes those 3 columns via
# raw SQL ($executeRaw, since the Prisma Client may not have them typed),
# so if they're missing on the live DB, saving ANY purchase order — new
# items, existing ones, doesn't matter — throws a raw Postgres "column does
# not exist" error, which surfaces to the frontend as the generic
# "Internal server error" banner.
#
# FIX: added the same self-heal check to ensure-all-columns.js that every
# other recoverable migration on that list already has — checks
# information_schema for the 3 columns and adds any that are missing via
# ADD COLUMN IF NOT EXISTS. No data touched, additive only.
#
# Because this repo deliberately keeps Railway's startCommand as plain
# `node dist/src/main.js` (a migration step ahead of app start caused a real
# outage before — see team notes), this self-heal script is NOT guaranteed
# to run automatically on deploy. Run it locally against production once,
# per the established convention for this codebase.
#
# File changed: backend/scripts/ensure-all-columns.js

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

# 1. Backend: local build check.
Set-Location "$repo\backend"
npm install
npm run build

# 2. Commit and push (keeps the fix in version control / picked up by the
#    next full migrate run) — but the actual production fix happens in
#    step 3 below, not from this push alone.
Set-Location $repo
git add backend/scripts/ensure-all-columns.js
git add deploy-paper-po-billing-columns-hotfix.ps1
git commit -m "Hotfix: self-heal missing PaperPurchaseOrder/Item billing columns (transportCharges, totalBillAmount, ratePerUnit) — same drift pattern as courierChargeActual/Quoted and isFinal"
git push

# 3. Actually fix the live database — this is the step that matters here.
#    Safe to re-run any time; every check is IF NOT EXISTS / additive only.
Set-Location "$repo\backend"
node scripts/ensure-all-columns.js
