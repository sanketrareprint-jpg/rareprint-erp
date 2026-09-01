# Fixes: a courier booking attempt that the courier itself never actually
# confirmed (Bigship draft created but auto-manifest failed, Shiprocket
# returned no order id, Fship returned no waybill, or no carrier branch
# matched at all) used to still move the order out of the Dispatch Queue
# and into History -- marking the item(s) dispatchedAt, advancing order
# status, and even sending the customer a "Dispatched" WhatsApp -- even
# though nothing was actually booked with the courier.
#
# Now: bookItems() only proceeds (creates the Shipment record, marks items
# dispatched, advances order status, sends the WhatsApp) once a carrier
# branch has real courier-side confirmation -- a manifested Bigship order,
# a real Shiprocket order id, or a Fship AWB/waybill. Otherwise it throws
# before any of that happens, so the order/item(s) are untouched and stay
# visible in the Dispatch Queue for a retry. The frontend already showed a
# plain error alert on a thrown booking failure and does NOT refresh/clear
# the order on that path, so no frontend change was needed.
#
# File changed: backend/src/dispatch/dispatch.service.ts (bookItems())

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

Set-Location "$repo\backend"
npm run build

Set-Location $repo
git add backend/src/dispatch/dispatch.service.ts
git add deploy-dispatch-require-real-booking.ps1
git commit -m "Dispatch: don't move order to History unless courier actually confirmed the booking"
git push

Write-Host ""
Write-Host "Pushed. Once deployed: a failed/unconfirmed courier booking will show a clear error and leave the order in the Dispatch Queue instead of silently moving it to History." -ForegroundColor Yellow
