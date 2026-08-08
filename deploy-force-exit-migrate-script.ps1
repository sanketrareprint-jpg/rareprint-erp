# -- The actual fix: railway-migrate.js wasn't exiting after finishing -----
# Run this from PowerShell on your own machine (not inside any sandbox).
#
# Found it. The deploy log confirms railway-migrate.js's very last line
# ("[railway-migrate] All steps complete, handing off to the app...") always
# prints successfully -- but main.ts's first diagnostic line (which is the
# literal first statement in the compiled file, before any require calls)
# never shows up. That only makes sense if `node dist/src/main.js` is never
# actually being started -- meaning `node scripts/railway-migrate.js` isn't
# truly exiting after printing its last line, so the shell's
# `&&` never gets to run the second command.
#
# railway-migrate.js never called process.exit() -- it just fell off the end
# of the file and relied on Node exiting on its own once the event loop is
# empty. All the migration/ensure-script work is done through spawnSync
# (fully synchronous, blocks until each child exits), so there shouldn't be
# anything left dangling by the time execution reaches the last line -- but
# evidently something is. Rather than keep chasing the exact internal reason,
# this forces the issue: an explicit process.exit(0) as the true last thing
# the script does, removing any ambiguity about whether it's actually done.
#
# File changed: backend/scripts/railway-migrate.js

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

Set-Location "$repo\backend"
npm install
npm run build

Set-Location $repo
git add backend/scripts/railway-migrate.js
git add deploy-force-exit-migrate-script.ps1
git commit -m "Force railway-migrate.js to exit explicitly after finishing - was silently never handing off to the app"
git push

Write-Host ""
Write-Host "Pushed. Watch Railway's Deployments tab and paste the new log either way." -ForegroundColor Yellow
