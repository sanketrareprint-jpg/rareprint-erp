# -- Speed up the migrate+ensure phase (was eating 40-47s every deploy) ----
# Run this from PowerShell on your own machine (not inside any sandbox).
#
# The process.exit(0) fix didn't change anything either -- the log stopped
# at the exact same spot again. That rules out both "not exiting cleanly"
# and "hanging inside bootstrap()" as the cause.
#
# New angle: every deploy attempt, the migrate+ensure-script phase (before
# the app itself even starts) consistently takes 40-47 seconds and spawns 11
# separate subprocesses -- 4 `npx prisma migrate resolve` calls, 1
# `npx prisma migrate deploy`, and 6 separate `node scripts/ensure-x.js`
# processes, each paying its own Node startup + npx resolution + database
# connection overhead. If Railway has any deploy-readiness timeout in that
# neighborhood, this phase alone could be consuming it before the real app
# gets a chance to start -- which would look exactly like what we're seeing:
# always dies at the same point, every single time, regardless of which code
# changes were made afterward (since none of today's app-code changes ever
# touched this part of the boot sequence).
#
# This is worth doing regardless of whether it's the actual cause -- it's
# pure removable overhead either way:
#
#   1. Calls the local prisma binary directly (node_modules/.bin/prisma)
#      instead of going through npx, which pays its own resolution overhead
#      on every single call. 5 prisma invocations in this file.
#   2. Combines the 6 separate ensure-*.js scripts into one
#      ensure-all-columns.js that does all 6 checks over a SINGLE database
#      connection in a SINGLE Node process, instead of spawning 6 separate
#      processes each with their own startup + connect cost.
#
# Same idempotent checks, same behavior, just consolidated. The old
# individual ensure-*.js files are left in place (untouched, just no longer
# called from railway-migrate.js) in case anything else references them.
#
# Files changed:
#   backend/scripts/railway-migrate.js
#   backend/scripts/ensure-all-columns.js (new)

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

Set-Location "$repo\backend"
npm install
npm run build

Set-Location $repo
git add backend/scripts/railway-migrate.js
git add backend/scripts/ensure-all-columns.js
git add deploy-speed-up-boot-sequence.ps1
git commit -m "Speed up deploy boot sequence: skip npx overhead, consolidate 6 ensure-scripts into 1"
git push

Write-Host ""
Write-Host "Pushed. Paste the new deploy log either way." -ForegroundColor Yellow
