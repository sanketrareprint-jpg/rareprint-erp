# RarePrint ERP — Project Context for Claude

## Project Overview
Full-stack print business ERP system built for RarePrint.
Local path: `C:\Users\ZEB\Desktop\print-erp`

---

## Tech Stack
- **Frontend:** Next.js 14, TypeScript, Tailwind CSS, shadcn/ui, Lucide icons
- **Backend:** NestJS, Prisma ORM, PostgreSQL
- **Deployed Frontend:** https://rareprint-erp.vercel.app (Vercel)
- **Deployed Backend:** https://rareprint-erp-production.up.railway.app (Railway)
- **Database:** PostgreSQL on Railway
- **GitHub:** https://github.com/sanketrareprint-jpg/rareprint-erp

---

## Local Development
```
Docker Desktop → start print-erp-db container
cd backend && npm run start:dev        # runs on :3000
cd frontend && npm run dev             # runs on :3001
```

---

## Git Push Command
```powershell
cd C:\Users\ZEB\Desktop\print-erp
git add .
git commit -m "your message"
git push https://sanketrareprint-jpg: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@github.com/sanketrareprint-jpg/rareprint-erp.git main
```

> ⚠️ Git email must be set to avoid Vercel blocking deployments:
> `git config user.email "sanket.rareprint@gmail.com"`
> `git config user.name "Sanket"`

---

## Railway DB (Prisma Studio)
```powershell
cd backend
$env:DATABASE_URL="postgresql://postgres:cpwyjHacUIgnKYAgZqHSqSGOmMjfqqYc@monorail.proxy.rlwy.net:46355/railway"
npx prisma studio
```

---

## Production Credentials
| User | Email | Password | Role |
|------|-------|----------|------|
| Admin | sanket.rareprint@gmail.com | Admin@1234 | ADMIN |
| Agent | vaishali.rareprint@gmail.com | Vaishali@1234 | SALES_AGENT |

---

## LocalStorage Keys (used by dashboard-shell.tsx)
- `rareprint_user` → `{ id, fullName, email, role }` (JSON object)
- `rareprint_token` → JWT string

---

## User Roles in DB
| Role value in DB | Access |
|---|---|
| `ADMIN` | All modules + User Management |
| `SALES_AGENT` | Dashboard + Orders only |
| `ACCOUNTS` | Dashboard + Orders + Accounts |
| `PRODUCTION` | Dashboard + Production |
| `DISPATCH` | Dashboard + Dispatch |

---

## Business Flow
```
Agent creates order → PENDING_APPROVAL
→ Accounts approves → APPROVED
→ Production marks items ready → (all items ready triggers next stage)
→ Agent submits dispatch → PENDING_DISPATCH_APPROVAL
→ Accounts approves → READY_FOR_DISPATCH
→ Dispatch books courier → DISPATCHED
```

---

## Key Frontend Files
```
frontend/
  components/
    dashboard-shell.tsx        ← Role-based nav sidebar (dark icon style)
  app/
    dashboard/page.tsx         ← Dashboard with charts and stats
    orders/page.tsx            ← Order list + create order form
    production/page.tsx        ← Production per-item tracking
    accounts/page.tsx          ← Accounts approval + payment
    dispatch/page.tsx          ← Dispatch batch booking + Shiprocket
    users/page.tsx             ← User management (Admin only)
    login/page.tsx             ← Login page
  lib/
    api.ts                     ← API_BASE_URL constant
    auth.ts                    ← getAuthHeaders(), clearAuth()
```

---

## Key Backend Files
```
backend/
  src/
    auth/
      auth.service.ts          ← Login, JWT, bcrypt
      auth.controller.ts
      jwt-auth.guard.ts
      roles.guard.ts
      roles.decorator.ts
    orders/
      orders.controller.ts
      orders.service.ts
    users/
      users.controller.ts
      users.service.ts
    production/
      production.controller.ts
      production.service.ts
    accounts/
      accounts.controller.ts
      accounts.service.ts
    dispatch/
      dispatch.controller.ts
      dispatch.service.ts
    dashboard/
      dashboard.controller.ts
      dashboard.service.ts
    prisma/
      prisma.service.ts
  prisma/
    schema.prisma              ← DB schema
    seed-products.ts           ← Seeds 25 print products
    fix-vaishali-password.ts   ← One-time password fix script
```

---

## Auth Pattern
- JWT stored in `rareprint_token`
- User object stored in `rareprint_user`
- All API calls use: `Authorization: Bearer <token>`
- `getAuthHeaders()` from `@/lib/auth` returns the headers object
- Login response shape: `{ accessToken, tokenType: 'Bearer', user: { id, fullName, email, role } }`

---

## API Base URL
- Frontend uses `API_BASE_URL` from `@/lib/api`
- Production: `https://rareprint-erp-production.up.railway.app`
- Local: `http://localhost:3000`

---

## Completed Features
- Full order flow with status transitions
- Role-based access control (frontend nav + backend guards)
- Accounts approval (order + dispatch)
- Production per-item stage tracking
- Dispatch batch booking with Shiprocket courier rates
- Design file upload per order item
- Dashboard with charts (revenue, pipeline, recent orders)
- Dark icon sidebar (role-based, reads from rareprint_user localStorage)
- User management page (Admin only — create, edit, reset password, delete)

---

## Pending / In Progress Features
- [ ] Sales agent name shown on order rows in all modules
- [ ] Attach design file in order creation form
- [ ] Remove payment details from inside order form
- [ ] Compact production rows (show 20 rows without scrolling)
- [ ] Search bar + filters in all modules (orders, accounts, production, dispatch)
- [ ] AiSensy WhatsApp API integration
- [ ] Customer phone in orders table
- [ ] Order age column
- [ ] Priority marking on orders
- [ ] Products seeded in Railway DB

---

## Sidebar Design
Dark navy (`#1e3a5f`) narrow sidebar (~72px wide).
Icon + label stacked vertically per nav item.
Active item: blue (`#2563eb`) rounded background.
Logo: blue rounded square with Printer icon + "RARE PRINT" text.
Bottom: user initial avatar, role label, sign out button.

---

## Vercel Deployment Notes
- Auto-deploys on push to `main`
- Was blocked due to `invalid-email-address` git config — fixed by setting `user.email = sanket.rareprint@gmail.com`
- Frontend root: `/frontend` directory

---

## Railway Deployment Notes
- Auto-deploys on push to `main`
- Backend root: `/backend` directory
- DB connection via `DATABASE_URL` env variable

---

## Shiprocket Integration
- Used in dispatch module for courier rate fetching
- Credentials stored in Railway environment variables

---

## AiSensy WhatsApp (Planned)
- API integration pending
- Trigger events: order created, order approved, dispatched
- API key: TBD
