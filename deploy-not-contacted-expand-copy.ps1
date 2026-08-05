# ── Deploy: expand + copy Not-Contacted numbers per agent ────────────────
# Run this from PowerShell on your own machine (not inside any sandbox).
# Stop and check the output at each step before moving to the next.
#
# What changed (frontend only — no backend/schema changes; reuses the
# existing GET /call-compliance/agents/:id/stats endpoint):
#
#  Dashboard > "Not Contacted — by Agent": each agent row (with a nonzero
#  red count) is now clickable. Clicking it expands a panel listing that
#  agent's actual not-contacted numbers (name + phone), with a "Copy all"
#  button that copies the phone numbers (one per line) to the clipboard.
#  Respects the existing "Call compliance for: [month]" filter, and caches
#  per agent+month so re-expanding doesn't re-fetch.
#
#  Visibility matches the backend's existing permission rule on that
#  endpoint: ADMIN accounts can expand any agent's row; everyone else can
#  only expand their own row (others show no dropdown arrow at all, since
#  the request would 403 anyway).
#
#  File touched: frontend/app/dashboard/page.tsx
#
#  NOTE: this file already has other unrelated pending changes from
#  earlier work (dashboard profit/cashflow fix + the sales leaderboard
#  month filter) — `git add` below picks up all current changes to it.

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

# 1. Frontend: build check.
Set-Location "$repo\frontend"
npm install
npm run build

# 2. Commit and push — this is what actually triggers Railway to build
#    and deploy the frontend. No backend/migration step needed.
Set-Location $repo
git add frontend/app/dashboard/page.tsx
git add deploy-not-contacted-expand-copy.ps1
git commit -m "Dashboard: expand + copy not-contacted numbers per agent"
git push
