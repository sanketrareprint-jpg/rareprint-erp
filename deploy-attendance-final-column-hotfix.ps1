# ── HOTFIX: Attendance page "Internal server error" on load and on import ──
# Run this from PowerShell on your own machine (not inside any sandbox).
#
# ROOT CAUSE: `prisma migrate deploy` reported success on the last deploy,
# but the actual "isFinal" column was never created on the production
# AttendanceImportSession table (this repo's _prisma_migrations table has
# drifted before and silently skipped real column creation — same exact bug
# class as ensure-shipment-bigship-columns.js, ensure-customer-phone2-column.js,
# and ensure-commission-override-table.js, all already in this codebase for
# that reason). Since the Prisma Client generated on deploy DOES expect that
# column (schema.prisma has it), every query touching AttendanceImportSession
# — importing, listing import history, opening the grid, and salaryForMonth's
# new "which sheet is Final" lookup — throws a raw DB error, which is the
# generic "Internal server error" you're seeing everywhere on that page.
#
# FIX: added scripts/ensure-attendance-final-column.js, following the exact
# same self-heal pattern already used for those 3 earlier incidents — it
# runs on every boot (registered in railway-migrate.js) and adds the column
# directly via raw SQL if it's missing, independent of whether Prisma's own
# migration bookkeeping thinks it already ran. No data is touched or lost.
#
# Files changed: backend/scripts/ensure-attendance-final-column.js (new),
# backend/scripts/railway-migrate.js

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

Set-Location "$repo\backend"
npm install
npm run build

Set-Location $repo
git add backend/scripts/ensure-attendance-final-column.js
git add backend/scripts/railway-migrate.js
git add deploy-attendance-final-column-hotfix.ps1
git commit -m "Hotfix: self-heal missing AttendanceImportSession.isFinal column (prisma migrate deploy drift), same pattern as the shipment/customer-phone2/commission-override fixes"
git push
