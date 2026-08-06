# ── Deploy: fix slow/hanging attendance report import ────────────────────
# Run this from PowerShell on your own machine (not inside any sandbox).
# Stop and check the output at each step before moving to the next.
#
# The bug: importFromMachineReport (backend/src/attendance/attendance.service.ts)
# looped over every row in the uploaded report and, for EACH row, awaited a
# findUnique THEN an upsert — two sequential round trips to the remote
# production database, one row at a time. A single month's report (e.g. 20
# employees × ~30 days = ~600 rows) meant ~1,200 one-at-a-time DB round
# trips, which is what made the import spinner run for a very long time
# (and get slower as headcount/period grows).
#
# The fix: fetch every existing AttendanceRecord for the affected employees
# + report period in ONE query up front (used to decide skip-vs-import, same
# logic as before — manually-corrected days are still never overwritten),
# then fire all the upserts concurrently instead of sequentially. Same
# create/update data, same "don't clobber MANUAL/EDITED days" rule, same
# response shape — just no longer one-row-at-a-time.
#
# File touched: backend/src/attendance/attendance.service.ts

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

# 1. Backend: local build check.
Set-Location "$repo\backend"
npm install
npm run build

# 2. Commit and push — this is what actually triggers Railway to build
#    and deploy the backend. No migration step needed.
Set-Location $repo
git add backend/src/attendance/attendance.service.ts
git add deploy-attendance-import-perf-fix.ps1
git commit -m "Fix slow attendance report import — batch DB calls instead of one row at a time"
git push
