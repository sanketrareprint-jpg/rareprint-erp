@echo off
echo ============================================
echo STEP 1: Go into the main-push worktree
echo (This is where 'main' branch lives)
echo ============================================
cd /d C:\Users\ZEB\Desktop\print-erp-clean\.worktrees\main-push
echo Current dir: %CD%
git branch
echo.

echo ============================================
echo STEP 2: Merge codex/web-to-print-testing into main
echo ============================================
git merge origin/codex/web-to-print-testing --no-ff -m "merge: codex/web-to-print-testing into main"
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [FALLBACK] Trying local branch reference...
    git merge codex/web-to-print-testing --no-ff -m "merge: codex/web-to-print-testing into main"
)
echo.

echo ============================================
echo STEP 3: Push main to origin
echo ============================================
git push origin main
echo.

echo ============================================
echo DONE - check above for errors
echo ============================================
pause
