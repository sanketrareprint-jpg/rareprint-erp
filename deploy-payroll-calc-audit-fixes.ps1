# ── Deploy: Payroll/attendance calculation audit — 3 real bugs found ──────
# Run this from PowerShell on your own machine (not inside any sandbox).
# Stop and check the output at each step before moving to the next.
#
# You asked me to check the whole attendance -> payroll calculation chain for
# mistakes before they hit real pay. Found 3 confirmed bugs (not theoretical —
# traced through the code, and #1 verified against your real UPDATE SHEETS.01
# file). computeHoursWorked() and parseTimeCell() themselves (fixed earlier)
# are correct — these are three separate, older issues.
#
# 1. "Unpaid" leave was paying like paid leave.
#    salaryForMonth() summed EVERY leave-ledger entry's days into leaveDays,
#    which reduces requiredHours — i.e. it excuses that day from needing to
#    be worked. But excusing a day is exactly what should happen for PAID/
#    SICK/CASUAL leave, and exactly what should NOT happen for UNPAID leave
#    (an unpaid day should still count against required hours, so the
#    shortfall naturally docks pay). "Unpaid" is a real, selectable option in
#    the HR leave-entry dropdown — so anyone marking a day Unpaid was
#    actually having that day's required hours forgiven, the opposite of the
#    intent. Fixed: only non-UNPAID leave types now reduce requiredHours.
#
# 2. The Attendance page's "Paid Leave" checkbox did nothing for pay.
#    That checkbox sits right next to "Absent" and looks like it should
#    protect a day's pay the same way ticking Absent marks it unworked. But
#    salaryForMonth() only ever read the separate leave ledger (added via the
#    HR page) — it never looked at AttendanceRecord.isPaidLeave at all. So
#    ticking "Paid Leave" on the Attendance grid was purely cosmetic; the day
#    still counted as a shortfall unless someone ALSO added a matching entry
#    in the HR leave ledger. Fixed: grid-ticked paid-leave days (that don't
#    already have a ledger entry for that date, to avoid double-counting) now
#    reduce requiredHours too.
#
# 3. A punch-in with no punch-out was silently paid as 0 hours, unflagged.
#    "Needs review" (Attendance grid) and "days missing punch" (Salary tab)
#    both required BOTH timeIn AND timeOut to be blank. A day where the thumb
#    caught the morning scan but missed the evening one has timeIn set, so it
#    slipped through both checks: not absent, not flagged, just quietly 0
#    hours worked. Verified directly against UPDATE SHEETS.01.xls — 2 real
#    rows have exactly this shape (Divya, 27 Jul; employee ID 12, 2 Jul).
#    Fixed: both checks now flag on hoursWorked === 0 alone.
#
# What this does NOT touch: already-stored July attendance/salary figures
# are not retroactively recalculated by deploying this — salaryForMonth()
# computes live from stored records each time it's viewed, so re-opening a
# past month's Salary tab after this deploys will already reflect the fix
# for that month's leave entries and punch data as currently stored. No data
# migration needed.
#
# Files changed: backend/src/attendance/attendance.service.ts, backend/src/hr/hr.service.ts

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

# 1. Backend: build check.
Set-Location "$repo\backend"
npm install
npm run build

# 2. Commit and push — triggers Railway to build and deploy the backend.
Set-Location $repo
git add backend/src/attendance/attendance.service.ts
git add backend/src/hr/hr.service.ts
git add deploy-payroll-calc-audit-fixes.ps1
git commit -m "Payroll calc audit: unpaid leave no longer forgives required hours, grid Paid Leave checkbox now actually affects pay, punch-in-without-punch-out days are now flagged/counted instead of silently 0"
git push
