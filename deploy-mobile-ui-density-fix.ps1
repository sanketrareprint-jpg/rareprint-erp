# ── Deploy: slimmer mobile order cards + removed redundant bottom nav ───
# Run this from PowerShell on your own machine (not inside any sandbox).
# Stop and check the output at each step before moving to the next.
#
# What changed (frontend only, no schema/migration, no backend):
#  - app/orders/page.tsx: mobile order cards use tighter padding/spacing —
#    same info, less vertical space per order.
#  - components/dashboard-shell.tsx: removed the bottom navigation bar on
#    mobile (redundant with the hamburger menu, which already lists every
#    page). The main content area now uses that reclaimed space.
#  - app/globals.css: a few more Tailwind utility classes (.p-3, .px-3,
#    .py-2, .mt-2, .mt-3) get a modest padding/margin reduction on mobile
#    (<=768px) — this automatically slims down other list/card pages too
#    (production, etc.) without editing each one individually, plus a
#    light overall density pass as requested.

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

# 1. Frontend: build check.
Set-Location "$repo\frontend"
npm install
npm run build

# 2. Commit and push — this deploys the live website. For the Android app,
#    you'll still need to rebuild it separately (npm run build:android,
#    then Run in Android Studio) since it's a bundled local build, not a
#    live server.
Set-Location $repo
git add .
git commit -m "Slim down mobile order cards, remove redundant bottom nav, light density pass"
git push
