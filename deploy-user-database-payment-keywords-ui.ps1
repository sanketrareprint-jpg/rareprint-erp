# ── Deploy: Payment Keywords column on admin Database > Users table ─────
# Follow-up to the previous push (commit 4a8d3f7, already live) — that one
# added the backend + a management tab under Bank Statement > Employee Map.
# You asked for it in the User Database page specifically, so this adds it
# there too (reuses the same backend endpoints, no schema/migration change
# needed this time — just one frontend file).
#
# What changed:
#  - frontend/app/admin/database/page.tsx: the Users table now has a
#    "Payment Keywords" column. Shows each user's existing keywords as
#    removable badges, plus an inline input to add a new one — same
#    /bank-statement/user-keywords endpoints as the Employee Map tab, so
#    keywords added either place show up in both.
#
# NOTE: `git status` may show unrelated modified/untracked files (line-
# ending noise, other in-progress features). This script stages ONLY the
# one file below — don't use `git add .`.

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

# 1. Frontend: build check.
Set-Location "$repo\frontend"
npm install
npm run build

# 2. Stage only this file, commit, and push.
Set-Location $repo
git add frontend/app/admin/database/page.tsx
git status   # sanity check — should show exactly this 1 file staged

git commit -m "Add Payment Keywords column to admin Database > Users table"
git push
