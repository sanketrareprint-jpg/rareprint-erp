# ── Verify + commit/push the marketing-site/ scaffold ───────────────────
# Run this from PowerShell on your own machine (not inside any sandbox).
# Stop and check the output at each step before moving to the next.
#
# This is Phase A + B of docs/Marketing_Site_Roadmap.md: a new standalone
# Next.js app, no shared code with frontend/ or backend/. This script just
# verifies it builds and pushes it — it does NOT create the Railway service
# (that's a one-time manual step, see step 3 below).

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

# 1. Build check — I couldn't run this in the sandbox (npm install timed
#    out), so this is the first time it'll actually compile.
Set-Location "$repo\marketing-site"
npm install
npm run build

# 2. Optional: eyeball it locally before pushing.
#    npm run dev   -> http://localhost:3002

# 3. One-time manual step, NOT scriptable here: in the Railway dashboard,
#    add a new service in this same project, point its root directory at
#    `marketing-site/`. It already has its own Dockerfile + railway.json
#    matching the pattern frontend/ and backend/ use. Do this before or
#    after the push below — either order is fine, nothing deploys until
#    the service exists.

# 4. Before pushing: open app/lib/site-config.ts and replace the
#    placeholder WhatsApp number. Two candidates exist in backend/.env —
#    pick whichever is the real customer-facing number.

# 5. Commit and push.
Set-Location $repo
git add marketing-site docs/Marketing_Site_Roadmap.md
git commit -m "Scaffold marketing-site/: public homepage, features, pricing, about (Phase A+B)"
git push
