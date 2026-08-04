# ── Deploy: new DESIGNER user role ────────────────────────────────────────
# Run this from PowerShell on your own machine (not inside any sandbox).
# Stop and check the output at each step before moving to the next.
#
# What this ships:
#  - New "DESIGNER" value on the UserRole enum (backend/prisma/schema.prisma
#    + migration 20260804190000_add_designer_role).
#  - erp-config default role access for DESIGNER: production, sticker,
#    sheet-layout (backend/src/erp-config/erp-config.service.ts).
#  - Sidebar nav for DESIGNER shows only Sheet Layout, Sticker, Production
#    (frontend/components/dashboard-shell.tsx), plus a guard that redirects
#    a DESIGNER account back to /sheet-layout if it tries to open any other
#    page directly by URL.
#  - Production page: DESIGNER is locked to the Sheets tab, and within
#    Sheets, locked to the "Created Sheets" subtab only — same pattern
#    already used to lock the INHOUSE role to its one tab
#    (frontend/app/production/page.tsx).
#  - DESIGNER added to the role dropdown in Settings > Role Access
#    (frontend/app/settings/page.tsx) and in the Database admin editor's
#    user.role dropdown (frontend/app/admin/database/page.tsx) so an admin
#    can actually assign the role to a user.
#
#  Also creates one Designer login (step 5 below):
#    email:    designer.rareprint@gmail.com
#    password: Design123
#  (Alternative if you'd rather do it by hand: Database (admin) > user
#  table > add/edit a row > set role = DESIGNER.)

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

# 1. Backend: local build check — this also runs `prisma generate`,
#    which will fail loudly here if the new schema has a mistake.
Set-Location "$repo\backend"
npm install
npm run build

# 2. Frontend: build check.
Set-Location "$repo\frontend"
npm install
npm run build

# 3. Apply the new migration to the database right now. This step is NOT
#    optional this time (unlike other deploy scripts) — step 5 below
#    creates a DESIGNER user directly against the database, so the enum
#    value must exist before that runs.
Set-Location "$repo\backend"
npx prisma migrate deploy

# 4. Quick sanity check: confirm DESIGNER is now a valid enum value.
$sql = @"
SELECT unnest(enum_range(NULL::"UserRole"))::text AS role;
"@
$sql | npx prisma db execute --stdin

# 5. Create the Designer login. Not safe to re-run — it will error with
#    a unique-constraint violation if this email already exists, which
#    just means the account was already created; nothing to worry about.
node create-designer-user.js

# 6. Commit and push — this is what actually triggers Railway to build
#    and deploy both the backend and frontend.
Set-Location $repo
git add backend/prisma/schema.prisma
git add backend/prisma/migrations/20260804190000_add_designer_role
git add backend/src/erp-config/erp-config.service.ts
git add frontend/components/dashboard-shell.tsx
git add frontend/app/production/page.tsx
git add frontend/app/settings/page.tsx
git add frontend/app/admin/database/page.tsx
git add backend/create-designer-user.js
git add deploy-designer-role.ps1
git commit -m "Add DESIGNER role: access to Sheet Layout, Sticker, Production > Created Sheets"
git push
