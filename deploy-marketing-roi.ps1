# ── Deploy the Marketing "Ad ROI" tab ────────────────────────────────────
# Run this from PowerShell on your own machine (not inside any sandbox).
# Stop and check the output at each step before moving to the next.
#
# NOTE: This feature reads from the ImportedContact table added by the
# call-compliance feature (see deploy-call-compliance.ps1). If you haven't
# deployed that yet, this migration includes it automatically — both
# migrations run in order — but you still need call-compliance's backend
# code deployed too, since this feature calls CallComplianceService to
# import the AiSensy contacts CSV.

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

# 1. Backend: local build check — this also runs `prisma generate`,
#    which will fail loudly here if the new schema has a mistake.
Set-Location "$repo\backend"
npm install
npm run build

# 2. Frontend: build check — marketing/page.tsx changed (new "Ad ROI" tab).
Set-Location "$repo\frontend"
npm install
npm run build

# 3. Apply the new migration to the database right now.
#    (Optional — Railway's start script runs `prisma migrate deploy`
#    automatically on every deploy anyway, so skip this if you'd rather
#    just let step 5 handle it.)
Set-Location "$repo\backend"
npx prisma migrate deploy

# 4. Quick sanity check: confirm the new table exists
$sql = @"
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('MarketingRoiSpend','ImportedContact');
"@
$sql | npx prisma db execute --stdin

# 5. Commit and push — this is what actually triggers Railway to build
#    and deploy both the backend and frontend.
Set-Location $repo
git add .
git commit -m "Add Marketing Ad ROI tab: contacts-created vs spend vs sale/profit"
git push
