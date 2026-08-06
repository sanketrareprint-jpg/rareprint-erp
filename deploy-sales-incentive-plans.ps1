# ── Deploy: Sales Incentive Plans + allowances on HR/Payroll ─────────────
# Run this from PowerShell on your own machine (not inside any sandbox).
# Stop and check the output at each step before moving to the next.
#
# What this ships:
#
#  - New "SalesIncentivePlan" table — admin-managed templates (e.g. "Plan
#    A" / "Plan B" / "Plan C"), each with a monthly sales target and an
#    incentive % of actual sales. Managed from a new collapsible "Sales
#    Incentive Plans" panel on the HR page (same style as the existing
#    Terms & Conditions panel).
#  - Employee Master Record gets three new fields: Sales Incentive Plan
#    (dropdown, picks one of the plans above), Petrol Allowance, and SIM
#    Recharge Allowance (both flat monthly ₹ amounts).
#  - Payroll calculation (HrService.salaryForMonth) now folds these into
#    the payable salary:
#      * incentiveAmount = incentivePct × the employee's ACTUAL sales that
#        month (via their linked login's orders) — not the target. So it
#        naturally scales down if they fall short instead of paying zero;
#        monthlyTarget is only used for a "target achieved" flag.
#      * + flat petrolAllowance + simAllowance
#    Same approval gate as before (Sanket must approve the master record
#    before any of this is actually payable) — editing any of these three
#    new fields also re-locks approval, same as base salary/hours already do.
#  - Attendance page's salary breakdown now shows the incentive/allowance
#    lines when they apply (Salary & Commission page still shows the
#    correct bottom-line total, just without the new breakdown rows).
#
#  Files touched:
#    backend/prisma/schema.prisma
#    backend/prisma/migrations/20260806120000_add_sales_incentive_plan
#    backend/src/hr/hr.service.ts
#    backend/src/hr/hr.controller.ts
#    frontend/app/hr/page.tsx
#    frontend/app/attendance/page.tsx

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

# 1. Backend: local build check — this also runs `prisma generate`, which
#    will fail loudly here if the new schema has a mistake.
Set-Location "$repo\backend"
npm install
npm run build

# 2. Frontend: build check.
Set-Location "$repo\frontend"
npm install
npm run build

# 3. Apply the new migration to the database right now.
#    (Optional — Railway's start script runs `prisma migrate deploy`
#    automatically on every deploy anyway, so skip this if you'd rather
#    just let step 4 handle it. Not optional if you've had migration
#    issues before — see the note at the bottom.)
Set-Location "$repo\backend"
npx prisma migrate deploy

# 4. Commit and push — this is what actually triggers Railway to build
#    and deploy both the backend and frontend.
Set-Location $repo
git add backend/prisma/schema.prisma
git add backend/prisma/migrations/20260806120000_add_sales_incentive_plan
git add backend/src/hr/hr.service.ts
git add backend/src/hr/hr.controller.ts
git add frontend/app/hr/page.tsx
git add frontend/app/attendance/page.tsx
git add deploy-sales-incentive-plans.ps1
git commit -m "Add Sales Incentive Plans (target/percentage) + petrol/SIM allowances to HR payroll"
git push

# ── After deploying ───────────────────────────────────────────────────────
# Go to HR page > "Sales Incentive Plans" panel > add Plan A/B/C with their
# target + %. Then open each relevant employee's Master Record, pick their
# plan, and set petrol/SIM allowance amounts if applicable. Note: editing
# these fields on an already-approved employee will re-lock payroll
# approval until Sanket approves again — same behavior as changing base
# salary or working hours already has.
#
# If `npx prisma migrate deploy` above errors with P3009 (a stuck earlier
# migration), see the fix from the attendance-import-perf-fix work:
#   npx prisma migrate resolve --rolled-back <stuck migration name>
#   npx prisma migrate deploy
