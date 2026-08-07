# -- Diagnose + defend against the boot hang -------------------------------
# Run this from PowerShell on your own machine (not inside any sandbox).
#
# The Dockerfile PORT fix didn't resolve it -- the deploy log still stops
# at the exact same spot ("[ensure-company-holiday-table] Table already
# exists, skipping.") with nothing after, even on a genuinely fresh build.
# That rules out a Docker layer cache issue.
#
# This change does two things:
#
# 1. DIAGNOSTIC LOGGING, so the next deploy log tells us definitively where
#    it's actually stuck instead of us guessing:
#      - railway-migrate.js now logs a line right after the last ensure-
#        script call. If that line is missing from the next deploy log, the
#        hang is inside one of the ensure-*.js child processes (spawnSync
#        waiting for a child that never fully exits) -- not in the app.
#      - main.ts now logs before calling NestFactory.create(), after it
#        resolves, and right before/after app.listen(). If NONE of these
#        show up, dist/src/main.js was never reached at all.
#
# 2. DEFENSIVE FIX: every ensure-*.js script now calls process.exit(0)
#    explicitly after finishing (success or failure), instead of just
#    letting the script fall off the end and trusting Node to exit on its
#    own once the event loop empties. If a pg Client connection was leaving
#    some handle open after client.end() (a known class of Node/pg quirk),
#    that would keep the process alive forever with spawnSync stuck waiting
#    for it -- explicit process.exit(0) makes that impossible regardless of
#    the underlying cause.
#
# main.ts's bootstrap() call also now has a real .catch() that logs the
# error and exits non-zero, instead of a bare bootstrap() call that could
# leave a rejected promise as a silent unhandled rejection with no output.
#
# Files changed:
#   backend/scripts/railway-migrate.js
#   backend/scripts/ensure-company-holiday-table.js
#   backend/scripts/ensure-commission-override-table.js
#   backend/scripts/ensure-customer-phone2-column.js
#   backend/scripts/ensure-shipment-bigship-columns.js
#   backend/scripts/ensure-user-payment-keyword-table.js
#   backend/scripts/ensure-attendance-final-column.js
#   backend/src/main.ts

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

Set-Location "$repo\backend"
npm install
npm run build

Set-Location $repo
git add backend/scripts/railway-migrate.js
git add backend/scripts/ensure-company-holiday-table.js
git add backend/scripts/ensure-commission-override-table.js
git add backend/scripts/ensure-customer-phone2-column.js
git add backend/scripts/ensure-shipment-bigship-columns.js
git add backend/scripts/ensure-user-payment-keyword-table.js
git add backend/scripts/ensure-attendance-final-column.js
git add backend/src/main.ts
git add deploy-diagnose-boot-hang.ps1
git commit -m "Add boot diagnostics + explicit process.exit on ensure-scripts to find/fix the deploy hang"
git push

Write-Host ""
Write-Host "Pushed. Paste me the new deploy log after this one finishes (or hangs again) -- the new log lines will tell us exactly where it's stuck." -ForegroundColor Yellow
