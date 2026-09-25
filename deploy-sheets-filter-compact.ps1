# ── Deploy: compact the Sheets tab filter bars on Production page ──────────
# Run this from PowerShell on your own machine (not inside any sandbox).
# Stop and check the output at each step before moving to the next.
#
# What changed (frontend only, no schema/migration, no backend):
#  - app/production/page.tsx (Sheets tab):
#     - Shrunk the main tab pills, sheet sub-tabs (Unassigned/Created/
#       Processing/History), search box, and "Auto Create ERP Sheets"
#       button — smaller padding/text. Button shows just "Auto Create" on
#       narrow screens instead of wrapping to 2 lines.
#     - Un-stuck the two dropdown filter bars (Product/Size/GSM/Sides on
#       Unassigned; Sheet/Product/GSM/Size/Vendor on Processing) — they
#       were BOTH sticky at the same time as the tabs/search bar, which is
#       why so little of the actual sheet list was visible while scrolling.
#       Now only the tabs/search row stays pinned; the dropdown filters
#       scroll away with the list.
#     - Dropdown filter rows scroll sideways on narrow screens instead of
#       each filter wrapping onto its own row.
#
#  NOTE: these changes are plain Tailwind classes on shared JSX, not scoped
#  behind the is-native-app class (unlike deploy-android-only-ui-fix.ps1),
#  so the same compacting will show on the live website too, not just the
#  Android app. Check the website's Production > Sheets tab after deploying
#  — if you want this Android-only, say so and it can be scoped the same
#  way that fix was.

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
git add frontend/app/production/page.tsx
git commit -m "Compact Sheets tab filter bars on Production page; stop double-sticky stacking"
git push
