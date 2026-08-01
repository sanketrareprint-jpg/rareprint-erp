# marketing-site

Public marketing/sales website for PrintERP (the SaaS version of RarePrint's ERP). Separate app
from `../frontend` (the authenticated ERP product) and `../rareprint-website` (RarePrint's own
printing storefront) — see `../docs/Marketing_Site_Roadmap.md` for the full plan and reasoning.

This is Phase A + B of that roadmap: scaffold + static content pages, no backend dependency yet.
Pricing (`app/lib/plans-data.ts`) and contact links (`app/lib/site-config.ts`) are placeholders —
see the TODOs in those two files.

## Local dev

```bash
npm install
npm run dev
```

Runs on `http://localhost:3002` (3001 is already `frontend`, 3000 is Next's default).

## Before this goes live

1. **Replace the WhatsApp number** in `app/lib/site-config.ts` — currently a placeholder. Two
   candidate numbers exist in `backend/.env`; didn't want to guess which is meant to be
   customer-facing.
2. **Decide the domain** (new domain like `printerp.in` vs. a subdomain split) — open question #1
   in the roadmap doc. Not code, just DNS + Railway domain config once decided.
3. **Lock real pricing** — `app/lib/plans-data.ts` has three placeholder tiers with placeholder
   INR numbers. Update or replace before launch.
4. **Create the Railway service.** This repo already runs `frontend/` and `backend/` as two
   separate Railway services from one GitHub repo (see their `Dockerfile`/`railway.json`). Add
   `marketing-site/` as a third service the same way — point its root directory at
   `marketing-site/` in the Railway dashboard.

## Later phases (not built yet, tracked in the roadmap doc)

- **Phase C** — swap `getPlans()` in `app/lib/plans-data.ts` for a real fetch to
  `GET /public/plans` once the backend `Plan` model exists.
- **Phase D** — replace the WhatsApp/email links on `/about` with a form posting to a public
  lead-capture endpoint that drops straight into the ERP's own CRM.
- **Phase E** — once the Tenant model + signup wizard exist, point "Book a demo" /
  "Talk to us" CTAs at real self-serve signup instead of WhatsApp.
