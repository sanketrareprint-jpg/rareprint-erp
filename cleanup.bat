@echo off
echo ============================================================
echo  CLEANUP: Merge Codex work into main, remove all branches
echo ============================================================
echo.

echo [1/6] Merging codex work into main (via worktree)...
cd /d C:\Users\ZEB\Desktop\print-erp-clean\.worktrees\main-push
git fetch origin
git merge origin/codex/web-to-print-testing --no-ff -m "merge: codex/web-to-print-testing into main"
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Merge failed. Resolve conflicts manually, then re-run from step 2.
    pause
    exit /b 1
)
echo Done.
echo.

echo [2/6] Pushing merged main to GitHub...
git push origin main
echo Done.
echo.

echo [3/6] Removing web-to-print-preview worktree...
cd /d C:\Users\ZEB\Desktop\print-erp-clean
git worktree remove .worktrees/web-to-print-preview --force
echo Done.
echo.

echo [4/6] Removing main-push worktree...
git worktree remove .worktrees/main-push --force
echo Done.
echo.

echo [5/6] Deleting codex branches locally...
git branch -D codex/web-to-print-testing
git branch -D codex/web-to-print-preview
echo Done.
echo.

echo [6/6] Deleting codex branches from GitHub...
git push origin --delete codex/web-to-print-testing
git push origin --delete codex/web-to-print-preview
echo Done.
echo.

echo ============================================================
echo  ALL DONE. You now have one clean main branch only.
echo  Switch back to main in Cursor: git checkout main
echo ============================================================
pause
