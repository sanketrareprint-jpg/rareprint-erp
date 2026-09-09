# ── Deploy: thinner Orders cards (tap-to-expand) + dashboard load-time fix ──
# Run this from PowerShell on your own machine (not inside any sandbox).
# Stop and check the output at each step before moving to the next.
#
# What this ships (Android app only — website untouched, see useIsNativeApp):
#  - app/orders/page.tsx: mobile order cards now collapse to a single thin
#    summary row (order #, customer, balance) by default on the Android app;
#    tap a card to expand and see the stats grid, item list, and action
#    buttons. All the same info as before, just hidden until you ask for it.
#  - app/dashboard/page.tsx: the three call-compliance widgets were being
#    fetched one after another — each with its own CORS preflight round trip
#    on the Android app — which is what made the dashboard feel like it hung.
#    Now fetched in parallel (Promise.allSettled), so load time is roughly
#    the slowest single call instead of the sum of all three.
#
# No backend/schema changes — frontend only.

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

Set-Location "$repo\frontend"
npm install
npm run build

Set-Location $repo
git add .
git commit -m "Android app: collapse Orders cards to a thin summary row, parallelize dashboard call-compliance fetches"
git push
