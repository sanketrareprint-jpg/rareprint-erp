# ── Deploy: Commission column always showing "No cost" ────────────────────
# Run this from PowerShell on your own machine (not inside any sandbox).
# Stop and check the output at each step before moving to the next.
#
# ROOT CAUSE (no migration involved, no schema change):
#
#  The recent change that made the Commission column visible to sellers +
#  admins (not just the owner) only updated the FRONTEND permission check
#  (canViewCommission in orders/page.tsx). The BACKEND never got the matching
#  update — commissionTotal/commissionPctOfSale were still computed only
#  when `includeMargin` was true, and includeMargin is hardcoded to
#  `user.fullName === 'Sanket Admin'` (the Margin feature is intentionally
#  owner-only, since it exposes cost/profitability).
#
#  Result: the Commission column was visible to everyone, but the backend
#  never computed a value for anyone except that one exact account — every
#  order, for every user, showed "No cost" regardless of whether cost data
#  actually existed.
#
#  FIX: added a separate includeCommission flag (Commission: ADMIN or
#  SALES_AGENT role, or the owner — Margin: owner only, unchanged) and split
#  the two so commission is computed independently of margin.
#
#  Files changed:
#    backend/src/orders/orders.controller.ts — pass includeCommission from role
#    backend/src/orders/orders.service.ts     — compute + return it separately
#
#  Note: individual orders can still legitimately show "No cost" if a
#  product on that order has no cost slab entered in Cost Table yet — that
#  part is a data gap, not this bug, and is unaffected by this fix.

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

# 1. Backend: build check.
Set-Location "$repo\backend"
npm install
npm run build

# 2. Commit and push — triggers Railway to build and deploy the backend.
#    No frontend changes this time.
Set-Location $repo
git add backend/src/orders/orders.controller.ts
git add backend/src/orders/orders.service.ts
git add deploy-commission-no-cost-fix.ps1
git commit -m "Fix Commission column always showing No cost: compute commission independently of the owner-only Margin gate"
git push
