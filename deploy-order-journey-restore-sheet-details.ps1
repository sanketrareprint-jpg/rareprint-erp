# ── Order Journey: bring back sheet/quantity info, still compact ──────────
# Run this from PowerShell on your own machine (not inside any sandbox).
#
# Follow-up to the last Order Journey change — that one went too far and
# dropped sheet/quantity info entirely along with the clutter. This restores
# it as one short line per sheet event instead of the old 4-column grid:
#
#   Sheet 1340   ENVELOPE · Qty 2000   · SETTING → PRINTING
#
# Still dropped: GSM, printing side, printed-qty, item stage, invoice
# number, and the separate vendor-chip list — those were the actual clutter.
# Payments and order-level milestones (Approved, In Production, Ready for
# Dispatch, Dispatched...) are unchanged from the last deploy.
#
# File changed: frontend/app/orders/page.tsx

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

Set-Location "$repo\frontend"
npm install
npm run build

Set-Location $repo
git add frontend/app/orders/page.tsx
git add deploy-order-journey-restore-sheet-details.ps1
git commit -m "Order Journey: restore sheet/quantity info as a compact one-line summary per sheet event"
git push
