# ── Order Journey: sheet specs shown once per sheet, not once per event ──
# Run this from PowerShell on your own machine (not inside any sandbox).
#
# The real redundancy: a sheet's specs (item, qty, size, GSM, printing side)
# don't change as it moves through stages — only the stage does. Those
# fields were repeating on every single stage-transition entry for the same
# sheet (e.g. Sheet 1340 showing "ENVELOPE · Qty 2000 · 18x23 · 70 GSM ·
# Single Side" three times in a row, once per stage change).
#
# FIX: now shown once — on the first journey entry for that sheet number —
# then later entries for the same sheet just show the stage transition
# badge. Fields that genuinely change per event (item stage, work stage,
# vendor, invoice) still show every time, since those aren't repeats.
#
# File changed: frontend/app/orders/page.tsx

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

Set-Location "$repo\frontend"
npm install
npm run build

Set-Location $repo
git add frontend/app/orders/page.tsx
git add deploy-order-journey-dedupe-sheet-specs.ps1
git commit -m "Order Journey: show sheet spec details once per sheet (not once per stage-transition entry)"
git push
