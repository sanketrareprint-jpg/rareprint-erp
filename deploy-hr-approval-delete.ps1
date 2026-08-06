# ── Deploy: HR — delete employees + Approved/Not approved column ──────────
# Run this from PowerShell on your own machine (not inside any sandbox).
# Stop and check the output at each step before moving to the next.
#
# What changed (no migration — masterDataApproved already existed on
# Employee, it just wasn't shown or filterable in the list view):
#
#  Backend:
#    - New DELETE /hr/employees/:id (admin/accounts access, same gate as
#      create/edit — not Sanket-only, since removing a test/duplicate entry
#      isn't the same as approving payroll). KRAs, leave ledger, and
#      attendance history cascade-delete via the schema automatically.
#      Use this for cleaning up test/mis-entered records — for real
#      employees who left, use Status -> RESIGNED/TERMINATED instead, which
#      keeps their history.
#      Files: backend/src/hr/hr.controller.ts, backend/src/hr/hr.service.ts
#
#  Frontend (frontend/app/hr/page.tsx):
#    - "Approved" column on the Employee Master table — green "Approved" /
#      amber "Not approved" badge per row (reads the existing
#      masterDataApproved field, already returned by the API, just wasn't
#      rendered in the list before).
#    - New "Payroll approval" filter dropdown next to the Status filter:
#      All / Approved / Not approved.
#    - Delete icon per row (with a confirm dialog) to remove test/duplicate
#      entries like "test" (RP015) and "abc" (RP03) directly from the list.

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

# 1. Backend: build check.
Set-Location "$repo\backend"
npm install
npm run build

# 2. Frontend: build check.
Set-Location "$repo\frontend"
npm install
npm run build

# 3. Commit and push — triggers Railway (backend) + Vercel (frontend) deploys.
Set-Location $repo
git add backend/src/hr/hr.controller.ts
git add backend/src/hr/hr.service.ts
git add frontend/app/hr/page.tsx
git add deploy-hr-approval-delete.ps1
git commit -m "HR: add employee delete + Approved/Not approved column and filter"
git push
