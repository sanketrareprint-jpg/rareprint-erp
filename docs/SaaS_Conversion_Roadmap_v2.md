# RarePrint ERP → Multi-Tenant SaaS: Conversion Roadmap

Based on: audit of `backend/prisma/schema.prisma` (90+ models, zero tenant concept), `backend/src` (30+ NestJS modules, single global `PrismaService`, JWT with no tenant claim), and your answers below.

**Decisions locked in:**
- Isolation model: **shared database, `tenantId` column** on every tenant-scoped table
- Scope: **full suite** (production, accounting, CRM, marketing, WhatsApp bot, rewards, sales-learning, virtual-CEO, etc.)
- Storefront: **excluded** — selling the back-office ERP only, printers keep their own customer-facing site
- Billing: **build subscription billing now**, using your existing Razorpay integration
- Marketing site: **needed** — a public homepage/feature/pricing site for prospects is in scope (added 2026-08-01)

---

## 1. Database (Prisma schema) — the foundation

- Add a `Tenant` model: `id`, `name`, `subdomain`, `status` (trial / active / suspended / cancelled), `planId`, `settings` (branding, feature flags as JSON), `createdAt`.
- Add `tenantId` FK to every tenant-scoped table — `User`, `Customer`, `Product`, `Order`, `OrderItem`, `Invoice`, `Payment`, `Vendor`, `Lead`, `MarketingContact`, `Commission`, `PrintSheet`, etc. Rough count: ~80 of the 90 models need it. Shared lookup/enum tables don't.
- Rework unique constraints that are currently global (order numbers, invoice numbers, product SKUs) into `@@unique([tenantId, orderNumber])` style composites.
- Add `tenantId` indexes on every high-traffic table.
- Write a backfill migration: create a `rareprint` tenant, stamp every existing row with its ID, before making the column non-nullable.
- Add Postgres Row-Level Security (RLS) as a second line of defense — even if a query forgets a `WHERE tenantId = ...`, the DB refuses to return other tenants' rows.

## 2. Backend (NestJS)

- Add tenant context: populate `tenantId` into request scope (AsyncLocalStorage or a request-scoped provider) from the JWT.
- Update `JwtStrategy`/`JwtPayload` (`backend/src/auth/jwt.strategy.ts`) to carry `tenantId`, and reject login if the tenant is suspended/cancelled.
- Add a Prisma middleware or Prisma Client Extension in `backend/src/prisma/prisma.service.ts` that auto-injects the `tenantId` filter on every query — this is the single choke point that prevents any of the ~30 modules from leaking data across tenants if a developer forgets to scope a query manually.
- Audit every service in every module (`orders`, `products`, `accounts`, `crm`, `marketing`, `production`, `dispatch`, `rewards`, `sales-learning`, `virtual-ceo`, `whatsapp`, `telephony`, `bank-statement`, `bigship`, `shiprocket`, `paper-inventory`, `cost-table`, `remittance`, `dashboard`, `reports`, `tasks`, `call-analysis`, `carrier-config`, `erp-config`) for tenant scoping on every `findMany`/`findUnique`/`update`/`delete`.
- Build a new `superadmin` module (for you) to create/suspend/activate tenants, view usage, and impersonate a tenant for support.
- Move integration credentials (Razorpay, Twilio, WhatsApp/AiSensy, Shiprocket, Bigship, Google APIs) out of `.env` into an encrypted per-tenant config table — each printer will have their own accounts.
- Namespace file storage (uploads, product images, generated invoice PDFs) per tenant.
- Cron jobs / background workers (WhatsApp follow-ups, marketing campaigns, learning streaks) must loop per-tenant instead of assuming one company.

## 3. Auth & access

- Build tenant signup: new company → creates `Tenant` + first admin `User`.
- Team invite flow within a tenant.
- Distinguish your platform-level "superadmin" role from each tenant's internal `UserRole` enum.

## 4. Billing (Razorpay Subscriptions)

- New models: `Plan` (price, cycle, feature/usage limits), `Subscription` (tenantId, planId, status, trial end, current period), `BillingInvoice`.
- Razorpay Subscriptions API + webhooks for payment success/failure/renewal.
- Trial period + auto-suspend on non-payment.
- Usage limits if plans are tiered (e.g. orders/month, seats, storage).
- Tenant-facing billing screen: current plan, upgrade/downgrade, invoice history, payment method.
- Payment-failure reminders (you already have WhatsApp/Twilio wired up — reuse it).

## 5. Frontend (Next.js)

- Tenant-aware login: JWT carries `tenantId`; decide subdomain-per-tenant (`acme.yourerp.com`) vs. single app + tenant switcher.
- Light white-labeling of the dashboard chrome (logo, colors) even though there's no public storefront — it's still customer-facing to each printer's staff.
- New superadmin console screens (tenant list, status, impersonate, billing overview).
- Signup/onboarding wizard (company details → admin user → plan selection).
- Audit for hardcoded RarePrint branding/copy/data in the UI and remove it.

## 6. Marketing / sales website (public-facing)

This is separate from both the ERP app (for people who already signed up) and `rareprint-website/` (your own printing storefront, stays yours, out of scope). It's the page a stranger printer-owner lands on to decide whether to buy.

- Public homepage: what the product does, who it's for, why a printer should care.
- Feature pages/sections: production tracking, accounting, CRM, marketing, WhatsApp bot, rewards, sales-learning, virtual-CEO, etc. — pick which features to lead with vs. bury.
- Pricing page — should mirror the `Plan` models from billing (section 4) rather than hardcoded copy that drifts out of sync; ideally rendered from a public `/plans` API.
- "Start free trial" / "Book a demo" CTA that feeds straight into the signup/onboarding wizard (section 5).
- Can be a lightweight standalone site (simple Next.js marketing pages or even static) — doesn't need to share a codebase with the ERP app, just needs to link into the signup flow and stay in sync on pricing.
- Testimonials/case studies section — placeholder until you have first paying tenants.
- Decide: new domain (e.g. `yourerp.com`) vs. a marketing route in front of the existing app (e.g. `app.yourerp.com` for the product, `/` for marketing).

## 7. Security hardening & repo hygiene

- The repo root and `frontend/` currently contain dozens of one-off scripts (`fix-*.js`, `check*.js`, `patch-*.js`, `.bak` files), exported spec docs/spreadsheets, and a nested duplicate repo (`push-main/`). None of this belongs in a codebase you're selling/licensing — split into a clean product repo vs. an internal RarePrint-ops repo.
- `rareprint-website/` (static HTML, RarePrint-branded) and `whatsapp-ai-chatbot/` (currently single-tenant Python service with hardcoded config) are out of scope per your storefront decision — move them out of the sellable product repo, or plan a later phase to make the chatbot tenant-aware if you want to upsell it separately.
- Add audit logging for superadmin actions (impersonation, cross-tenant edits).

## 8. Infra / DevOps

- Confirm Railway hosting scales with multiple tenants on one DB; add PgBouncer once tenant count grows.
- Per-tenant data export (offboarding, data-portability requests).
- Staging environment with 2+ dummy tenants to test isolation before onboarding a real customer.
- Error tracking + per-tenant usage dashboards (useful for upsell and abuse detection).

## 9. Legal / commercial (non-code, but blocking before you sell)

- Terms of Service, Privacy Policy, Data Processing Agreement.
- Pricing copy finalized and synced with the marketing site's pricing page (section 6).
- Support process/SLA for paying customers.

---

## Suggested build order

1. `Tenant` model + migration + backfill existing RarePrint data
2. Tenant context + Prisma-level auto-scoping + JWT tenant claim
3. Module-by-module audit for tenant scoping (the long pole — 30 modules)
4. Per-tenant integration credentials (payments, WhatsApp, courier)
5. Signup/onboarding + Razorpay subscription billing
6. Marketing website (homepage, features, pricing) wired into the signup flow
7. Superadmin console
8. Frontend branding + billing UI
9. Repo hygiene / split non-product folders out
10. Security audit with dummy multi-tenant staging data before first real customer

---

## Prompt to hand to a coding agent (Phase 1)

Copy this into Claude Code or a similar coding agent pointed at the `backend` repo to start the highest-risk, foundation-laying phase. Don't run later phases until this one is reviewed and tested — everything else depends on it.

```
I'm converting a single-tenant NestJS + Prisma + PostgreSQL ERP (backend/) into a
multi-tenant SaaS product, sold to other printing businesses. Multi-tenancy model:
shared database, tenant isolation via a `tenantId` column on every tenant-scoped
table (not schema-per-tenant, not database-per-tenant).

Do ONLY Phase 1 in this session — foundation work. Do not touch billing, frontend,
or the superadmin console yet.

Phase 1 scope:
1. Add a new `Tenant` model to prisma/schema.prisma: id, name, subdomain (unique),
   status (enum: TRIAL, ACTIVE, SUSPENDED, CANCELLED), planId (nullable for now),
   settings (Json, for branding/feature flags), createdAt, updatedAt.
2. Add a `tenantId` foreign key (String, references Tenant.id) to every model that
   holds tenant-specific business data — walk the schema and list every model you
   plan to touch before editing, so I can review the list first. Skip pure
   lookup/enum tables if any exist.
3. Convert any globally-unique business identifiers (order numbers, invoice
   numbers, product SKUs, etc.) to be unique per tenant instead
   (@@unique([tenantId, fieldName])).
4. Write a migration that: (a) adds the Tenant table, (b) creates one row for a
   tenant named "RarePrint", (c) adds tenantId as nullable to all affected tables,
   (d) backfills every existing row with the RarePrint tenant's id, (e) then makes
   tenantId NOT NULL. Do this as a reviewable multi-step Prisma migration, not a
   single destructive one.
5. Add tenant context propagation: extend JwtPayload/JwtStrategy
   (backend/src/auth/jwt.strategy.ts) to include tenantId, and use
   AsyncLocalStorage (or a request-scoped NestJS provider) to make the current
   tenantId available anywhere in the request lifecycle without threading it
   through every function signature.
6. Add a Prisma Client Extension (or middleware, whichever fits our Prisma
   version) in backend/src/prisma/prisma.service.ts that automatically applies a
   `tenantId` filter to every query on tenant-scoped models, and automatically
   sets `tenantId` on every create. This must be the single enforcement point —
   don't rely on every service file remembering to filter manually.
7. Do NOT yet update the ~30 feature modules (orders, products, accounts, crm,
   marketing, production, etc.) beyond what's needed to keep the app compiling.
   That's Phase 2, later.

Before writing any migration, show me: the full list of models getting a
tenantId column, and the exact composite-unique changes you plan to make.
Wait for my go-ahead before running the migration against real data.
```

Once Phase 1 is reviewed and merged, come back and I'll write the Phase 2 prompt (module-by-module tenant-scoping audit) and the billing/subscription prompt, plus a Phase for the marketing site once you're ready for it.
