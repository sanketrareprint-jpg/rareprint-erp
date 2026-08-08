# -- Stop running migrations during app boot on Railway --------------------
# Run this from PowerShell on your own machine.
#
# THEORY: The last deploy that definitely worked was "Add Attendance >
# Holidays tab" (commit 8773b1a). At that point, backend/railway.json's
# startCommand was just "node dist/src/main.js" -- no migration step.
#
# The very next commits (9a25243, 172a863, e245af1) changed startCommand to
# "node scripts/railway-migrate.js && node dist/src/main.js" so schema
# migrations would run automatically before the app starts. Every deploy
# since THAT change has hung/failed -- including many that touched nothing
# related to migrations at all (admin-delete, dispatch changes, this
# complaints fix). That timing lines up exactly with when things broke.
#
# All our diagnostics showed railway-migrate.js itself finishing cleanly
# every time (prints its final log line, ~40-47s). But node dist/src/main.js
# never printed even its very first line. The likely explanation: Railway
# has a boot/healthcheck timeout, and the ~40-47s the migrate step eats into
# that budget is enough that the container gets killed before the app's
# own logs even get flushed out -- which would look exactly like what we've
# been seeing, regardless of what app code changed.
#
# THE FIX: go back to exactly the startCommand that was last confirmed
# working -- no migration step at boot. Since you already have working
# access to production's DATABASE_URL from your machine (delete-order-item.js
# uses it), run migrations manually instead, whenever a change needs one:
#   cd backend
#   node scripts/railway-migrate.js
#
# This script (before pushing) runs that for you once now, so the
# CompanyHoliday table and any other pending schema changes are already
# applied before we go back to the simpler startCommand.
#
# File changed: backend/railway.json (startCommand reverted)

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

Set-Location "$repo\backend"
Write-Host "Running migrations against production now (one-time, before reverting boot behavior)..." -ForegroundColor Cyan
node scripts/railway-migrate.js

Write-Host ""
Write-Host "Building and deploying the reverted startCommand..." -ForegroundColor Cyan
npm run build

Set-Location $repo
git add backend/railway.json
git add deploy-revert-migrate-from-boot.ps1
git commit -m "Revert startCommand to last known-good: stop running migrations at boot"
git push

Write-Host ""
Write-Host "Pushed. Give it 2-3 minutes, then check the site. Paste the deploy log either way." -ForegroundColor Yellow
