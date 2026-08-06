# ── Deploy: Attendance import showing raw decimals (0.3854166) instead of
#            times ─────────────────────────────────────────────────────────
# Run this from PowerShell on your own machine (not inside any sandbox).
# Stop and check the output at each step before moving to the next.
#
# ROOT CAUSE (no migration involved, no schema change):
#
#  Excel stores a time-only cell as a fraction of 24h (e.g. 0.3854166... =
#  09:15) whenever the cell isn't explicitly formatted as text. In the
#  machine's export, some rows are text ("09:15") and some are actual time
#  values — the xlsx library's raw:true read returns the fraction as a plain
#  number for the latter. The parser was just stringifying whatever came
#  back (cellStr), so those cells landed in the database as literal strings
#  like "0.3854166666666667" instead of a real time.
#
#  Confirmed directly against UPDATE SHEETS.01.xls: 172 of 612 time cells in
#  that file are the numeric form (the rest were already clean "09:15"
#  strings) — matches exactly the rows shown broken on the Attendance page
#  (10 Fri, 11 Sat, 13 Mon, 14 Tue, 21 Tue, 22 Wed, 25 Sat, 28 Tue).
#
#  FIX: new parseTimeCell() handles both the numeric-fraction form and text
#  form (with or without seconds), always normalizing to "HH:MM".
#
#  File changed: backend/src/attendance/attendance.service.ts
#
#  IMPORTANT — this only fixes future imports. The already-stored bad values
#  for July are still in the database. After this deploys, re-upload the
#  same UPDATE SHEETS.01.xls file on the Attendance page — rows still tagged
#  source=IMPORTED (i.e. not yet hand-corrected) will be safely overwritten
#  with the correct times; anything you've already manually fixed is left
#  alone (manual edits always win on re-import).

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

# 1. Backend: build check.
Set-Location "$repo\backend"
npm install
npm run build

# 2. Commit and push — triggers Railway to build and deploy the backend.
Set-Location $repo
git add backend/src/attendance/attendance.service.ts
git add deploy-attendance-time-decimal-fix.ps1
git commit -m "Attendance import: convert Excel numeric time-fraction cells (e.g. 0.3854166) to HH:MM instead of storing the raw decimal"
git push
