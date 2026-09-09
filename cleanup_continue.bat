@echo off
echo ============================================================
echo  CONTINUE: Commit resolved conflict, push, clean branches
echo ============================================================
echo.

echo [2/6] Committing resolved merge conflict...
cd /d C:\Users\ZEB\Desktop\print-erp-clean\.worktrees\main-push
git add backend/src/orders/orders.service.ts
git commit -m "merge: codex/web-to-print-testing into main (resolved customFields conflict)"
echo Done.
echo.

echo [3/6] Pushing merged main to GitHub...
git push origin main
echo Done.
echo.

echo [4/6] Removing worktrees...
cd /d C:\Users\ZEB\Desktop\print-erp-clean
git worktree remove .worktrees/web-to-print-preview --force
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
echo  ALL DONE. One clean main branch. Open Cursor and you are
echo  already on main - ready to use Codex normally.
echo ============================================================
pause
