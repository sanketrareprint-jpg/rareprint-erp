# ── Deploy the Bonus Points feature (Loyalty module) ─────────────────────
# Run this from PowerShell on your own machine (not inside any sandbox).
# Stop and check the output at each step before moving to the next.
#
# What this ships: a new "Bonus Points" tab in Loyalty. Admin defines an
# activity catalog (BonusActivity); staff submit claims for MANUAL
# activities (BonusClaim, with a required evidence attachment) that any
# ADMIN-role user approves/rejects; AUTOMATIC activities are credited
# directly by an admin. Approved points land in the existing
# RewardWallet/RewardTransaction ledger.

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

# 1. Backend: local build check — this also runs `prisma generate`,
#    which will fail loudly here if the new schema has a mistake.
Set-Location "$repo\backend"
npm install
npm run build

# 2. Frontend: build check — loyalty/page.tsx and the new
#    loyalty/BonusPointsTab.tsx changed.
Set-Location "$repo\frontend"
npm install
npm run build

# 3. Apply the new migration to the database right now.
#    (Optional — Railway's start script runs `prisma migrate deploy`
#    automatically on every deploy anyway, so skip this if you'd rather
#    just let step 5 handle it.)
Set-Location "$repo\backend"
npx prisma migrate deploy

# 4. Quick sanity check: confirm the new tables exist
$sql = @"
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('BonusActivity','BonusClaim');
"@
$sql | npx prisma db execute --stdin

# 5. Commit and push — this is what actually triggers Railway to build
#    and deploy both the backend and frontend.
Set-Location $repo
git add backend/prisma/schema.prisma
git add backend/prisma/migrations/20260727160000_add_bonus_points
git add backend/src/rewards/rewards.module.ts
git add backend/src/rewards/bonus-points.service.ts
git add backend/src/rewards/bonus-points.controller.ts
git add frontend/app/loyalty/page.tsx
git add frontend/app/loyalty/BonusPointsTab.tsx
git add deploy-bonus-points.ps1
git commit -m "Add Bonus Points tab: activity catalog, claims, admin approval"
git push
