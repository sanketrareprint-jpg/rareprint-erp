# ── PERMANENT FIX: "New Paper Purchase Order" Internal server error ────────
# Run this from PowerShell on your own machine (not inside any sandbox).
#
# WHY THE PREVIOUS FIX DIDN'T TAKE: I earlier added a self-heal check to
# backend/scripts/ensure-all-columns.js for the 3 missing PaperPurchaseOrder/
# Item billing columns. That code is correct, but that script only runs if
# someone manually executes `node scripts/ensure-all-columns.js` (or
# railway-migrate.js) against production — nothing calls it automatically on
# a normal deploy, by design (this repo deliberately keeps Railway's
# startCommand as plain `node dist/src/main.js`; a migration step ahead of
# app start caused a real outage before). If that manual step was never run,
# pushing the code alone did nothing for production.
#
# ACTUAL ROOT CAUSE (confirmed by reading schema.prisma directly): migration
# 20260612000400_add_billing_fields_to_paper_po added transportCharges,
# totalBillAmount, ratePerUnit to the DATABASE, but those 3 fields were NEVER
# added to schema.prisma itself — Prisma's generated client has no idea they
# exist, which is why PaperInventoryService.createPurchaseOrder() has always
# had to write them via raw $executeRaw. That's fine as long as the columns
# exist on the DB; if they don't (drifted _prisma_migrations, or the manual
# self-heal step was never run), every Save throws a raw Postgres
# "column does not exist" error — the generic "Internal server error".
#
# THE PERMANENT FIX: added the same 3 self-heal ALTER TABLE ... ADD COLUMN
# IF NOT EXISTS calls directly to PrismaService.onModuleInit()
# (backend/src/prisma/prisma.service.ts), right next to the existing
# Product.paperType self-heal that's already there. onModuleInit runs on
# EVERY app boot as part of normal NestJS startup — no manual script, no
# extra step, nothing to forget. The very next deploy fixes this for good.
#
# File touched: backend/src/prisma/prisma.service.ts

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

# 1. Backend: local build check.
Set-Location "$repo\backend"
npm install
npm run build

# 2. Commit and push — this is what actually triggers Railway to build
#    and deploy the backend. The fix applies itself on that deploy's boot,
#    no separate database step needed.
Set-Location $repo
git add backend/src/prisma/prisma.service.ts
git add deploy-paper-po-columns-permanent-fix.ps1
git commit -m "Permanent fix: self-heal PaperPurchaseOrder/Item billing columns on every boot (onModuleInit), not just via a manual script"
git push
