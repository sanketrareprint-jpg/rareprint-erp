# -- Re-trigger Railway auto-deploy with an empty commit --------------------
# Run this from PowerShell on your own machine (not inside any sandbox).
#
# Code is already correct on GitHub (commit 9690fd7, includes admin-delete +
# the Dockerfile port fix + boot diagnostics) but Railway never started a
# new deployment from it -- still showing the manually-selected Holidays
# build as active, with no newer deployment listed at all. Manually
# redeploying an older build in Railway can leave auto-deploy-on-push in a
# stuck state until something re-triggers it.
#
# This pushes a harmless, empty commit (no file changes) purely to fire
# Railway's GitHub webhook again. If Railway picks it up and starts a new
# deployment, we're back to normal. If it STILL doesn't trigger anything,
# that points at Railway's GitHub integration/auto-deploy setting itself
# needing a manual look (Settings > Source, or Settings > Deploy Triggers).

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

Set-Location $repo
git commit --allow-empty -m "Trigger redeploy: pick up latest commit (admin-delete + diagnostics)"
git push

Write-Host ""
Write-Host "Pushed an empty commit. Check Railway's Deployments tab now -- a new deployment should appear and start building within a few seconds." -ForegroundColor Yellow
