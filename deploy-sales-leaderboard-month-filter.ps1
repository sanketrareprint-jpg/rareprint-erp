# ── Deploy: month filter on Sales Leaderboard ─────────────────────────────
# Run this from PowerShell on your own machine (not inside any sandbox).
# Stop and check the output at each step before moving to the next.
#
# What changed (frontend + backend, no schema/migration involved):
#
#  Dashboard > Sales Leaderboard now has a small month dropdown beside the
#  title. "This Month" (default) behaves exactly as before — no extra
#  network call, uses the data already loaded with the rest of the
#  dashboard. Picking any of the last 11 months fetches that month's
#  agent order counts/revenue specifically.
#
#  Backend: GET /dashboard/agent-leaderboard now accepts an optional
#  ?month=YYYY-MM query param (backend/src/dashboard/dashboard.service.ts,
#  backend/src/dashboard/dashboard.controller.ts). Omitting it keeps the
#  existing "current month" behavior used by /dashboard/summary.
#
#  Frontend: frontend/app/dashboard/page.tsx — new month <select>, fetch
#  effect, and leaderboard now renders from whichever source is active.
#
#  NOTE: frontend/app/dashboard/page.tsx already had other unrelated,
#  uncommitted changes sitting in your working tree before this (the
#  dashboard profit/cashflow fix — see deploy-orders-dashboard-fix.ps1).
#  `git add` below will pick up ALL current changes to that file, not just
#  this month filter. If you want them shipped as separate commits, run
#  deploy-orders-dashboard-fix.ps1 first, then this script.

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

# 1. Backend: local build check.
Set-Location "$repo\backend"
npm install
npm run build

# 2. Frontend: build check.
Set-Location "$repo\frontend"
npm install
npm run build

# 3. Commit and push — this is what actually triggers Railway to build
#    and deploy both the backend and frontend. No migration step needed.
Set-Location $repo
git add backend/src/dashboard/dashboard.service.ts
git add backend/src/dashboard/dashboard.controller.ts
git add frontend/app/dashboard/page.tsx
git add deploy-sales-leaderboard-month-filter.ps1
git commit -m "Add month filter to Sales Leaderboard on dashboard"
git push
