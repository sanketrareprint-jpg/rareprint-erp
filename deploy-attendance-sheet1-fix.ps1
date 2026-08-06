# ── Deploy: Attendance import — accept "Sheet1" export, confirm hours are
#            already auto-calculated from on-duty/off-duty ────────────────
# Run this from PowerShell on your own machine (not inside any sandbox).
# Stop and check the output at each step before moving to the next.
#
# Two things were asked; only one needed a code change:
#
#  1. "Total(Min)" vs auto-calculating from on-duty/off-duty — ALREADY
#     correct, no change needed. The import has always computed hoursWorked
#     purely from the On-duty/Off-duty columns (computeHoursWorked()) and
#     never reads the report's own Total(Min) column at all — confirmed by
#     reading the code, not assumed. So manually-edited on-duty/off-duty
#     times were already recalculated correctly; Total(Min) was dead weight
#     in the source file, not something the ERP depended on.
#
#  2. Sheet detection — this WAS the actual bug, now fixed. The import only
#     accepted a sheet literally named "Exception Stat." When that tab gets
#     deleted before uploading (to avoid two sheets meaning the same thing)
#     the same data lands on whatever sheet is left — in the file you sent,
#     literally "Sheet1". findExceptionSheet() now matches by CONTENT (the
#     report's own "Exception Statistic Report" title text first, then its
#     ID/Name/Date/On-duty header shape) instead of trusting the sheet's
#     name, so it keeps working regardless of what the tab is called.
#     Verified directly against "UPDATE SHEETS.01.xls": 620 rows parsed,
#     20 employees, hours computed correctly (e.g. 11:07-19:57 = 8.83 hrs).
#
#  File changed: backend/src/attendance/attendance.service.ts

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

# 1. Backend: build check.
Set-Location "$repo\backend"
npm install
npm run build

# 2. Commit and push — triggers Railway to build and deploy the backend.
Set-Location $repo
git add backend/src/attendance/attendance.service.ts
git add deploy-attendance-sheet1-fix.ps1
git commit -m "Attendance import: detect the Exception Statistic Report sheet by content, not just the name 'Exception Stat.' (fixes import when that tab is deleted and data ends up on Sheet1)"
git push
