# ── Order Journey: simplified view + fixed the "reverts to Ready for
#    Dispatch" confusion ───────────────────────────────────────────────────
# Run this from PowerShell on your own machine (not inside any sandbox).
#
# THE BUG YOU SAW: opening an order's Journey, you'd see a green
# "READY FOR DISPATCH" badge appear a second time, weeks after the order
# first reached that stage, right under a "Payment received" note — looking
# exactly like the order had gone backwards from Dispatched to Ready for
# Dispatch.
#
# ROOT CAUSE (checked the code, not a guess): recording a payment
# (addPayment in orders.service.ts) has NEVER touched the order's actual
# status — it only updates a separate paymentStatus field (Pending/Partial/
# Paid). But it also writes a StatusLog row with fromStatus = toStatus =
# whatever the order's status happened to be at that moment, just to keep a
# record of "a payment came in while the order was at X stage." That log
# entry was being rendered with the exact same colored badge as a real
# stage transition, so a same-status payment log looked identical to the
# order genuinely re-entering Ready for Dispatch. For the order in your
# screenshot specifically: it reached Ready for Dispatch on 10 Jul and was
# simply never actually dispatched since — the payment on 3 Aug didn't move
# it anywhere, the badge just implied it had.
#
# FIX: payment log entries now render as their own short "Payment ₹X (method)"
# line — no status badge, so they can no longer be mistaken for a real
# transition. order.status itself was never wrong; this was a display bug.
#
# ALSO DONE (you asked for this too): the Journey now only shows real
# order-level milestones and payments. Internal production detail — sheet
# assignment, sheet stage changes, stage-vendor assignment, per-item
# duplicate entries — is no longer shown here, and the "reason" note next to
# each entry is now a short "(...)" instead of the long metadata grid.
#
# File changed: frontend/app/orders/page.tsx

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

Set-Location "$repo\frontend"
npm install
npm run build

Set-Location $repo
git add frontend/app/orders/page.tsx
git add deploy-order-journey-simplify-and-payment-fix.ps1
git commit -m "Orders: simplify Order Journey to order-level milestones + payments only, fix payment log entries looking like a Ready-for-Dispatch status reversion"
git push
