# ── Order Journey: restore every sheet-event field, dedupe only the real repeat ──
# Run this from PowerShell on your own machine (not inside any sandbox).
#
# Correction to the last deploy — that one dropped Printed qty, Multiple,
# and Item stage entirely, which was overreach (those aren't duplicates of
# anything, I just judged them unnecessary on my own). Restored now.
#
# Every field from the very first version is back: Item, Qty on sheet,
# Multiple, Sheet qty, Printed qty, Sheet size, GSM, Printing side, Item
# stage, Work stage, Vendor, Invoice, and the cumulative vendor-per-stage
# chip list — same as before, just as one flowing line instead of boxed
# grid cells (more compact, same information).
#
# The ONLY thing left out is Work stage / Vendor specifically on a "Stage
# Vendor" event, because the sentence right above it already says
# "{stage} assigned to {vendor}" — that's the one genuine, provable repeat
# (same value, same event, shown twice). Everything else that's a different
# fact stays, even if it looks similar to something else.
#
# File changed: frontend/app/orders/page.tsx

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

Set-Location "$repo\frontend"
npm install
npm run build

Set-Location $repo
git add frontend/app/orders/page.tsx
git add deploy-order-journey-restore-all-fields.ps1
git commit -m "Order Journey: restore all sheet-event fields (printed qty, multiple, item stage), only dedupe the one field that's genuinely repeated"
git push
