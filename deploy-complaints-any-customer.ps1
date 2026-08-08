# -- Allow complaint tickets for customers not yet in the directory --------
# Run this from PowerShell on your own machine.
#
# Previously "New Complaint Ticket" required picking an existing customer
# from search results (Complaint.customerId is a required foreign key, so
# there was no way around it). Now there's a "Can't find them? Add as a new
# customer" link under the search box -- type a name (+ optional phone) and
# submit. The backend auto-creates a lightweight Customer record for them
# (reusing one with the exact same name if it already exists) and links the
# ticket to that.
#
# Files changed:
#   backend/src/complaints/dto/create-complaint.dto.ts
#   backend/src/complaints/complaints.service.ts
#   frontend/app/complaints/new/page.tsx

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

Set-Location "$repo\backend"
npm run build

Set-Location $repo
git add backend/src/complaints/dto/create-complaint.dto.ts
git add backend/src/complaints/complaints.service.ts
git add frontend/app/complaints/new/page.tsx
git add deploy-complaints-any-customer.ps1
git commit -m "Complaints: allow tickets for customers not yet in the directory"
git push

Write-Host ""
Write-Host "Pushed. Paste the deploy log if anything looks off." -ForegroundColor Yellow
