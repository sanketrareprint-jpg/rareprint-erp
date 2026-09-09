# -- Let the super-admin's Approve button actually match what the backend --
# -- already allows -----------------------------------------------------
# Run this from PowerShell on your own machine.
#
# You hit "Cost data missing for some products... before approving" while
# testing. Turns out you (sanket.rareprint@gmail.com) don't actually need
# to touch the Cost Table at all -- the backend (accounts.service.ts's
# approveOrder) already lets the super-admin approve orders regardless of
# missing cost slabs:
#     if (!isSuperAdmin && !isOverride) { ...block on missing cost... }
#
# The bug was on the frontend: accounts/page.tsx already computes
# `isSuperAdmin` (used elsewhere on the same page) but never factored it
# into the Approve button's `canApprove` check, so the button stayed
# disabled for you too even though the API would have accepted it.
#
# Fixed: canApprove now bypasses the missing-cost block for the
# super-admin, and the warning banner/tooltip text reflects that you can
# still approve (margin/profit reporting just won't have data for that
# order until a cost slab is added later).
#
# This means: your test order should now be approvable as-is, with
# whatever product you already picked -- no need to hunt for specific
# products that happen to have cost slabs set up.
#
# File changed: frontend/app/accounts/page.tsx

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

Set-Location $repo
git add frontend/app/accounts/page.tsx
git add deploy-super-admin-approve-bypass.ps1
git commit -m "Accounts: let super-admin's Approve button bypass missing-cost-slab block, matching backend"
git push

Write-Host ""
Write-Host "Pushed. Give Vercel a minute, then hard-refresh the Accounts > Order Approval page and try Approve again." -ForegroundColor Yellow
