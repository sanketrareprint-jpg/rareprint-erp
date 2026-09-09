# ── Deploy: Dashboard slow-load fix ───────────────────────────────────────
# Run this from PowerShell on your own machine (not inside any sandbox).
# Stop and check the output at each step before moving to the next.
#
# What was slow and why (backend only — no schema/migration involved):
#
#  /dashboard/summary fans out ~10 queries in parallel and the page waits on
#  all of them. Two were the main bottleneck:
#
#  1. getAvgProductionTime() — pulled EVERY order item that has ever reached
#     READY_FOR_DISPATCH across the company's entire history, each with its
#     full stage-log array AND full parent order row included, just to
#     compute a per-category average in JS. No date filter, no limit — this
#     only got slower as order history grew. This was the single biggest
#     contributor.
#
#  2. getCategoryStageQuantities() — pulled every active order item with a
#     product+category include, then summed quantities in JS instead of
#     letting the database do it.
#
#  Fix: both rewritten as SQL aggregates (GROUP BY / lateral joins), same
#  output shape the frontend already expects — no frontend changes needed.
#  Also wrapped both in the same 8s timeout-with-fallback pattern already
#  used for getProductionKpis, so if either is ever slow again it degrades
#  to an empty result instead of blocking the whole dashboard.
#
#  File changed: backend/src/dashboard/dashboard.service.ts

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

# 1. Backend: build check.
Set-Location "$repo\backend"
npm install
npm run build

# 2. Commit and push — this is what actually triggers Railway to build
#    and deploy the backend. No migration step needed.
Set-Location $repo
git add backend/src/dashboard/dashboard.service.ts
git add deploy-dashboard-perf-fix.ps1
git commit -m "Dashboard: replace unbounded in-memory aggregation with SQL for avg production time + category stage quantities"
git push
