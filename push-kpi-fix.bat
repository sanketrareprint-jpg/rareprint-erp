@echo off
echo === Push Build Fixes ===
echo.

set REPO=https://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@github.com/sanketrareprint-jpg/rareprint-erp.git
set TMP=C:\Temp\rp-push-tmp
set SRC=C:\Users\ZEB\Desktop\print-erp-clean

echo Cleaning up old temp clone...
if exist "%TMP%" rmdir /s /q "%TMP%"

echo Cloning repo...
git clone --depth 1 %REPO% "%TMP%"
if errorlevel 1 (echo Clone failed. & pause & exit /b 1)

echo Copying fixed files...
copy /y "%SRC%\backend\src\dashboard\dashboard.service.ts" "%TMP%\backend\src\dashboard\dashboard.service.ts"
copy /y "%SRC%\backend\src\production\clubbing-sheet.service.ts" "%TMP%\backend\src\production\clubbing-sheet.service.ts"
copy /y "%SRC%\frontend\app\dashboard\page.tsx" "%TMP%\frontend\app\dashboard\page.tsx"

echo Committing and pushing...
cd /d "%TMP%"
git add backend/src/dashboard/dashboard.service.ts backend/src/production/clubbing-sheet.service.ts frontend/app/dashboard/page.tsx
git commit -m "fix: build errors — avgDaysMonth type + restore clubbing-sheet + KPI trends UI"
git push

cd /d "%SRC%"
rmdir /s /q "%TMP%"

echo.
echo DONE! Press any key to close.
pause
