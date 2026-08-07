# ── Admin can force-delete orders past Pending Approval ─────────────────────
# Run this from PowerShell on your own machine (not inside any sandbox).
#
# Previously, orders could only be deleted while status was PENDING_APPROVAL
# (or for test orders, at any stage) — this applied to everyone, including
# admin, since deleteOrder() had no role check at all.
#
# Now: ADMIN-role users see the delete button on every order regardless of
# status. Clicking it on an order that's still PENDING_APPROVAL (or a test
# order) works exactly as before — a plain "Delete this order? Cannot be
# undone" browser confirm. Clicking it on anything further along opens a
# modal that requires typing the exact order number before the delete button
# enables, so a stray click can't wipe out the wrong order.
#
# Data safety checked before building this: every table that references an
# order (OrderItem, Payment, Invoice, Commission, ProductionJob, Shipment,
# StatusLog, AccountingLedgerEntry, OrderReassuranceLog) already cascades on
# delete at the database level, so a force-delete cleans all of that up
# automatically — nothing is left dangling with a broken foreign key. A
# handful of tables (RewardTransaction, CustomerLoyaltyTransaction,
# Notification) keep the order id only as a soft historical reference with
# no foreign key constraint, so they'll just keep pointing at a deleted
# order id — same as how those tables already behave for other deleted
# records, not something new introduced here.
#
# Files changed:
#   backend/src/orders/orders.controller.ts  (passes req.user.role through)
#   backend/src/orders/orders.service.ts     (deleteOrder accepts isAdmin)
#   frontend/app/orders/page.tsx             (delete button + confirm modal)

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

Set-Location "$repo\backend"
npm install
npm run build

Set-Location "$repo\frontend"
npm install
npm run build

Set-Location $repo
git add backend/src/orders/orders.controller.ts
git add backend/src/orders/orders.service.ts
git add frontend/app/orders/page.tsx
git add deploy-admin-force-delete-order.ps1
git commit -m "Orders: admin can force-delete an order past Pending Approval, gated behind typed confirmation"
git push
