# ── Deploy: attendance import still silently used the wrong sheet ────────
# Run this from PowerShell on your own machine (not inside any sandbox).
# Stop and check the output at each step before moving to the next.
#
# ROOT CAUSE (confirmed against the actual machine export Sanket uploaded,
# "UPDATE SHEETS.01 (1).xls" — Sunitha's July hours were coming out as ~33
# instead of ~115):
#
#  The Aug 6 fix (commit c6a62e1) made findExceptionSheet() match the
#  "Exception Stat." sheet by CONTENT instead of by name, specifically to
#  handle the case where that tab gets renamed/the original deleted (data
#  ends up on a plain "Sheet1"). But it only ever returns the FIRST matching
#  sheet in workbook order — it assumed there'd only ever be ONE candidate.
#
#  What actually happened: someone duplicated "Exception Stat." into a new
#  "Sheet1" tab and hand-corrected Sunitha's in/out times there for the days
#  the thumb reader missed (she joined 15th, only started punching 21st) —
#  WITHOUT deleting the original tab. So the workbook had TWO sheets that
#  both look like the report. Sheet order in this file is
#  [..., "Exception Stat.", "Sheet1"], so the old code always silently
#  picked "Exception Stat." (the stale, uncorrected data) and never touched
#  the hand-corrected "Sheet1" — no error, just quietly wrong hours.
#  Verified directly: running the old matching logic against the real file
#  returns "Exception Stat." every time; Sunitha's computed total from that
#  sheet is ~31 hours (matches the "33 something" Sanket saw), vs ~115 hours
#  from "Sheet1".
#
# THE FIX: findExceptionSheet() now collects ALL sheets that match (by
# title text, then by header shape, then by name) instead of returning the
# first one. If exactly one candidate — same behavior as before, nothing
# changes for normal imports. If MORE THAN ONE candidate, it now throws a
# clear error naming every ambiguous tab and asking the user to delete the
# one(s) they don't want before re-uploading, instead of silently guessing.
# This is what "make sure it doesn't happen again" means here: a future
# duplicate-sheet mistake now fails loudly on upload instead of quietly
# paying someone for fewer hours than they worked.
#
# Sanket: because of this fix, re-uploading "UPDATE SHEETS.01 (1).xls" as-is
# will now be REJECTED with that ambiguity error (both tabs still present).
# Use the already-provided single-sheet corrected file instead ("Exception
# Stat - July 2026 (corrected, Sunitha included).xlsx"), or delete the old
# "Exception Stat." tab from your file and keep only "Sheet1", then re-import.
# After a clean re-import, also check Attendance > Import history — if an
# OLDER July session is still marked "Final", mark the new correct one Final
# instead (older Final sessions block the grid from showing any new import).
#
# File touched: backend/src/attendance/attendance.service.ts

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

# 1. Backend: local build check.
Set-Location "$repo\backend"
npm install
npm run build

# 2. Commit and push — this is what actually triggers Railway to build
#    and deploy the backend. No migration step needed (no schema change).
Set-Location $repo
git add backend/src/attendance/attendance.service.ts
git add deploy-attendance-duplicate-sheet-fix.ps1
git commit -m "Attendance import: refuse to guess when multiple sheets look like the Exception report, instead of silently picking the first (stale) one"
git push
