# ── Deploy: Attendance/Payroll — Final sheet, automatic paid leave, and the
#            2 real calc bugs from the earlier audit ──────────────────────
# Run this from PowerShell on your own machine (not inside any sandbox).
# Stop and check the output at each step before moving to the next.
#
# SUPERSEDES deploy-payroll-calc-audit-fixes.ps1 — do not run that one, it
# had a mistake (see "Correction" below). This script has everything.
#
# ── 1. NEW: "Mark Final" sheet per month ──────────────────────────────────
# You said re-uploads piling up per month was getting confusing — you want
# one deliberate, explicit "this is THE sheet" per month instead. Added:
#  - A "Final" button on each row of Import History (Attendance page).
#  - Marking one Final automatically un-finals any other upload that
#    overlaps the same month, so there's only ever one Final sheet per month.
#  - Once a month has a Final sheet, the Attendance grid and the Salary tab
#    both only read that sheet's rows for that month — any other upload
#    covering the same month is ignored. Your hand-corrected days (typed in
#    directly on the grid) always still apply on top, regardless of which
#    sheet they came from — those are explicit human corrections, not
#    something a re-upload should be able to silently override.
#  - Before you mark anything Final for a month, behaviour is unchanged from
#    today (shows everything imported/edited so far).
#
# ── 2. NEW: automatic 2-days-paid-leave-per-month credit ─────────────────
# Added a standing monthly credit that reduces required hours automatically,
# every month, with no ledger entry or checkbox needed:
#   16 hours (2 x 8h day) — Prajakta, Vaishali, Sandip, Yash, Deepak, Warsha, Sunita
#   14 hours (2 x 7h day) — everyone else
# This lowers requiredHours the same way the leave ledger does, so it flows
# straight into the payable salary calc (fewer required hours = less/no
# shortfall for those 2 days, same mechanism as any other paid leave).
# IMPORTANT: matched by the first name in Employee.fullName, case-
# insensitive (since the list you gave includes things like "Sandip Sir" and
# "Sunita Designer" which are probably not the literal stored name). Open
# each of these 7 employees' Salary tab after deploying and confirm
# "Auto paid leave" shows 16 hrs — if any show 14 instead, the name in HR
# doesn't contain the expected first name and needs a tweak on my end.
#
# ── 3. Correction to the earlier audit (deploy-payroll-calc-audit-fixes.ps1) ──
# That script's fix #1 (excluding "Unpaid" leave-ledger entries from
# reducing required hours) was WRONG — it contradicted a design note already
# in hr.service.ts saying this mirrors your old Google Sheet exactly, where
# leave of any kind (paid or unpaid) lowers the requirement rather than
# separately docking pay. I hadn't read that comment when I made that change
# last time. Reverted before it ever shipped — nothing to undo in production.
#
# ── 4. Kept from the earlier audit (these were real, and still fixed here) ──
#  - The Attendance grid's "Paid Leave" checkbox now actually reduces
#    required hours (it previously did nothing to pay — see prior notes).
#  - A punch-in with no punch-out is now flagged/counted instead of silently
#    showing 0 hours with no review flag.
#
# Files changed: backend/prisma/schema.prisma (+ new migration),
# backend/src/attendance/attendance.service.ts,
# backend/src/attendance/attendance.controller.ts,
# backend/src/hr/hr.service.ts, frontend/app/attendance/page.tsx

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

# 1. Backend: build check (this also runs `prisma generate`, and on Railway's
#    own deploy, `prisma migrate deploy` runs automatically before the server
#    starts — no manual DB step needed from you).
Set-Location "$repo\backend"
npm install
npm run build

# 2. Frontend: build check.
Set-Location "$repo\frontend"
npm install
npm run build

# 3. Commit and push — triggers Railway (backend) + Vercel (frontend) deploy.
Set-Location $repo
git add backend/prisma/schema.prisma
git add backend/prisma/migrations/20260806130000_add_attendance_final_sheet/
git add backend/src/attendance/attendance.service.ts
git add backend/src/attendance/attendance.controller.ts
git add backend/src/hr/hr.service.ts
git add frontend/app/attendance/page.tsx
git add deploy-attendance-final-sheet-and-payroll-fixes.ps1
git commit -m "Attendance: Mark Final sheet per month, automatic 2-day paid leave credit, fix paid-leave checkbox + missing-punch detection; revert incorrect unpaid-leave change from earlier audit"
git push
