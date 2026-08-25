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
#
# IMPORTANT -- migrations do NOT run automatically on deploy on this Railway
# setup, by design (see docs/Events_Module_Context.md's "Railway never runs
# migrations at boot" section). Step 3 below is what actually applies the
# two pending Festival migrations to production -- it is not optional this
# time, unlike a normal deploy where only code changed. You need your
# production DATABASE_URL for it: Railway dashboard -> Postgres service ->
# Variables tab -> click DATABASE_URL (or DATABASE_PUBLIC_URL if that's what
# shows for external/local connections) -> copy its VALUE, which looks like:
#   postgresql://postgres:SomeRealPassword123@monorail.proxy.rlwy.net:12345/railway
# Then, in this PowerShell window, BEFORE running this script, paste your
# actual copied value (not the example above, and not these instructions)
# into a command shaped exactly like this:
#   $env:DATABASE_URL = "postgresql://postgres:SomeRealPassword123@monorail.proxy.rlwy.net:12345/railway"
# The whole postgresql://... string goes inside the quotes, nothing else.

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

# 0. Sanity-check DATABASE_URL's shape before doing anything else, so a
#    mistake here (e.g. pasting a placeholder or instructions by accident)
#    fails immediately and clearly instead of after a 5-minute build, or
#    worse, silently -- railway-migrate.js below always exits 0 by design
#    (so it can never block the app from booting), so a malformed URL
#    inside it would NOT otherwise be caught by a normal exit-code check.
if ($env:DATABASE_URL -and ($env:DATABASE_URL -notmatch '^postgres(ql)?://')) {
  throw "DATABASE_URL is set but does not look like a real Postgres connection string (it should start with postgresql://). Current value starts with: '$($env:DATABASE_URL.Substring(0, [Math]::Min(30, $env:DATABASE_URL.Length)))...' -- copy the actual value from Railway's Postgres service > Variables tab, not a placeholder or these instructions."
}

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

# 3. Apply the two pending Festival migrations to production RIGHT NOW.
#    This is the step that actually fixes the live "Festival.month does not
#    exist" P2022 error -- Railway's backend startCommand is deliberately
#    plain "node dist/src/main.js" (no migration step) because wiring
#    migrations into the boot command caused a full outage back on
#    2026-08-07 (the migrate step's ~40-47s ate into Railway's boot/
#    healthcheck budget and the app never got a chance to print its first
#    log line -- see project memory / docs/Events_Module_Context.md for the
#    full incident). So this has to be run from here, against production,
#    every time a schema change needs to ship -- it is not automatic and
#    pushing code alone will NOT apply it.
Set-Location "$repo\backend"
if ($env:DATABASE_URL) {
  node scripts/railway-migrate.js
  # NOTE: railway-migrate.js always exits 0 by design (so a migration
  # problem never blocks the app from booting on Railway) -- so its own
  # exit code proves nothing here. The real check is the assertion query
  # below: it fails loudly (nonzero exit, caught immediately) if
  # Festival.month still doesn't exist after the step above, instead of
  # silently falling through to git push like last time.
  $assertSql = @'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Festival' AND column_name = 'month'
  ) THEN
    RAISE EXCEPTION 'Festival.month still does not exist -- the migration did not apply. Check DATABASE_URL is correct and re-run this script, or run node scripts/railway-migrate.js by hand and read its output for the real error.';
  END IF;
END $$;
'@
  $assertSql | npx prisma db execute --stdin
  if ($LASTEXITCODE -ne 0) { throw "Migration verification failed -- Festival.month still does not exist in the database. Do NOT continue to push. See the error above (likely DATABASE_URL is wrong, or the DB is unreachable from this machine)." }
  Write-Host "Festival.month/day confirmed present in the database -- migration applied successfully." -ForegroundColor Green
} else {
  Write-Host "DATABASE_URL is not set -- SKIPPING the production migration. Festivals/History will keep 500ing (P2022) until you set DATABASE_URL to your production connection string and re-run this script, or run 'node scripts/railway-migrate.js' by hand from backend/ with it set." -ForegroundColor Yellow
}

# 4. Commit and push -- this deploys the code (Vercel frontend + Railway
#    backend, both auto-deploy on push to main). Does NOT apply migrations
#    -- that already happened in step 3, or still needs to happen by hand
#    if step 3 was skipped.
Set-Location $repo
git add backend/prisma/schema.prisma
git add backend/prisma/migrations/20260824090000_add_events_module
git add backend/prisma/migrations/20260825120000_events_recurring_festivals
git add backend/scripts/ensure-all-columns.js
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

# 5. Reminder: after Railway finishes deploying, go set
#    AISENSY_EVENTS_CAMPAIGN and BACKEND_PUBLIC_URL in Railway's backend
#    service > Variables, then use Events > People > "Bday"/"Anniv" test-send
#    buttons to confirm a real WhatsApp message arrives before relying on
#    the automatic daily job.
