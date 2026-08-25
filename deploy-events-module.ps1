# ── Deploy the Events module (Birthday / Anniversary / Festival WhatsApp wishes) ──
# Run this from PowerShell on your own machine (not inside any sandbox).
# Stop and check the output at each step before moving to the next.
#
# What this ships: a new "Events" tab (Admin nav) where you register
# customers/friends/anyone (name, WhatsApp number, DOB, anniversary date,
# photo), design flyer templates (background image + variable name/date/
# photo fields), and add festival dates. A daily job (8am IST) checks
# everyone's birthday/anniversary and every upcoming festival, generates the
# flyer, and sends it via AiSensy WhatsApp to both the person and to your own
# WhatsApp (owner copy).
#
# ⚠ BEFORE THIS ACTUALLY SENDS ANYTHING, two things need to be set up
# OUTSIDE this repo — see docs/Events_Module_Setup.md for the exact steps:
#   1. A WhatsApp template must be created and approved in your AiSensy
#      dashboard (image header + 3 body variables). Set its name as
#      AISENSY_EVENTS_CAMPAIGN in Railway's backend environment variables
#      (defaults to 'events_wish_erp' if unset).
#   2. BACKEND_PUBLIC_URL must be set in Railway's backend environment
#      variables to your backend's own public URL (e.g.
#      https://rareprint-erp-backend-production.up.railway.app) — AiSensy
#      needs this to fetch the generated flyer image. Without it, sends will
#      fail with "BACKEND_PUBLIC_URL is not set" in the backend logs (visible
#      in the Events > History tab as a FAILED row) instead of silently doing
#      nothing.
# Until both are set, every send will fail gracefully (logged, no crash) —
# safe to deploy and test the People/Templates/Festivals CRUD UI first, wire
# up AiSensy after.

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

# 1. Backend: local build check — this also runs `prisma generate`,
#    which will fail loudly here if the new schema has a mistake.
Set-Location "$repo\backend"
npm install
npm run build
if ($LASTEXITCODE -ne 0) { throw "Backend build failed — fix the errors above before continuing (do NOT push broken code)." }

# 2. Frontend: build check — dashboard-shell.tsx and the new
#    events/page.tsx changed.
Set-Location "$repo\frontend"
npm install
npm run build
if ($LASTEXITCODE -ne 0) { throw "Frontend build failed — fix the errors above before continuing (do NOT push broken code)." }

# 3. Apply the new migration to the database right now.
#    (Optional — Railway's start script runs `prisma migrate deploy`
#    automatically on every deploy anyway, so skip this if you'd rather
#    just let step 5 handle it.)
Set-Location "$repo\backend"
npx prisma migrate deploy

# 4. Quick sanity check: confirm the new tables exist
$sql = @"
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('EventPerson','EventFlyerTemplate','Festival','EventSendLog');
"@
$sql | npx prisma db execute --stdin

# 5. Commit and push — this is what actually triggers Railway to build
#    and deploy both the backend and frontend.
Set-Location $repo
git add backend/prisma/schema.prisma
git add backend/prisma/migrations/20260824090000_add_events_module
git add backend/src/app.module.ts
git add backend/src/events
git add backend/src/whatsapp/whatsapp.service.ts
git add backend/package.json
git add backend/package-lock.json
git add frontend/app/events
git add frontend/components/dashboard-shell.tsx
git add docs/Events_Module_Setup.md
git add deploy-events-module.ps1
git commit -m "Add Events module: birthday/anniversary/festival WhatsApp flyer wishes"
git push

# 6. Reminder: after Railway finishes deploying, go set
#    AISENSY_EVENTS_CAMPAIGN and BACKEND_PUBLIC_URL in Railway's backend
#    service > Variables, then use Events > People > "Bday"/"Anniv" test-send
#    buttons to confirm a real WhatsApp message arrives before relying on
#    the automatic daily job.
