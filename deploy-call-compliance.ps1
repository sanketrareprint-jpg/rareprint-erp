# ── Deploy the call-compliance feature (call-log PDF + AiSensy tag CSV) ──
# Run this from PowerShell on your own machine (not inside any sandbox).
# Stop and check the output at each step before moving to the next.

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

# 1. Backend: install the new dependency (pdfjs-dist) and refresh package-lock.json
Set-Location "$repo\backend"
npm install

# 2. Backend: local build check — this also runs `prisma generate`,
#    which will fail loudly here if the new schema has a mistake.
npm run build

# 3. Frontend: no new packages were added for this feature, but run a
#    build check anyway since dashboard/page.tsx and call-compliance/page.tsx changed.
Set-Location "$repo\frontend"
npm install
npm run build

# 4. Apply the new migration to the database right now.
#    (Optional — Railway's start script runs `prisma migrate deploy`
#    automatically on every deploy anyway, so skip this if you'd rather
#    just let step 6 handle it.)
Set-Location "$repo\backend"
npx prisma migrate deploy

# 5. Quick sanity check: confirm the new tables exist
$sql = @"
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('CallLogImport','CallLogRecord','ContactImport','ImportedContact');
"@
$sql | npx prisma db execute --stdin

# 6. Commit and push — this is what actually triggers Railway to build
#    and deploy both the backend and frontend.
Set-Location $repo
git add .
git commit -m "Add call-compliance: call-log PDF + AiSensy tag CSV cross-check"
git push
