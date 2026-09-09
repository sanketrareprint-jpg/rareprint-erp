# ── Diagnose: orders stuck at READY_FOR_DISPATCH ──────────────────────────
# Run this from PowerShell on your own machine (needs real network access to
# the Railway Postgres DB — won't work from an offline/sandboxed environment).
#
# What this does: reads every order currently sitting in READY_FOR_DISPATCH
# or PARTIALLY_DISPATCHED and sorts them into buckets — missing Sales/Accounts
# dispatch approval, approved but never booked, booked into Bigship but never
# manifested (no AWB), or a data inconsistency — so you know exactly which
# fix applies to which orders instead of guessing. See the comment block at
# the top of backend/scripts/diagnose-stuck-dispatch-orders.js for the full
# reasoning — a code review of the whole dispatch pipeline found no single
# bug that would silently block every order, so the cause is very likely
# order-specific and needs real data to pin down.
#
# This is read-only — it does not change anything in the database.

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

Set-Location "$repo\backend"
node scripts/diagnose-stuck-dispatch-orders.js
