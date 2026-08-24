# ── Deploy: "Edit address" in Dispatch Queue ──────────────────────────────
# Run this from PowerShell on your own machine (not inside any sandbox).
# Stop and check the output at each step before moving to the next.
#
# What changed:
#
#  Dispatch > Queue now has an "Edit address" link next to each order's
#  delivery address. Opens an inline form (address, city, state, pincode)
#  and saves directly — no need to leave the Dispatch page to fix a wrong
#  address/pincode before booking a shipment.
#
#  IMPORTANT: the delivery address shown in the queue comes from the
#  CUSTOMER record (Customer.shippingAddress/city/state/pincode) — Order has
#  no address fields of its own. So this edits the customer's saved address,
#  which affects every order for that customer, not just the one being
#  dispatched right now. That's intentional — it's for fixing genuinely
#  wrong data. The existing separate "Ship to a different address" checkbox
#  (already on the Dispatch card) is unchanged and still the right tool for
#  a one-off delivery to a different address without touching the
#  customer's master record.
#
#  Backend: new PATCH /customer-directory/:id/address endpoint
#  (backend/src/customer-directory/customer-directory.{service,controller}.ts)
#  validates a 6-digit pincode and updates only the fields sent. Dispatch's
#  GET /dispatch/orders now also returns customerId + the individual
#  address fields (backend/src/dispatch/dispatch.service.ts) so the edit
#  form can be pre-filled — it previously only exposed a single merged
#  "shipTo" display string.
#
#  No schema/migration changes — Customer already has all these columns.
#
# Files touched: backend/src/customer-directory/customer-directory.service.ts,
# backend/src/customer-directory/customer-directory.controller.ts,
# backend/src/dispatch/dispatch.service.ts, frontend/app/dispatch/page.tsx

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

# 1. Backend: local build check.
Set-Location "$repo\backend"
npm install
npm run build

# 2. Frontend: build check.
Set-Location "$repo\frontend"
npm install
npm run build

# 3. Commit and push — this is what actually triggers Railway to build
#    and deploy both the backend and frontend. No migration step needed.
Set-Location $repo
git add backend/src/customer-directory/customer-directory.service.ts
git add backend/src/customer-directory/customer-directory.controller.ts
git add backend/src/dispatch/dispatch.service.ts
git add frontend/app/dispatch/page.tsx
git add deploy-dispatch-edit-address.ps1
git commit -m "Dispatch: add Edit address (customer shippingAddress/city/state/pincode) inline on the Queue"
git push
