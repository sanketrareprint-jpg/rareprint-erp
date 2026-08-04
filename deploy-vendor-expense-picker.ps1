# ── Deploy: Vendor / Expense picker in Payment Verification ─────────────
# Run this from PowerShell on your own machine (not inside any sandbox).
# Stop and check the output at each step before moving to the next.
#
# What changed (no schema/migration involved — pure frontend change):
#  - frontend/app/accounts/page.tsx: the "Vendor / Expense" text box on the
#    Accounts > Payment Verification tab is now backed by a datalist picker.
#    It fetches your registered vendors (GET /vendors) and expense
#    categories (GET /bank-statement/expense-categories) the first time the
#    tab loads, and offers them as suggestions in the same input — click
#    the dropdown arrow to pick one, or keep typing free text as before for
#    anything not yet in either list (e.g. one-off commission labels).
#  - No backend code or database changes — both endpoints already existed.

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

# 1. Frontend: build check.
Set-Location "$repo\frontend"
npm install
npm run build

# 2. Commit and push — this is what actually triggers Railway/Vercel to
#    build and deploy the frontend. No migration step needed.
Set-Location $repo
git add frontend/app/accounts/page.tsx
git commit -m "Accounts: add vendor/expense picker (datalist of vendors + expense categories) to Payment Verification"
git push
