# ── Deploy: dashboard profit display fix + cash-in/cash-out cashflow ────
# Run this from PowerShell on your own machine (not inside any sandbox).
# Stop and check the output at each step before moving to the next.
#
# What changed (no schema/migration involved — pure code changes):
#  - frontend/app/dashboard/page.tsx: fmt() now abbreviates negative
#    numbers correctly (was showing raw "-14236287" instead of "-₹1.4Cr"),
#    and the Cashflow card now shows Cash In / Cash Out per month.
#  - backend/src/dashboard/dashboard.service.ts: getCashflow() now adds
#    cash-mode Payment/VendorPayment receipts+payouts on top of the bank
#    statement, so cash collected/paid outside the bank isn't invisible.
#  - frontend/app/cost-table/page.tsx: new "Likely bad cost data" panel
#    on the Profit tab, flagging orders where cost > 3x sale price — use
#    this after deploying to find the order/product whose cost slab is
#    dragging this month's profit total down.

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

# 1. Backend: build check.
Set-Location "$repo\backend"
npm install
npm run build

# 2. Frontend: build check.
Set-Location "$repo\frontend"
npm install
npm run build

# 3. Commit and push — this is what actually triggers Railway to build
#    and deploy both the backend and frontend. No migration step needed
#    since schema.prisma didn't change.
Set-Location $repo
git add .
git commit -m "Fix dashboard negative-profit display + add cash-in/out cashflow incl. cash payments"
git push
