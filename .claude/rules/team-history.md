# rareprint-erp — accumulated context

Carried over from prior AI-assisted sessions on this repo. Facts here are point-in-time —
verify against current code/git log before treating anything as still true, especially
deploy status ("not yet deployed" items may have shipped since).


## ⚠️ This repo is multi-deployed — read before pushing anything

This single codebase is not RarePrint-only. It is deployed **multiple times from the same
`main` branch**:

1. **RarePrint's own live production** — the company's actual, currently-operating ERP.
   Real orders, real customers, real money. `backend/.env`'s `DATABASE_URL` points here.
2. **One deployment per SaaS customer** — currently `demo-test-co` (Railway services
   `demo-test-co-backend` / `demo-test-co-db`), a test customer used to validate the
   SaaS-provisioning flow before onboarding real external customers. More will be added as
   `saas-ops/provision-customer.js` provisions them.

**There is no separate SaaS codebase.** A single push to `main` deploys to every environment
watching that branch simultaneously — RarePrint's live production included. Before pushing:
- Assume any change ships to production immediately, not just to a test customer.
- A Railway service only auto-deploys if its environment is actually connected to a branch
  (Settings → Source Repo → Branch) — this was found disconnected for `demo-test-co-backend`
  on 2026-09-19 (see that day's session note below), so don't assume "I pushed" means "every
  environment updated." Check the target service's Deployments tab if in doubt.
- Schema/data changes must stay backward-compatible across every environment's database at
  once — you cannot assume a test customer's DB is empty or a production DB has been migrated
  ahead of a test one, or vice versa.

## Stack & deploy model

- NestJS + Prisma + Postgres backend (`backend/`), Next.js App Router frontend (`frontend/`),
  both on Railway. `backend/.env`'s `DATABASE_URL` points at the **live production** Postgres —
  there is no separate dev/staging DB.
- Because of that: schema changes ship as new files under `backend/prisma/migrations/`
  (idempotent SQL), never run live via `prisma migrate dev` against this DB.
- Backend `startCommand` (`backend/railway.json`) must stay plain `node dist/src/main.js`.
  **Never add a migration step ahead of app start** — see gotcha below.
- Prisma is on v7, which needs Node 20.19+/22.12+/24+ and a driver adapter
  (`@prisma/adapter-pg`) wired into `PrismaService` — `schema.prisma`'s datasource has no
  `url`, and `prisma.config.ts` uses `defineConfig()` with `datasource.url` read from env
  directly (not the `env()` helper, which throws during Docker build before `DATABASE_URL`
  is injected). If a backend deploy fails at `npm install` or `prisma generate`, check these
  two files first before assuming it's the app code that just changed.

## Critical gotchas (each one broke prod at least once)

1. **Never wire a migration script into Railway's `startCommand`.** A ~40-47s pre-start step
   (even one that completes cleanly on its own) ate into the boot/healthcheck budget and got
   the container killed before the app's first log line — looked like every subsequent deploy
   was broken, regardless of what changed. Apply schema changes by running
   `cd backend && node scripts/railway-migrate.js` **locally** before/after pushing, never in
   the boot path. If you tell the user "the columns will self-heal on deploy," verify
   `railway.json`'s actual `startCommand` first — don't assume.

2. **`backend/scripts/ensure-*.js` self-heal scripts must `require('dotenv/config')` at the
   top.** Without it, `process.env.DATABASE_URL` is undefined when run locally and the script
   silently no-ops ("No DATABASE_URL set, skipping") while still exiting 0 — reads as success,
   not failure. After anyone runs one of these, confirm the specific check printed
   "added"/"already exists", not just "no errors."

3. **Never spread `...({ field: true } as any)` inside a *nested* Prisma `select`** (e.g.
   inside `items: { select: {...} } }`). It corrupts TS's inferred type for the whole outer
   field and fails Railway's `prisma generate && nest build` with garbled union-type errors.
   Safe alternatives: a plain uncasted key (works fine once `prisma generate` has picked up
   the new column — the cast was only ever a workaround for a stale *local* client), or switch
   that relation from `select` to `include`. The any-cast spread is only safe at the **top
   level** of a `select`/`data` object, never nested.

4. **Android build**: the frontend already ships a live PWA (manifest + service worker, zero
   extra build step) and a scaffolded native Android/Capacitor app (`frontend/android/`,
   `npm run build:android`, needs Android Studio + SDK on a real machine — can't be built
   sandboxed). Check before proposing a "build a mobile app" feature from scratch. Mobile-only
   UI changes must be scoped with the `useIsNativeApp()` hook / `.is-native-app` class, never a
   bare `max-width` media query — that class also affects the live site's phone-browser view.
   Full history of Android build fixes (Gradle/Kotlin plugin, static-export quirks, CORS,
   overflow/layout passes) is deep; grep prior commits/PRs before re-debugging a "known" issue
   there rather than starting from scratch.

5. **`dispatch.service.ts`'s `resolveWarehouse()`: never let `pickupOverride` be checked
   before an explicit `warehouseId` match again.** Root cause of the "Fship dispatch always
   uses the default pickup address, even after adding every address's id and picking a
   different one" bug (reported 2026-09-16, fixed 2026-09-17): the Dispatch page's `book()`/
   `getRates()` calls in `frontend/app/dispatch/page.tsx` send `pickupName`/`pickupPincode`/
   `pickupLocation` on **every** booking (they double as display copy for whatever was
   selected), not only when the dispatcher picks "Edit pickup...". `resolveWarehouse()` used
   to check `pickupOverride?.pincode?.trim()` first and return immediately if it was
   non-empty — which it always was — so the `warehouseId?.startsWith('fship-')` matching
   added 2026-09-08 was unreachable dead code from day one; every Fship booking silently fell
   through to `fshipCfg.pickupAddressId` (the global default) no matter what was picked in
   the UI. Same latent bug existed for Bigship's numeric warehouse ids. Fixed by resolving an
   explicit `warehouseId` match (fship-id, numeric bigship id, local warehouse) FIRST, and
   only falling back to `pickupOverride` when no specific id matched, with the Bigship
   Settings default demoted to a final fallback stage. See CLAUDE.md's "RESOLVER / FALLBACK
   PRECEDENCE" rule (added the same day) for the general pattern — check that rule before
   touching any function shaped like this one.

## Other standing context

- **SaaS conversion plan**: roadmap to sell this ERP to other printers exists at
  `docs/SaaS_Conversion_Roadmap_v2.md` (shared-DB + `tenantId` model, full suite, no
  storefront, Razorpay billing). Not started — check with Sanket before touching schema in a
  way that assumes single-tenant forever.
- **Marketing site**: a separate `marketing-site/` Next.js app scaffolded 2026-08-01, own
  Railway service, brand name "RarePrint Suite" (placeholder — "PrintERP" was rejected as a
  real competitor's name, don't reintroduce it).
- Money/financial calculations (payments, invoices, commissions, dispatch charges) are
  high-importance business logic per the project `CLAUDE.md` — verify formulas and rounding,
  don't silently change historical financial records.

## Deployment backlog — built but last known as "not yet deployed"

Verify current deploy status (git log, Railway dashboard) before assuming any of these are
live or still pending:

- Call compliance: call-log PDF + AiSensy tag CSV cross-check
- Dashboard profit/cashflow fix: negative-profit display bug + cash-in/out incl. cash payments
- HR agreement upload + notify: accept requires ID-proof upload, emails hr.rareprint@gmail.com
- Bonus Points: activity/claim/approval points system in Loyalty tab
- Dispatch Approval "↩ Return" button (Accounts > Dispatch Approval)
- Remittance sweep pickupDate fix (`sweepPendingWithDeliveredMap()` wasn't setting it)
- Designer role: new DESIGNER role scoped to Sheet Layout, Sticker, Production > Created Sheets
- Sales Leaderboard month filter (dashboard)
- "Not Contacted" expand + copy (dashboard agent rows)
- Loyalty Role Access: Loyalty made a toggleable module, granted to SALES_AGENT
- Commission column visible to sellers + admins (Orders), not just owner
- Attendance import perf fix (N+1 query causing report upload to hang)
- Sales Incentive Plans: Plan A/B/C target+% + petrol/SIM allowances in payroll
- Partial dispatch booking: book a single ready item without waiting for the whole order
  (2nd attempt — 1st broke Production queue visibility, watch for regressions here)
- Dispatch resubmission loop fix: already-approved orders were reappearing in Orders tab and
  getting resubmitted forever (root cause of specific stuck orders)
- Accounts approval showing partial items correctly (`pendingDispatchItemIds` column)
- Reject Dispatch FK violation fix (`changedById: 'system'` had no matching User row)
- Partial item dispatch visibility fix (`pendingDispatchItemIds` tracked everywhere: Orders
  tab, booking modal, Dispatch queue, reject-dispatch)
- Dispatched item tracking: `OrderItem.dispatchedAt` column, fixes courier invoice showing
  whole-order value + items lingering in Dispatch queue after shipping
- Phone required on order create (frontend + backend validation)
- Bigship auto-manifest: dispatch now calls Place/Manifest immediately instead of requiring
  manual "Ship Now" in Bigship's dashboard; AWB pulled via existing sync lookup
- Bigship shipping-invoice PDF now includes Order Notes (previously silently dropped)

Already deployed & confirmed working, for reference: Marketing Ad ROI tab, Complaints "any
customer" (auto-creates new customer from ticket form).



## Session 2026-09-19 — SaaS test-customer walkthrough, Add Product feature, hydration fix

- **Product creation was completely missing from the app.** Confirmed via code read (not
  guessing): `products.controller.ts` was GET-only, `cost-table.service.ts`'s CSV import only
  sets slabs on products that already exist, and Design Studio's "Create Product" form
  (`frontend/app/design-studio/page.tsx`) only wrote to local React state, never called the
  backend. A brand-new SaaS customer's database starts with zero products and had no way to
  add one. Fixed: added `POST /cost-table/products` (`cost-table.controller.ts` /
  `cost-table.service.ts`, admin-gated via the existing `assertAdmin` pattern, validates
  required fields, auto-upserts `ProductCategory` by name since there's still no separate
  category-management UI anywhere) + a matching "Add Product" modal in
  `frontend/app/cost-table/page.tsx`. Confirmed working end-to-end by the user on
  `demo-test-co-backend` on 2026-09-19.
- **demo-test-co environment had no branch connected at all.** Root cause of "pushed to main,
  Railway boot log even shows the route registered, but the live request still 404s" — that
  boot log was actually from a *different* service (production), not `demo-test-co-backend`.
  The real `demo-test-co-backend`'s Settings → Source Repo showed "Connect Environment to
  Branch" instead of a connected branch name, meaning it never auto-deployed on push at all —
  it was still running a container from 2026-09-16, several commits behind. Fixed by clicking
  "Connect Environment to Branch" → `main` in the Railway dashboard. **If a demo/test Railway
  service ever seems to be running stale code despite a clean push+build, check this first**
  (Settings → Source Repo → Branch) before assuming it's a caching or routing issue — don't
  trust a pasted boot log's route list without confirming which service it's actually from.
- **Real hydration bug, fixed**: `frontend/components/dashboard-shell.tsx`'s `user` state used
  to be `useState<StoredUser | null>(() => getStoredUser())` — a lazy initializer that reads
  `localStorage` synchronously. On the client this returns the real user on the very first
  (hydration) render, while the server-rendered HTML always has `user = null` (no
  `localStorage` on the server) — guaranteed mismatch on every authenticated page load
  (visible as e.g. avatar showing "…" server-side vs. the real initial client-side). Fixed by
  starting `user` at `null` on both sides and loading the real value in a `useEffect` right
  after mount, merged into the same effect that already redirected to `/login` when there's no
  user (kept as one effect specifically to avoid a race where the redirect effect would fire
  on the transient `null` before the load effect populated `user`). `npx tsc --noEmit` in
  `frontend/` confirmed no new errors from this change (5 pre-existing, unrelated errors exist
  elsewhere in the repo — `accounts/page.tsx`, `dashboard/page.tsx`, `orders/edit/page.tsx`,
  `rate-calculator/page.tsx`, `next.config.ts` — none touched, none introduced by this fix).
- New one-off scripts added under `backend/scripts/`, same safety-guard pattern as
  `provision-new-customer-migrate.js` (refuses to run if `DATABASE_URL` looks like production):
  `seed-test-product.js` (superseded by the real Add Product feature above — kept for
  reference only, prefer the UI now) and `promote-test-admin.js` (promotes a user to ADMIN by
  email — useful any time a fresh signup ends up as the default `SALES_AGENT` role and needs
  Cost Table / admin-only endpoints).



## Addendum to 2026-09-19 session — registry.json gap found and fixed

- **`saas-ops/registry.json` was missing `demo-test-co` entirely.** It only listed two
  earlier disposable test entries (`test-customer`, `test-customer-3`) from 2026-09-15.
  `lib/registry.js`'s `addCustomer()` only ever appends — nothing in this codebase removes
  a registry entry automatically — so either `demo-test-co` was created by hand outside
  `provision-customer.js`, or a prior session removed its entry (`saas-ops/README.md`
  itself instructs deleting a *test* environment's registry entry after testing — plausible
  a session mistook the actively-used `demo-test-co` for one of those). Root cause was not
  conclusively determined; `registry.json` is gitignored, so there was no version history
  to check.
- **Fixed by manual reconstruction, 2026-09-19**: pulled `environmentId`,
  `backendServiceId`, `dbServiceId`, and `databaseUrl` directly from the Railway dashboard
  and added the entry back. `demo-test-co-db`'s Variables tab has only 5 hand-set variables
  (`DATABASE_URL`, `PGDATA`, `POSTGRES_DB`, `POSTGRES_PASSWORD`, `POSTGRES_USER`, no separate
  `DATABASE_PUBLIC_URL`) — this exact fingerprint matches what `createPostgresService` in
  `lib/railway-api.js` sets by hand per the README, meaning `DATABASE_URL` on this service
  already **is** the public/proxy-reachable one (unlike Railway's own one-click Postgres
  template, which would give a private `railway.internal` URL plus a separate public one).
  Good evidence `demo-test-co` genuinely was provisioned via `provision-customer.js`
  originally, supporting "entry got removed" over "created by hand."
- The reconstructed entry carries a `_reconstructedNote` field flagging that `provisionedAt`
  is an estimate (inferred from `demo-test-co-backend`'s earliest known container boot log,
  `2026-09-16T10:23:28Z`), not a certainty — confirmed safe, `rollout-migration.js` only
  reads `customer.name`/`.slug`/`.databaseUrl` by key and ignores unknown fields.
- **Not yet done**: `rollout-migration.js` has never been run against `demo-test-co` since
  this reconstruction. Treat the next run as an untested first run for this specific entry,
  same caution the README already gives for the whole toolchain.

## Session 2026-09-19 (cont'd) — Payment Account fix verified live, "separate SaaS project" question resolved, roadmap gap audit

- **Verified `802d011` ("Add Payment Account creation") end-to-end, live, not just by reading
  code.** Backend fields cross-checked against `PaymentAccount` in `schema.prisma` (exact
  match), and the admin-gating (`assertAdmin`) confirmed to be the same repeated pattern
  already used in `admin-db.controller.ts`, `call-compliance.controller.ts`, and
  `cost-table.controller.ts` — not a one-off. Clicked through "Add Account" on `demo-test-co`
  (via a local frontend at `localhost:3001`, already-logged-in session) and created a real test
  row ("Test HDFC Current Account," ₹5,000 opening balance) — confirmed it saves and appears
  in the list with no errors.
- **Confirmed the same code is already live on RarePrint's real production**
  (`rareprint-erp.vercel.app/settings`) — opened the same "Add Account" modal there (cancelled
  without submitting, since it's live financial data) and confirmed it's pixel-identical, and
  confirmed the test entry created on `demo-test-co` did NOT leak into production (production's
  real 6 accounts — Bigship COD Remittance, Cash by Prajakta, Cash by Sanket Sir, CC Bank, GST
  Bank, Non GST — were untouched).
- **Resolved a "is the SaaS a separate project" question.** User initially framed "the SaaS"
  and "the ERP" as two things whose account-creation code might need reconciling. Confirmed via
  the multi-deploy note (top of this file) that there is only one codebase — "fix it for the
  SaaS" and "fix it for the ERP" are the same action by construction, since every environment
  deploys from the same `main`. No code was changed to "fix" this, because there was nothing to
  reconcile.
- **Checked `/signup` (`frontend/app/signup/page.tsx`) against the v3 roadmap's signup-wizard
  step**: it only calls `POST /auth/register` — adds a user to whichever single database that
  deployment already points at. It does **not** create a new tenant/environment. The roadmap's
  "signup wizard wired to provisioning" step is confirmed NOT built yet, despite this page
  existing and looking plausible at a glance.
- **Confirmed no superadmin console exists** (`frontend/app/superadmin` — not found) **and no
  Razorpay subscription-billing code exists** (grepped `backend/src` for subscription-related
  Razorpay usage — none found).
- **`saas-ops/registry.json`'s `demo-test-co` gap (addendum above) — reconfirmed fixed** by
  reading the file directly: all 3 customers (`test-customer`, `test-customer-3`,
  `demo-test-co`) present, `demo-test-co` carrying its `_reconstructedNote`.
- **Flagged, not yet actioned**: the "Other standing context" section above still cites
  `SaaS_Conversion_Roadmap_v2.md` as the current plan and "not started" — this is stale. `v3`
  supersedes it (v2's shared-DB/`tenantId` approach caused the 2026-09-07 production outage
  described at the top of `SaaS_Conversion_Roadmap_v3.md` and was fully reverted). Asked the
  user whether to correct that section; no answer yet as of this note.
- No code was written or changed in this session — pure verification, one throwaway live test
  (the `demo-test-co` account above), and roadmap/codebase auditing.
