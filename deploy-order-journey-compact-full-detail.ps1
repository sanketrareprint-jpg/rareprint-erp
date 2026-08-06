# ── Order Journey: back to the full sheet detail, but compact and de-duped ──
# Run this from PowerShell on your own machine (not inside any sandbox).
#
# Restores the original sheet-event detail (badges, stage transition, item,
# quantity, sheet size/GSM/printing side, vendor+invoice, cumulative vendor
# list) but as one flowing line instead of a boxed label/value grid, and
# drops fields that were pure duplicates of something already shown:
#
#  - "Item stage" / "orderItemStage" — dropped, it just repeated the stage
#    badges already shown above it.
#  - "Multiple" — dropped, internal print-setup detail not needed here.
#  - "Qty on sheet" vs "Sheet qty" — merged into a single "Qty" figure
#    instead of two near-identical fields.
#  - "Vendor" / "Invoice" fields — only shown once now. On a Stage Vendor
#    event they're folded into the one description line ("PRINTING assigned
#    to VIJAYALAXMI (Inv ...)") instead of repeating the same vendor name a
#    second time in a grid box underneath.
#  - The cumulative vendor-per-stage chip list is now only shown on the
#    "Current Sheet" event, since that's the one place it isn't repeating
#    something the description line already said.
#
# Payments and order-level milestones (Approved, In Production, Ready for
# Dispatch, Dispatched...) are unchanged from the last two deploys.
#
# File changed: frontend/app/orders/page.tsx

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

Set-Location "$repo\frontend"
npm install
npm run build

Set-Location $repo
git add frontend/app/orders/page.tsx
git add deploy-order-journey-compact-full-detail.ps1
git commit -m "Order Journey: restore full sheet detail as a compact, de-duplicated single line instead of the old label/value grid"
git push
