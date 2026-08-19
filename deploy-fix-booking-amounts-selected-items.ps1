# -- Fix: Book Shipment screen showed whole-order amounts even when only -
# -- one item was selected, and courier rate quotes/declared value did the
# -- same thing -------------------------------------------------------------
# Run this from PowerShell on your own machine, from the repo root.
#
# BUG: the Orders page's "Book Shipment" modal always showed "Order Value"
# as the WHOLE order's total, even with only one item checked (e.g. order
# 1498, SPARSH MEDICAL: showed Rs 6,700 order value while only the Rs 1,700
# STICKER item was actually selected -- the Rs 5,000 ENVELOPE item isn't
# even ready yet). Separately, "Fetch Courier Rates" on both the Orders
# page and Dispatch's own booking page always quoted/declared a value based
# on EVERY ready item on the order, ignoring which ones were actually
# checked -- so unchecking an item in the modal didn't change what was
# quoted or what would be declared to Bigship/Shiprocket.
#
# FIX:
#   - "Order Value" in the Book Shipment modal renamed to "Shipment Value"
#     and now shows only the checked item(s)' value. "Paid" and "Balance"
#     stay whole-order figures on purpose -- those are real facts about the
#     order's payment state, not something that splits per item.
#   - dispatch.service.ts's getRates() now accepts an optional itemIds list
#     and, when given, only quotes/declares value for those specific items
#     -- both the Orders page and Dispatch page now send the checked
#     item(s) when fetching rates.
#   - The actual booking step (bookItems) and the actual submission step
#     (submitDispatchBatch) already only ever acted on the exact selected
#     items (fixed earlier) -- this closes the last gap, the pre-booking
#     rate/estimate step, so the number shown before booking now always
#     matches what actually gets sent at booking time.
#
# Files changed:
#   backend/src/dispatch/dispatch.service.ts (getRates: itemIds param)
#   backend/src/dispatch/dispatch.controller.ts (rates route: itemIds query param)
#   frontend/app/orders/page.tsx (Shipment Value display; sends itemIds to rates)
#   frontend/app/dispatch/page.tsx (sends itemIds to rates)

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

Set-Location "$repo\backend"
npm run build

Set-Location $repo
git add backend/src/dispatch/dispatch.service.ts
git add backend/src/dispatch/dispatch.controller.ts
git add frontend/app/orders/page.tsx
git add frontend/app/dispatch/page.tsx
git add deploy-fix-booking-amounts-selected-items.ps1
git commit -m "Book Shipment modal + rate quotes: reflect only the selected item(s), not the whole order"
git push

Write-Host ""
Write-Host "Pushed. After it deploys, open order 1498's Book Shipment modal with only the STICKER item checked -- 'Shipment Value' should show Rs 1,700, not Rs 6,700. Fetch Courier Rates and confirm the quote/declared value also reflects just that item." -ForegroundColor Yellow
