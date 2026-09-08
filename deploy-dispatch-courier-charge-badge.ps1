# -- Deploy: courier charge badge next to COD on Dispatch Queue order cards --
# Run this from PowerShell on your own machine (not inside any sandbox).
# Stop and check the output at each step before moving to the next.
#
# What changed (frontend only -- no backend/schema changes; reuses the
# existing `courierChargeQuoted` field already returned by the dispatch
# queue API, which is set from the courier charge the sales agent enters
# when submitting the order for dispatch approval):
#
#  Dispatch Queue page: each order card now shows the courier charge as a
#  small badge (truck emoji + amount) right next to the COD/PREPAID badge,
#  before the customer name and address. Previously this same figure was
#  only shown further right, next to the item count/weight/pickup info --
#  it has been moved from there to avoid showing it twice.
#
#  File touched: frontend/app/dispatch/page.tsx
#
# NOTE: `git status` on this repo currently shows a large number of other
# files as modified (migrations, package.json, workflow files, etc.) that
# were not touched by this change -- looks like a pre-existing line-ending
# or local-state issue unrelated to this feature. This script only stages
# frontend/app/dispatch/page.tsx and itself, so none of that gets pushed.
# Worth a look separately if you didn't expect those files to be dirty.

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

# 1. Frontend: build check.
Set-Location "$repo\frontend"
npm install
npm run build

# 2. Commit and push -- this is what actually triggers Vercel/Railway to
#    build and deploy the frontend. No backend/migration step needed.
Set-Location $repo
git add frontend/app/dispatch/page.tsx
git add deploy-dispatch-courier-charge-badge.ps1
git commit -m "Dispatch Queue: show courier charge badge next to COD on order cards"
git push
