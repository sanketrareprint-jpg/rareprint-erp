# ── Deploy: hide "Place items" on COMPLETE sheets ────────────────────────
# Run this from PowerShell on your own machine (not inside any sandbox).
# Stop and check the output at each step before moving to the next.
#
# What changed (frontend only — no schema/migration involved):
#
#  Production > Sheets > Created Sheets: when a sheet's status is
#  COMPLETE, the "Place items (GSM: ...)" section (and its unplaced-items
#  fetch) is now hidden — only "Items on sheet" is shown. INCOMPLETE and
#  SETTING sheets are unaffected and still show Place items as before.
#
#  File touched: frontend/app/production/page.tsx

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

# 1. Frontend: build check.
Set-Location "$repo\frontend"
npm install
npm run build

# 2. Commit and push — this is what actually triggers Railway to build
#    and deploy the frontend. No backend/migration step needed.
Set-Location $repo
git add frontend/app/production/page.tsx
git add deploy-sheet-complete-hide-place-items.ps1
git commit -m "Hide Place items section on COMPLETE sheets in Production > Sheets"
git push
