# ── Deploy: Super Admin Tasks dashboard section + Complaints surfaced ───
# Run this from PowerShell on your own machine (not inside any sandbox).
# Stop and check the output at each step before moving to the next.
#
# What changed (no schema/migration involved — pure code changes, no new
# Prisma models used, everything reads existing tables):
#  - backend/src/dashboard/dashboard.service.ts: new getSuperAdminTasks(),
#    bundled into getSummary() (owner-only, same gating as profit/cashflow).
#    Surfaces: orders stuck below 40% advance / missing cost data, bank
#    entries awaiting your final recheck, unverified commission sheets for
#    last month, open complaints, and a "Bonus Points Approval — coming
#    soon" placeholder for future work. Also new getComplaintsOverview() —
#    unlike the above, this one is NOT owner-gated: open/overdue/escalated
#    counts + top 5 urgent tickets, visible to every role.
#  - backend/src/dashboard/dashboard.controller.ts: new GET
#    /dashboard/super-admin-tasks (owner-only) and GET
#    /dashboard/complaints-overview (everyone) endpoints.
#  - frontend/app/dashboard/page.tsx: new "Super Admin Tasks" section
#    (owner-only, renders each task group generically so future groups need
#    no frontend changes) plus a "Complaints" card next to Order
#    Pipeline/Lead Sources that every role sees.
#  - frontend/app/accounts/page.tsx: accounts page now reads ?tab= from
#    the URL on load, so dashboard links land on the right tab
#    (pending / payment_verification / commission).
#
# NOTE: `git status` in this repo currently shows ~300 files as modified
# repo-wide — that's line-ending (CRLF/LF) noise from a different
# environment, not real changes, and is unrelated to this deploy. This
# script deliberately stages ONLY the 4 files above (not `git add .`) so
# that noise — and any other in-progress features you haven't shipped yet
# (call compliance, marketing ROI, the earlier dashboard cashflow fix) —
# doesn't get swept into this commit. Ship those separately/on purpose.

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

# 1. Backend: build check.
Set-Location "$repo\backend"
npm install
npm run build

# 2. Frontend: build check.
Set-Location "$repo\frontend"
npm install
npm run build

# 3. Stage only the files this feature touched, commit, and push — this is
#    what triggers Railway to build and deploy both backend and frontend.
Set-Location $repo
git add backend/src/dashboard/dashboard.service.ts
git add backend/src/dashboard/dashboard.controller.ts
git add frontend/app/dashboard/page.tsx
git add frontend/app/accounts/page.tsx
git status   # sanity check — should show exactly these 4 files staged
git commit -m "Add Super Admin Tasks dashboard section (order approvals, payment/commission verification, complaints) + accounts ?tab= deep-linking"
git push
