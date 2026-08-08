# -- Isolate which import is actually hanging boot -------------------------
# Run this from PowerShell on your own machine (not inside any sandbox).
#
# The last deploy attempt (which finally ran, once the GitHub connection was
# fixed) confirmed something important: railway-migrate.js completes fully
# and cleanly -- its final diagnostic line
#   "[railway-migrate] All steps complete, handing off to the app..."
# DID show up in the log. But NONE of main.ts's diagnostic lines showed up
# after that, including the very first one at the top of bootstrap(). That
# means the hang isn't inside NestJS's bootstrap logic at all -- it's
# happening while dist/src/main.js is still loading its own imports/requires,
# before bootstrap() is even called.
#
# main.ts imports AppModule, which imports 40+ feature modules. This change
# adds a console.log between every single import in main.ts, so the next
# deploy log will show exactly which require call never returns -- almost
# certainly something pulled in transitively through app.module.ts, but this
# will tell us precisely which one instead of guessing further.
#
# Verified the compiled JS output keeps these console.log calls in the exact
# order written (TypeScript's CommonJS emit does not hoist requires ahead of
# interspersed statements), so this diagnostic will work as intended.
#
# File changed: backend/src/main.ts

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

Set-Location "$repo\backend"
npm install
npm run build

Set-Location $repo
git add backend/src/main.ts
git add deploy-isolate-import-hang.ps1
git commit -m "Add per-import diagnostic logging to main.ts to isolate the exact hanging require"
git push

Write-Host ""
Write-Host "Pushed. Watch Railway's Deployments tab -- it should pick this up automatically now that the GitHub connection is fixed." -ForegroundColor Yellow
Write-Host "Paste the new deploy log once it either succeeds or hangs again." -ForegroundColor Yellow
