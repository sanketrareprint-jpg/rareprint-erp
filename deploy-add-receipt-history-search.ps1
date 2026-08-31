# 1) Add a search bar to Accounts > Receipt History (search by order,
#    customer, phone, agent, reference number, account name, or verifier
#    name).
# 2) Reorder that table's columns so Status/Verified By/Verified At sit
#    right after Method, instead of after Account/UTR/Amount at the far
#    right. Root cause confirmed live in Sanket's own browser via Claude in
#    Chrome: the data and columns were always there and correct (verified
#    via the accessibility tree -- real VERIFIED/verifier names/timestamps
#    all present), the table just required horizontal scrolling past 8 wide
#    columns to reach them, and scrolling wasn't obvious/working for him.
#    Moving the important columns earlier means they're visible without
#    scrolling on most screens.
#
# File changed: frontend/app/accounts/page.tsx

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

Set-Location "$repo\frontend"
npm run build

Set-Location $repo
git add frontend/app/accounts/page.tsx
git add deploy-add-receipt-history-search.ps1
git commit -m "Accounts: add search bar to Receipt History tab"
git push

Write-Host ""
Write-Host "Pushed. Once deployed, Receipt History will have a search box above the table." -ForegroundColor Yellow
