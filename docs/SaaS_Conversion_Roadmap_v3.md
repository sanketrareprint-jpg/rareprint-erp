# RarePrint ERP → Multi-Tenant SaaS: Conversion Roadmap (v3)

Supersedes `SaaS_Conversion_Roadmap_v2.md`. That version used a shared database with
a `tenantId` column on every table. That code was deployed to `main` on 2026-09-07
ahead of its own migration ever being run against production, causing a site-wide
outage (`Prisma P2022: column tenantId does not exist`) that broke login and most
core ERP functionality for roughly two days, discovered and fixed 2026-09-09. The
tenantId code was fully reverted off `main`. This document reflects the replacement
decision, reached 2026-09-12, after explicitly weighing this against industry
practice (AWS's SaaS Tenant Isolation Strategies whitepaper's Silo/Pool/Bridge
framework, and Microsoft's Azure Architecture Center multitenancy guidance).

**Decisions locked in:**
- Isolation model: **one dedicated database per customer.** No shared database, no
  `tenantId` column, no shared tables of any kind between customers, ever.
- RarePrint's own production instance (the live ERP running RarePrint's own
  business today) is **permanently separate infrastructure** from every customer's
  instance. It never shares a database, a backend deployment, or any other runtime
  resource with a customer, under any circumstance, regardless of how this roadmap
  evolves later.
- Default posture: **stay on this fully-separated model indefinitely.** This is not
  a temporary starting point to be "graduated" out of once there are more
  customers — industry precedent (see Sources below) shows companies scale this
  model to hundreds of customers by investing in deployment automation, not by
  switching to a shared-infrastructure model. Revisit only if a specific,
  demonstrated cost problem shows up later (see "When to reconsider" below), not on
  a schedule or a customer-count milestone.
- Scope: full suite (production, accounting, CRM, marketing, WhatsApp bot, rewards,
  sales-learning, virtual-CEO, etc.) — unchanged from v2.
- Storefront: excluded — selling the back-office ERP only, printers keep their own
  customer-facing site — unchanged from v2.
- Billing: build subscription billing using the existing Razorpay integration —
  unchanged from v2, mechanically the same regardless of isolation model.
- Marketing site: needed, already built at `frontend/app/suite/` — unchanged from
  v2, out of scope for this document.
- Hosting platform: Railway, using its native **Environments** feature (a full,
  isolated copy of an app's services and config, including its own database, its
  own URL, and its own networking) as the mechanism for giving each customer their
  own dedicated instance.
- The `saas-conversion` branch created 2026-09-09 holds the old, abandoned
  shared-database `tenantId` work. Do not merge it or build on top of it. Start
  fresh from `main` for anything in this document.

---

## Why this instead of v2, in one paragraph

A code bug (a wrong calculation, a broken feature) exists identically everywhere
regardless of isolation model, since every customer runs the same codebase — that
risk is fixed by testing, not architecture. What architecture actually controls is
the *blast radius* of an operational failure: a crash, a resource spike, a bad
deploy, one customer's heavy usage slowing down another. A shared database or
shared running process means that kind of failure can hit every customer (and, in
v2's design, RarePrint's own live business) at once. A dedicated database and
dedicated backend per customer contains that failure to one customer's instance
only. This is a named, standard pattern (AWS calls it the "Silo model"; the general
engineering term for the containment mechanism is the "bulkhead pattern"), not
something invented for this project. The real cost of it — a separate database and
backend per customer costs more to run than one shared instance, and a fix has to
be rolled out to every customer's instance instead of one place — is accepted
deliberately, in exchange for RarePrint's own production never again being at risk
from anything customer-related.

## When to reconsider a shared/pooled model (not now)

Only revisit this if a specific, demonstrated problem shows up, not preemptively:
- A large number of customers each too small to individually justify the cost of
  their own dedicated database sitting mostly idle. Given RarePrint sells to real
  printing businesses paying real subscription fees, not free-tier users, this may
  never actually happen — don't build for it speculatively.
- A genuine need for instant, single-point-of-truth cross-customer features (e.g.
  live cross-tenant analytics) that a scripted, sequential rollout across separate
  databases can't serve well enough. Note the superadmin console (Section 5) can
  still aggregate data across customers by querying each database individually —
  this alone is not a reason to pool.

If either of these becomes real, the fallback is AWS's "Bridge model": one shared
backend process that looks up which customer is making a request and opens that
customer's still-separate database, rather than a shared database with a tenantId
column. Do not reintroduce a shared database with a tenantId column under any
circumstance — that specific approach is what caused the 2026-09 outage and is
permanently off the table for this product, independent of which isolation model
is used for the app layer.

---

## 1. Provisioning a new customer

This replaces v2's Section 1 (database/schema changes) entirely. There is no schema
change of any kind required to add a new customer — `backend/prisma/schema.prisma`
stays exactly as it is today, forever, for every customer, because every customer
gets a byte-for-byte identical, blank copy of the same database structure.

Per new customer:
1. Create a new Railway Environment inside one dedicated Railway project used only
   for customer instances — **decided 2026-09-14**: Environment-per-customer, all
   inside one shared project, not Project-per-customer. Railway bills identically
   either way (usage-based, no per-project/per-environment fee), and the one real
   differentiator — restricting a staff member to just one customer requires
   Railway Enterprise under the Environment model, vs. standard permissions under
   the Project model — doesn't apply here, since customers are never given Railway
   access as a matter of process; only RarePrint's own team touches Railway at
   all. That dedicated project must be a brand-new Railway project, separate from
   whichever project hosts RarePrint's own production backend/frontend today —
   this is what actually enforces "RarePrint's own instance is never touched by
   customer infrastructure" at the platform level, not just as a policy. Use
   Railway's public GraphQL API (`https://backboard.railway.com/graphql/v2`), authenticated with a
   token generated from the Railway dashboard. Railway's API documentation
   ("Manage Environments", "Manage Projects", "Manage Services" under
   `docs.railway.com/integrations/api`) has the exact mutations needed to create
   each of these programmatically.
2. Provision a fresh Postgres database inside that new environment.
3. Set that environment's variables from a template of the existing backend's
   `.env`, with RarePrint-specific values (branding, any RarePrint-only API keys)
   left out or replaced with that customer's own values once they have them.
4. Deploy the existing, unmodified codebase into that environment.
5. Run the existing `backend/scripts/railway-migrate.js` once against that new,
   empty database, exactly as it already runs for RarePrint today. It will create
   every table fresh, since the database starts empty — this is the normal,
   already-tested path, not a new one.
6. Record the new customer's environment/project ID and connection details in a
   simple internal registry (a small tracked table, spreadsheet, or JSON file is
   enough at this scale — this is what the industry calls a "control plane" once
   it's more formalized, but it starts as just a list).

Steps 1 through 5 should be scripted, not done by hand, once there's more than a
couple of customers — see Section 2.

## 2. Rolling out a fix or feature to every existing customer

This replaces v2's Section 2 (tenant-scoping middleware, per-query filtering, RLS)
entirely. None of that is needed, because there is no shared table for a query to
accidentally leak across.

- Code changes: if every customer's environment is connected to the same GitHub
  branch through Railway's normal Git integration, pushing to that branch can
  redeploy every customer's environment automatically, with no custom script
  required for this part.
- Schema/migration changes: `railway-migrate.js` must be run once per customer
  database, not once globally. Build a small orchestrator script that reads the
  registry from Section 1, loops through every customer's database connection
  string, and runs the migration against each one in turn, logging success/failure
  per customer. A failure on one customer's database must not stop or corrupt the
  loop for the others — this is the specific, documented risk of this model (AWS's
  own guidance: "a failed migration in one tenant stack should not block others"),
  and the existing migration script is already written to be safe to re-run, so
  the fix is in the orchestration, not the migration script itself.
- Test any schema change against one disposable customer-style environment before
  running it against a real customer's database, the same discipline that was
  missing before the 2026-09 outage.

## 3. Auth & access

Unchanged in substance from v2, since each customer's own database and backend are
already fully separate — there's no cross-customer auth boundary to build, because
there's no shared system for a login to leak across in the first place.
- Each customer's admin sets up their own team the same way RarePrint's does today
  (existing `UserRole` enum, existing invite pattern) — no new "tenant switcher" or
  cross-customer login concept needed.
- Superadmin (RarePrint's own visibility across customers) is Section 5, not an
  auth-layer change.

## 4. Billing (Razorpay Subscriptions)

Unchanged from v2 — this is the same regardless of isolation model, since billing
is about RarePrint's own relationship with each customer, not about how their data
is stored.
- New models, in RarePrint's own systems (not each customer's database): `Plan`
  (price, cycle, feature/usage limits), `Subscription` (which customer, which plan,
  status, trial end, current period), `BillingInvoice`.
- Razorpay Subscriptions API + webhooks for payment success/failure/renewal.
- Trial period + auto-suspend (pause that customer's environment, or block login at
  their app level) on non-payment.
- Tenant-facing billing screen inside each customer's own instance: current plan,
  upgrade/downgrade, invoice history, payment method.
- Payment-failure reminders via the existing WhatsApp/Twilio integration.
- Plan-expiring reminders: a scheduled daily check against every customer's trial
  end date / current billing period end date, firing a WhatsApp reminder at set
  points before it lapses (e.g. 7 days and 1 day out for a trial ending, a few days
  before a paid renewal) — proactive, unlike the payment-failure reminder above
  which only fires after something's already gone wrong. Same integration, same
  message-template pattern already used elsewhere in the ERP, just a new scheduled
  job reading from the billing models in this section.

## 5. Superadmin console (RarePrint's own visibility across customers)

This is the one piece of new backend work this model genuinely requires that v2
didn't need in the same form, since there's no single shared database to query for
a cross-customer view.
- A small, separate internal tool (not part of any customer's own app instance)
  that reads from the registry built in Section 1 and connects to each customer's
  database in turn to pull usage stats, health, and billing status.
- Create/suspend/activate a customer's environment (wraps the Railway API calls
  from Section 1).
- Impersonate access for support, scoped to one customer's instance at a time.
- Audit logging for every superadmin action, especially impersonation and any
  cross-customer view, since this tool is the one place with legitimate reach
  across every customer.

## 6. Frontend (Next.js)

Mostly unchanged from v2, since branding/config differences per customer are now
just different environment variables on their own separate deployment, not
application-level tenant-switching logic.
- Each customer's frontend instance can be lightly white-labeled (logo, colors) via
  environment variables specific to their own deployment — no shared "which tenant
  is this" logic needed in the frontend at all, since each deployment only ever
  serves one customer.
- New superadmin console screens (Section 5): customer list, status, impersonate,
  billing overview — this lives in RarePrint's own internal tool, not in the
  customer-facing app.
- Signup/onboarding wizard (company details → admin user → plan selection) that,
  once submitted, kicks off the provisioning flow in Section 1 rather than writing
  a new row to a shared tenants table.
- Audit for hardcoded RarePrint branding/copy/data in the UI and make it
  configurable per deployment — unchanged from v2.

## 7. Security hardening & repo hygiene

Unchanged from v2.
- Split the sellable product repo away from RarePrint-internal one-off scripts,
  exported spreadsheets, and duplicate folders (`push-main/`, etc.).
- `rareprint-website/` and `whatsapp-ai-chatbot/` stay out of the sellable product
  repo per the storefront-excluded decision.
- Audit logging for superadmin actions (Section 5) — carried over, still needed,
  arguably more important now since the superadmin tool is the one component with
  legitimate cross-customer reach.

## 8. Infra / DevOps

Replaces v2's Section 8, which was written for a shared-Postgres-with-PgBouncer
future that no longer applies.
- Build and test the provisioning script (Section 1) and the migration-orchestrator
  script (Section 2) against disposable Railway environments before either one
  ever touches a real customer.
- Create one new, dedicated Railway project for customer instances (separate from
  RarePrint's own production project) — every customer becomes an Environment
  inside this one project (decided 2026-09-14).
- Per-customer data export (offboarding, data-portability requests) is simpler
  under this model than v2's, since it's just that customer's whole database, not
  a filtered extract from a shared one.
- Error tracking and usage dashboards per customer, feeding the superadmin console
  (Section 5).

## 9. Legal / commercial (non-code, but blocking before selling)

Unchanged from v2.
- Terms of Service, Privacy Policy, Data Processing Agreement.
- Pricing copy finalized and synced with the marketing site's pricing page.
- Support process/SLA for paying customers.

---

## Suggested build order

1. ~~Decide Environment-per-customer vs. Project-per-customer on Railway~~ —
   decided 2026-09-14: Environment-per-customer, inside one new, dedicated Railway
   project separate from RarePrint's own production project (Section 1).
2. Build and test the new-customer provisioning script against 1-2 disposable
   Railway environments (Section 1) — no real customer yet.
3. Build and test the migration-orchestrator script the same way (Section 2).
4. Superadmin console, internal-only, reading from the customer registry
   (Section 5).
5. Signup/onboarding wizard wired to the provisioning script (Section 6).
6. Razorpay subscription billing (Section 4).
7. Frontend white-labeling via per-deployment env vars (Section 6).
8. Repo hygiene / split non-product folders out (Section 7).
9. Onboard one real, low-risk customer manually first, watching every step,
   before trusting the scripts end-to-end unattended.

---

## Prompt to hand to a coding agent (Phase 1)

Copy this into a coding session pointed at the `rareprint-erp` repo to start the
foundation work. This intentionally does NOT touch `backend/prisma/schema.prisma`
at all — that is the point of this model.

```
I'm turning a single-tenant NestJS + Prisma + PostgreSQL ERP (backend/) into a
SaaS product sold to other printing businesses. Isolation model: one fully
dedicated Postgres database and one fully dedicated backend deployment per
customer, hosted as separate Railway Environments (or Projects — confirm which
with me before starting). No shared database, no tenantId column, no changes to
backend/prisma/schema.prisma at all. RarePrint's own existing production
environment must never be touched or reused for a customer.

Do ONLY Phase 1 in this session: the provisioning and rollout tooling. Do not
touch billing, the frontend, or the superadmin console yet.

Phase 1 scope:
1. Write a script that, given a new customer name, uses Railway's public GraphQL
   API (https://backboard.railway.com/graphql/v2) to: create a new Environment,
   provision a Postgres database in it, set its environment variables from a
   template based on the existing backend/.env (excluding RarePrint-specific
   values), deploy the existing unmodified codebase into it, and then run
   backend/scripts/railway-migrate.js once against that new, empty database.
2. Write a small registry (a JSON file or a simple tracked table is fine) that
   records each customer's name, Railway environment/project ID, and database
   connection details as they're provisioned.
3. Write a second script that reads that registry and runs
   backend/scripts/railway-migrate.js against every existing customer's database
   in turn, logging success or failure per customer, and continuing to the next
   customer even if one fails partway through.
4. Do NOT modify backend/prisma/schema.prisma, add any tenantId column, or add
   any Prisma middleware/extension for tenant filtering — none of that applies to
   this model.
5. Test both scripts end-to-end against 1-2 disposable Railway environments you
   create for testing, not against RarePrint's own production environment or any
   real customer, before calling this done.

Before running either script against anything beyond your own disposable test
environments, show me exactly what each script does step by step and wait for my
go-ahead.
```

Once Phase 1 is built and tested on disposable environments, come back and the
next prompt will cover the superadmin console (Section 5) and the signup wizard
tied to it (Section 6).

---

## Sources consulted for this decision (2026-09-12)

- [SaaS Tenant Isolation Strategies — AWS Whitepaper](https://docs.aws.amazon.com/whitepapers/latest/saas-tenant-isolation-strategies/the-bridge-model.html)
- [Silo isolation — AWS Whitepaper](https://docs.aws.amazon.com/whitepapers/latest/saas-tenant-isolation-strategies/silo-isolation.html)
- [Isolation: Security or noisy neighbor? — AWS Whitepaper](https://docs.aws.amazon.com/whitepapers/latest/saas-tenant-isolation-strategies/isolation-security-or-noisy-neighbor.html)
- [Tenancy Models for a Multitenant Solution — Microsoft Azure Architecture Center](https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/considerations/tenancy-models)
- [Scaling silo-isolated tenants — The Scale Factory](https://scalefactory.com/blog/2024/01/02/scaling-silo-isolated-tenants/)
- [Tenant onboarding in SaaS architecture for the silo model — AWS Prescriptive Guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/patterns/tenant-onboarding-in-saas-architecture-for-the-silo-model-using-c-and-aws-cdk.html)
- [What is a SaaS Control Plane? — Omnistrate](https://omnistrate.com/blog/what-is-a-saas-control-plane)
- [Isolate to Survive: Applying the Bulkhead Pattern in Microservices](https://medium.com/@jusuftopic/isolate-to-survive-applying-the-bulkhead-pattern-in-microservices-a7f47f51249a)
- [Environments — Railway Docs](https://docs.railway.com/environments)
- [Public API — Railway Docs](https://docs.railway.com/integrations/api)
- [Manage Environments with the Public API — Railway Docs](https://docs.railway.com/integrations/api/manage-environments)
