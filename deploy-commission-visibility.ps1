# ── Deploy: Commission column visible to sellers + admins ────────────────
# Run this from PowerShell on your own machine (not inside any sandbox).
# Stop and check the output at each step before moving to the next.
#
# What changed (frontend only — the backend already sends commissionTotal/
# commissionPctOfSale to everyone; only the frontend was hiding it):
#
#  Orders tab: the "Commission" column/card (desktop table + mobile card
#  view) now shows for every SALES_AGENT/AGENT and ADMIN account, not just
#  the owner ("Sanket Admin"). The "Margin" column stays owner-only —
#  unlike commission, margin exposes cost/profitability, which is more
#  sensitive.
#
#  frontend/app/orders/page.tsx:
#    - new `canViewCommission` alongside the existing owner-only
#      `canViewMargin`
#    - Commission header/cell/mobile-card block switched from
#      canViewMargin to canViewCommission
#    - table colspan and mobile grid-cols math updated so columns still
#      line up correctly for each visibility combination
#
#  NOTE: frontend/app/orders/page.tsx already had other unrelated pending
#  changes in the working tree before this — `git add` below picks up all
#  current changes to that file.

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

# 1. Frontend: build check.
Set-Location "$repo\frontend"
npm install
npm run build

# 2. Commit and push — this is what actually triggers Railway to build
#    and deploy the frontend. No backend/migration step needed.
Set-Location $repo
git add frontend/app/orders/page.tsx
git add deploy-commission-visibility.ps1
git commit -m "Show Commission column to sellers and admins, not just the owner"
git push
