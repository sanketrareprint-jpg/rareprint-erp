# ── Deploy: Attendance import history + "imported for this month?" badge ──
# Run this from PowerShell on your own machine (not inside any sandbox).
# Stop and check the output at each step before moving to the next.
#
# What changed (frontend only, no backend/schema changes — the backend
# already logged every import as an AttendanceImportSession, it just wasn't
# shown anywhere):
#
#  Attendance page now has:
#   1. A collapsible "Import history" table under the upload panel, listing
#      every past import (period covered, file name, rows imported/found/
#      skipped, who imported it, when) — pulled from the existing
#      GET /attendance/import-sessions endpoint.
#   2. A status badge next to the Month/Year picker: green "Report imported
#      for <Month Year>" if any import session's period overlaps the
#      selected month, amber "No report imported yet" otherwise.
#
#  Both refresh automatically after a new import completes.
#
#  NOTE: frontend/app/attendance/page.tsx also already had other unrelated,
#  uncommitted changes sitting in your working tree before this — the
#  Employee/Month/Type dropdowns were switched to the existing MobileSelect
#  component (frontend/components/MobileSelect.tsx, already committed
#  separately in de64435) but that swap itself was never committed. `git add`
#  below will pick up BOTH changes together as one commit. If you want them
#  as separate commits, split frontend/app/attendance/page.tsx's diff
#  manually before running this.
#
# File touched: frontend/app/attendance/page.tsx
#
# NOT included here (already committed + pushed to origin/main separately,
# nothing to do): the attendance-import root-cause fixes (content-based
# sheet detection, Excel time-cell parsing) and the "Mark Final" sheet
# feature — those shipped 2026-08-06/07 and are already live.

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

# 1. Frontend: build check.
Set-Location "$repo\frontend"
npm install
npm run build

# 2. Commit and push — this is what actually triggers Railway to build
#    and deploy the frontend. No migration step needed.
Set-Location $repo
git add frontend/app/attendance/page.tsx
git add deploy-attendance-import-history.ps1
git commit -m "Attendance: show import history and per-month imported status"
git push
