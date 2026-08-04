# ── Deploy: allow the Capacitor Android app through backend CORS ────────
# Run this from PowerShell on your own machine (not inside any sandbox).
# Stop and check the output at each step before moving to the next.
#
# What changed (no schema/migration involved — pure code change):
#  - backend/src/main.ts: CORS now explicitly allows "https://localhost"
#    (the Capacitor Android app's WebView origin) in addition to the
#    website's FRONTEND_ORIGIN. Without this, the Android app's login and
#    all other API calls were being silently blocked by CORS, showing as
#    "Could not reach the server. Is the API running?" even though the
#    API was up and reachable the whole time.

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

# 1. Backend: build check.
Set-Location "$repo\backend"
npm install
npm run build

# 2. Commit and push — this is what actually triggers Railway to build
#    and deploy the backend. No migration step needed since schema.prisma
#    didn't change.
Set-Location $repo
git add .
git commit -m "Allow Capacitor Android app origin through backend CORS"
git push
