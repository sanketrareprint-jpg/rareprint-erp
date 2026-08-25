# -- Deploy the Events module (Birthday / Anniversary / Festival WhatsApp wishes) --
# Run this from PowerShell on your own machine (not inside any sandbox).
# Stop and check the output at each step before moving to the next.
#
# What this ships: a new "Events" tab (Admin nav) where you register
# customers/friends/anyone (name, WhatsApp number, DOB, anniversary date,
# photo), design flyer templates (background image + variable name/date/
# photo fields), and add festival dates (recurring by month/day). A daily
# job (8am IST) checks everyone's birthday/anniversary and every festival,
# generates the flyer, and sends it via AiSensy WhatsApp to both the person
# and to your own WhatsApp (owner copy).
#
# NOTE: this file must stay plain ASCII. Windows PowerShell 5.1 (the
# built-in powershell.exe, as opposed to PowerShell 7 / pwsh) does not
# reliably read UTF-8 .ps1 files without a BOM -- an em-dash or curly quote
# here breaks the parser with a confusing "Unexpected token" error. Keep any
# future edits to this file plain ASCII, or add a UTF-8 BOM if you need
# non-ASCII characters.
#
# BEFORE THIS ACTUALLY SENDS ANYTHING, two things need to be set up
# OUTSIDE this repo -- see docs/Events_Module_Setup.md for the exact steps:
#   1. A WhatsApp template must be created and approved in your AiSensy
#      dashboard (image header + 3 body variables). Set its name as
#      AISENSY_EVENTS_CAMPAIGN in Railway's backend environment variables
#      (defaults to 'events_wish_erp' if unset).
#   2. BACKEND_PUBLIC_URL must be set in Railway's backend environment
#      variables to your backend's own public URL (e.g.
#      https://rareprint-erp-backend-production.up.railway.app) -- AiSensy
#      needs this to fetch the generated flyer image. Without it, sends will
#      fail with "BACKEND_PUBLIC_URL is not set" in the backend logs (visible
#      in the Events > History tab as a FAILED row) instead of silently doing
#      nothing.
# Until both are set, every send will fail gracefully (logged, no crash) --
# safe to deploy and test the People/Templates/Festivals CRUD UI first, wire
# up AiSensy after.

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

# 1. Backend: local build check -- this also runs `prisma generate`,
#    which will fail loudly here if the new schema has a mistake.
Set-Location "$repo\backend"
npm install
npm run build
if ($LASTEXITCODE -ne 0) { throw "Backend build failed -- fix the errors above before continuing (do NOT push broken code)." }

# 2. Frontend: build check -- dashboard-shell.tsx and the new
#    events/page.tsx changed.
Set-Location "$repo\frontend"
npm install
npm run build
if ($LASTEXITCODE -ne 0) { throw "Frontend build failed -- fix the errors above before continuing (do NOT push broken code)." }

# 3. Apply the pending migrations to the database right now, if this
#    machine has a DATABASE_URL configured (it doesn't, by default -- this
#    repo's local backend/.env intentionally has no DATABASE_URL, since
#    there's no separate dev database, only production). If it's not set,
#    this step is skipped -- Railway's own start script
#    (scripts/railway-migrate.js) runs `prisma migrate deploy` automatically
#    on every deploy, so step 6 (push) is what actually applies these.
Set-Location "$repo\backend"
if ($env:DATABASE_URL) {
  npx prisma migrate deploy

  # 4. Quick sanity check: confirm the new/changed tables and columns exist
  $sql = @"
SELECT table_name, column_name FROM information_schema.columns
WHERE table_name IN ('EventPerson','EventFlyerTemplate','Festival','EventSendLog')
ORDER BY table_name, column_name;
"@
  $sql | npx prisma db execute --stdin
} else {
  Write-Host "DATABASE_URL is not set locally -- skipping local migrate/sanity-check. Railway will run the pending migrations automatically on the deploy triggered by step 6 below."
}

# 5. Commit and push -- this is what actually triggers Railway to build
#    and deploy both the backend and frontend (and, per step 3's note,
#    apply any pending migrations).
Set-Location $repo
git add backend/prisma/schema.prisma
git add backend/prisma/migrations/20260824090000_add_events_module
git add backend/prisma/migrations/20260825120000_events_recurring_festivals
git add backend/src/app.module.ts
git add backend/src/events
git add backend/src/whatsapp/whatsapp.service.ts
git add backend/package.json
git add backend/package-lock.json
git add frontend/app/events
git add frontend/components/dashboard-shell.tsx
git add docs/Events_Module_Setup.md
git add docs/Events_Module_Context.md
git add deploy-events-module.ps1
git commit -m "Events module: recurring festivals (month/day) + fix migration checksum drift"
git push

# 6. Reminder: after Railway finishes deploying, go set
#    AISENSY_EVENTS_CAMPAIGN and BACKEND_PUBLIC_URL in Railway's backend
#    service > Variables, then use Events > People > "Bday"/"Anniv" test-send
#    buttons to confirm a real WhatsApp message arrives before relying on
#    the automatic daily job.
