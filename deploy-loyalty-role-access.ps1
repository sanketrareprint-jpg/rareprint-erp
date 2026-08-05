# ── Deploy: Loyalty module in Role Access + grant Sales Agent ────────────
# Run this from PowerShell on your own machine (not inside any sandbox).
# Stop and check the output at each step before moving to the next.
#
# What changed (frontend + backend, no schema/migration involved):
#
#  Settings > Role Access was missing a "Loyalty" column entirely — the
#  /loyalty page existed and was hardcoded into ADMIN/ACCOUNTS' sidebars,
#  but wasn't a toggleable module, so it couldn't be granted to other
#  roles from Settings.
#
#  - backend/src/erp-config/erp-config.service.ts: added a `loyalty`
#    module (so it now shows as a column in Role Access), and added it to
#    the default access list for ADMIN (automatic), ACCOUNTS (preserves
#    its existing always-on Loyalty link), and SALES_AGENT (the access
#    that was requested).
#  - frontend/components/dashboard-shell.tsx: mapped /loyalty to the
#    `loyalty` module key (so it's actually gated by Role Access instead
#    of always showing), and added a "Loyalty" sidebar link to the
#    SALES_AGENT role's nav list (it wasn't in that list at all before —
#    without this, checking the box in Settings alone wouldn't be enough).
#
#  IMPORTANT: if your Settings > Role Access grid already has a saved
#  configuration in the database (i.e. someone has hit Save on that page
#  before), the new SALES_AGENT default above may be overridden by what's
#  already saved. After deploying, open Settings > Role Access and check
#  the "Loyalty" checkbox for the "SALES AGENT" row yourself if it isn't
#  already checked, then hit Save — that's the normal, no-deploy way this
#  grid is meant to be edited going forward.

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

# 1. Backend: local build check.
Set-Location "$repo\backend"
npm install
npm run build

# 2. Frontend: build check.
Set-Location "$repo\frontend"
npm install
npm run build

# 3. Commit and push — this is what actually triggers Railway to build
#    and deploy both the backend and frontend. No migration step needed.
Set-Location $repo
git add backend/src/erp-config/erp-config.service.ts
git add frontend/components/dashboard-shell.tsx
git add deploy-loyalty-role-access.ps1
git commit -m "Add Loyalty as a Role Access module; grant Sales Agent access"
git push
