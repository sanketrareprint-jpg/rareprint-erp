# ── Deploy: fix date pickers showing MM/DD/YYYY instead of DD/MM/YYYY ────
# Run this from PowerShell on your own machine (not inside any sandbox).
# Stop and check the output at each step before moving to the next.
#
# What changed (frontend only — no schema/migration involved):
#  - Native <input type="date"> always displays dates using the browser's
#    OS/locale setting (MM/DD/YYYY on most Chrome installs) — there is no
#    HTML attribute that can override this, so this couldn't be fixed with
#    a simple attribute tweak.
#  - New frontend/components/DateInput.tsx: a drop-in replacement that
#    keeps the real native date input (same calendar picker, same
#    yyyy-mm-dd value format, same keyboard behavior) but overlays a
#    custom label that always renders DD/MM/YYYY, regardless of the
#    viewer's browser locale.
#  - Swapped all 28 <input type="date"> usages across 12 pages to
#    <DateInput>: accounts, admin/activity, attendance, bank-statement,
#    hr, settings, tasks, call-analysis/history, orders (incl. the Edit
#    Payment modal from the screenshot), reports, production.
#  - Verified with `npx tsc --noEmit` — no new type errors introduced.

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

# 1. Frontend: build check.
Set-Location "$repo\frontend"
npm install
npm run build

# 2. Commit and push — this is what actually triggers Railway to build
#    and deploy the frontend. No backend/migration step needed.
Set-Location $repo
git add frontend/components/DateInput.tsx
git add frontend/app/accounts/page.tsx
git add frontend/app/admin/activity/page.tsx
git add frontend/app/attendance/page.tsx
git add frontend/app/bank-statement/page.tsx
git add frontend/app/hr/page.tsx
git add frontend/app/settings/page.tsx
git add frontend/app/tasks/page.tsx
git add frontend/app/call-analysis/history/page.tsx
git add frontend/app/orders/page.tsx
git add frontend/app/reports/page.tsx
git add frontend/app/production/page.tsx
git add deploy-date-format-fix.ps1
git commit -m "Fix date pickers to always show DD/MM/YYYY regardless of browser locale"
git push
