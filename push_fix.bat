@echo off
cd /d C:\Users\ZEB\Desktop\print-erp-clean
git config user.email "sanket.rareprint@gmail.com"
git config user.name "Sanket"
git add backend/src/cost-table/cost-table.service.ts
git commit -m "fix: getOrdersWithoutCost use raw SQL to catch quantity-range gaps + complete missing methods"
git push origin main
pause
