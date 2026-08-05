# ── Deploy: Sign up option on login page ──────────────────────────────────
# Run this from PowerShell on your own machine (not inside any sandbox).
# Stop and check the output at each step before moving to the next.
#
# What changed (backend + frontend — no migration involved, User table
# already has everything needed):
#
#  Backend: added POST /auth/register (public, no guard — same pattern as
#  /auth/forgot-password). Creates the account (bcrypt-hashed password,
#  same as login), then returns an access token so the person is logged in
#  immediately, same response shape as /auth/login.
#    - backend/src/auth/auth.controller.ts — RegisterDto + register route
#    - backend/src/auth/auth.service.ts — AuthService.register()
#
#  Role defaults to SALES_AGENT if not specified. ADMIN is intentionally not
#  selectable from signup — owner-level accounts still go through Settings >
#  Database, same as before, so self-signup can't hand out admin access.
#
#  Frontend:
#    - frontend/app/signup/page.tsx (new) — name, email, password, role form
#    - frontend/app/login/page.tsx — added a "Don't have an account? Sign up"
#      link at the bottom, matching the existing "Forgot password?" pattern.

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
git add backend/src/auth/auth.controller.ts
git add backend/src/auth/auth.service.ts
git add backend/package.json
git add frontend/app/signup/page.tsx
git add frontend/app/login/page.tsx
git add deploy-signup.ps1
git commit -m "Add sign up option: POST /auth/register + /signup page + login page link"
git push
