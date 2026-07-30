# ── Deploy: "Return" (undo) button in Accounts > Dispatch Approval ──────
# Run this from PowerShell on your own machine (not inside any sandbox).
# Stop and check the output at each step before moving to the next.
#
# What changed (no schema/migration involved — pure code changes):
#  - frontend/app/accounts/page.tsx: added a "↩ Return" button next to
#    "Approve Dispatch" in the Dispatch Approval tab. Opens a reason modal
#    and calls the existing PATCH /accounts/:id/reject-dispatch endpoint.
#  - backend/src/accounts/accounts.service.ts: rejectDispatch() now also
#    writes a StatusLog entry with the reason (it previously only flipped
#    the order status back to APPROVED with no record of why).
#
# Note: this replaces the separate "Disapprove" button that briefly
# existed on the Dispatch page (Queue/History) — that was already
# reverted back to the simple "↩ Queue" button in an earlier commit.

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

# 1. Backend: build check.
Set-Location "$repo\backend"
npm install
npm run build

# 2. Frontend: build check.
Set-Location "$repo\frontend"
npm install
npm run build

# 3. Commit and push — this is what actually triggers Railway to build
#    and deploy both the backend and frontend. No migration step needed
#    since schema.prisma didn't change.
Set-Location $repo
git add backend/src/accounts/accounts.service.ts frontend/app/accounts/page.tsx deploy-dispatch-approval-return-button.ps1
git commit -m "Add Return (undo) button to Accounts > Dispatch Approval, log reason on reject-dispatch"
git push
