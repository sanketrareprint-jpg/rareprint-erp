# ── Deploy: "Not Contacted" becomes a CRM tab (status + follow-ups) ──
# Run this from PowerShell on your own machine (not inside any sandbox).
# Stop and check the output at each step before moving to the next.

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

# 1. Backend: this is a schema change (new ImportedContact columns +
#    ImportedContactFollowUp table) — `npm run build` runs `prisma generate`,
#    which will fail loudly here if the new schema has a mistake.
Set-Location "$repo\backend"
npm install
npm run build

# 2. Frontend: no new packages, but build-check since crm/page.tsx and
#    crm/not-contacted/page.tsx changed.
Set-Location "$repo\frontend"
npm install
npm run build

# 3. Apply the new migration to the database right now.
#    (Optional — Railway's start script runs `prisma migrate deploy`
#    automatically on every deploy anyway, so skip this if you'd rather
#    just let step 5 handle it.)
Set-Location "$repo\backend"
npx prisma migrate deploy

# 4. Quick sanity check: confirm the new column/table exist
$sql = @"
SELECT column_name FROM information_schema.columns
WHERE table_name = 'ImportedContact' AND column_name IN ('pipelineStatus','leadId');
SELECT table_name FROM information_schema.tables WHERE table_name = 'ImportedContactFollowUp';
"@
$sql | npx prisma db execute --stdin

# 5. Commit and push — this is what actually triggers Railway to build
#    and deploy both the backend and frontend.
Set-Location $repo
git add .
git commit -m "CRM: move Not Contacted into a normal-lead tab (status + follow-ups)"
git push
