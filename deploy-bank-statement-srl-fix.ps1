# ── Deploy: Bank Statement "#" column reshuffling fix ────────────────────
# Run this from PowerShell on your own machine (not inside any sandbox).
# Stop and check the output at each step before moving to the next.
#
# What changed (frontend only — no schema/migration involved):
#
#  Bank Statement ledger table's "#" column was rendering `txn.srl` — the
#  raw row-number column parsed straight from the bank's exported statement
#  file. That value is not a stable sequence: it resets/overlaps across
#  different import files, so same-day rows sorted by it looked shuffled,
#  and the same number could appear twice for two different transactions.
#
#  Fix: "#" now shows a simple computed row position (page offset + index),
#  so it always counts cleanly 1, 2, 3... with no jumps or duplicates.
#  `srl` itself is untouched — it's still used internally for import
#  duplicate-detection, just no longer shown as if it were a row number.
#
#  File changed: frontend/app/bank-statement/page.tsx

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

# 1. Frontend: build check.
Set-Location "$repo\frontend"
npm install
npm run build

# 2. Commit and push — this is what actually triggers Vercel to build
#    and deploy the frontend. No backend/migration step needed.
Set-Location $repo
git add frontend/app/bank-statement/page.tsx
git add deploy-bank-statement-srl-fix.ps1
git commit -m "Bank Statement: fix reshuffling # column (stop showing raw bank srl)"
git push
