# ── Orders search: fix "no orders found" when backend already found one ────
# Run this from PowerShell on your own machine (not inside any sandbox).
#
# Bug: searching "1206" showed "Showing 0 of 1" / "No orders found", even
# though the backend correctly reported total=1 for that search.
#
# Root cause: GET /orders and /orders/ready-for-dispatch already do the
# search + status filtering server-side. The frontend was ALSO re-filtering
# the already-filtered `orders` array client-side (checking orderNo,
# customerName, customerPhone, salesAgentName, products against the search
# text again). That re-filter was redundant and buggy two ways:
#   1. Its useMemo dependency array tracked `search` (updates every
#      keystroke) but the filter logic read `debouncedSearch` (updates
#      400ms after typing stops) — a stale-closure bug that could leave it
#      re-checking against an out-of-date search term.
#   2. Even when not stale, the client-side field checks don't perfectly
#      mirror the backend's OR-query — an order matched server-side via
#      phone/agent/product could still get dropped by this second pass.
#
# Fix: removed the redundant client-side matchSearch/matchStatus re-filter
# entirely. `orders` / `readyOrders` are already correctly scoped by the
# backend; filteredOrders now just picks the right tab-subset of that
# already-correct data.
#
# File changed: frontend/app/orders/page.tsx

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

Set-Location "$repo\frontend"
npm install
npm run build

Set-Location $repo
git add frontend/app/orders/page.tsx
git add deploy-orders-search-fix.ps1
git commit -m "Orders: fix search dropping backend-matched results via redundant/stale client-side re-filter"
git push
