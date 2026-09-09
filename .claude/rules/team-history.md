# rareprint-erp — accumulated context

Carried over from prior AI-assisted sessions on this repo. Facts here are point-in-time —
verify against current code/git log before treating anything as still true, especially
deploy status ("not yet deployed" items may have shipped since).

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
