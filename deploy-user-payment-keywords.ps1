# ── Deploy: Employee (User) Payment-Description Keywords ────────────────
# Run this from PowerShell on your own machine (not inside any sandbox).
# Stop and check the output at each step before moving to the next.
#
# What changed:
#  - backend/prisma/schema.prisma + new migration
#    20260728120000_add_user_payment_keywords: new UserPaymentKeyword table
#    (keyword <-> User, same shape as the existing VendorKeyword /
#    ExpenseKeyword tables). THIS ONE HAS A SCHEMA CHANGE — run the
#    migration step below, unlike the last few dashboard-only deploys.
#  - backend/src/bank-statement/bank-statement.service.ts: bank statement
#    import (and the "Re-match" button) now also checks each DR
#    transaction's description against every user's keywords. A match
#    auto-tags the transaction as that person's salary payment
#    (salaryForUserId + MATCHED_SALARY), the same way vendor/expense
#    keywords already auto-tag vendor/expense matches. New CRUD methods
#    (list/upsert/delete keywords, list active users) + a helper that
#    retroactively re-tags existing UNMATCHED/MANUAL_REVIEW transactions
#    when a new keyword is added.
#  - backend/src/bank-statement/bank-statement.controller.ts: new routes
#    GET /bank-statement/users, GET/POST /bank-statement/user-keywords,
#    DELETE /bank-statement/user-keywords/:id.
#  - frontend/app/bank-statement/page.tsx: new "Employee Map" tab (next to
#    Vendor Map / Expense Map) to add/remove keyword -> employee rules,
#    plus MATCHED_SALARY added to the status badge legend.
#
# NOTE: `git status` may show unrelated modified/untracked files in this
# repo (line-ending noise, other in-progress features, local xlsx exports,
# deploy scripts from earlier sessions). This script stages ONLY the files
# below — don't use `git add .`.

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

# 1. Apply the migration to the live Railway Postgres DB.
#    `prisma migrate deploy` only runs new migration files — it will not
#    touch anything already applied, and this one is written idempotently
#    (IF NOT EXISTS / duplicate_object guards) so it's safe to re-run.
Set-Location "$repo\backend"
npx prisma migrate deploy

# 2. Backend: build check.
npm install
npm run build

# 3. Frontend: build check.
Set-Location "$repo\frontend"
npm install
npm run build

# 4. Stage only the files this feature touched, commit, and push — this is
#    what triggers Railway to build and deploy both backend and frontend.
Set-Location $repo
git add backend/prisma/schema.prisma
git add backend/prisma/migrations/20260728120000_add_user_payment_keywords/migration.sql
git add backend/src/bank-statement/bank-statement.service.ts
git add backend/src/bank-statement/bank-statement.controller.ts
git add frontend/app/bank-statement/page.tsx
git status   # sanity check — should show exactly these 5 files staged

git commit -m "Add employee payment-description keywords: auto-match bank transactions to staff (Bank Statement > Employee Map)"
git push
