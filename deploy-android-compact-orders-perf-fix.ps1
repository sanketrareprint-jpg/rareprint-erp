# ── Deploy: collapsible Orders cards + faster dashboard (Android app) ──────
# Run this from PowerShell on your own machine (not inside any sandbox).
# Stop and check the output at each step before moving to the next.
#
# What changed:
#  - app/orders/page.tsx: Android app only — each order card now collapses
#    to a single thin summary row (order #, customer, balance) like a
#    website table row. Tap a row to expand and see items/stats/actions.
#    The website's Orders page is untouched (always shows the full card,
#    same as before).
#  - app/globals.css: extended the Android-only density pass to a few more
#    spacing classes (space-y-2/3, gap-2/3, p-4) used by other bulky card
#    lists (e.g. production). Website untouched.
#  - app/dashboard/page.tsx: the three call-compliance widgets were being
#    fetched one after another (three sequential round trips, each with its
#    own CORS preflight) — now fetched in parallel. This is a general perf
#    fix, applies to both the website and the app.
#
# No backend/schema changes.

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

# 1. Frontend: build check.
Set-Location "$repo\frontend"
npm install
npm run build

# 2. Commit and push — redeploys the live website (dashboard speed-up only;
#    Orders page and density pass are no-ops there since they're gated on
#    isNativeApp). For the Android app, also rebuild locally:
#      npm run build:android
#      npx cap open android   (then Run in Android Studio)
Set-Location $repo
git add .
git commit -m "Android app: collapsible Orders cards, wider density pass; dashboard: parallelize call-compliance fetches"
git push
