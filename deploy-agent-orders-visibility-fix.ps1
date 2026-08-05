# ── Deploy: sales agents couldn't see their own orders ────────────────────
# Run this from PowerShell on your own machine (not inside any sandbox).
# Stop and check the output at each step before moving to the next.
#
# ROOT CAUSE (no migration involved, no schema change):
#
#  GET /orders and GET /orders/ready-for-dispatch never filtered by sales
#  agent server-side — every account (any role) got the same unscoped,
#  paginated list of ALL orders, most-recent-first.
#
#  The frontend tried to compensate by filtering the *already-fetched page*
#  down to `o.salesAgentName === currentUser.fullName` for SALES_AGENT
#  accounts. That breaks under pagination: an agent's own orders are
#  scattered throughout the full list (391 orders, sorted by date), not
#  clustered on page 1 — so unless their orders happened to land on the one
#  page already loaded, they saw nothing, while the tab counts (which read
#  the server's unscoped total) kept showing the full company-wide numbers.
#  That's exactly the "391 total / 61 ready / 0 rows shown" mismatch seen
#  live on a fresh SALES_AGENT test account.
#
#  FIX: scope both queries server-side instead, using the role/id already
#  in the JWT (never trusted from the client) — where.salesAgentId is now
#  set whenever req.user.role === 'SALES_AGENT'. Removed the now-redundant
#  (and fragile — name-matching instead of ID-matching) client-side filters.
#
#  Files changed:
#    backend/src/orders/orders.controller.ts  — pass salesAgentId from JWT
#    backend/src/orders/orders.service.ts     — filter by it in both queries
#    frontend/app/orders/page.tsx             — drop client-side re-filter

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

# 1. Backend: build check.
Set-Location "$repo\backend"
npm install
npm run build

# 2. Frontend: build check.
Set-Location "$repo\frontend"
npm install
npm run build

# 3. Commit and push — triggers Railway (backend) + Vercel (frontend) deploys.
Set-Location $repo
git add backend/src/orders/orders.controller.ts
git add backend/src/orders/orders.service.ts
git add frontend/app/orders/page.tsx
git add deploy-agent-orders-visibility-fix.ps1
git commit -m "Fix sales agents not seeing their own orders: scope /orders + /orders/ready-for-dispatch server-side by salesAgentId instead of a broken client-side name filter"
git push
