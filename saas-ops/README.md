# saas-ops

Provisioning and fleet-rollout tooling for RarePrint's SaaS customers. This is
Phase 1 of `docs/SaaS_Conversion_Roadmap_v3.md` — read that first if you haven't,
it explains why this exists and the decisions behind it. This folder is
internal tooling, not part of the ERP app itself, and never gets deployed
anywhere.

## One-time setup (do this once, not per customer)

1. **Create a new, dedicated Railway project.** In the Railway dashboard,
   create a brand new project — name it something like
   `rareprint-saas-customers`. Do NOT use the project that runs RarePrint's
   own production backend/frontend. This is the one project every customer's
   environment will live inside.
2. **Generate a Railway API token.** From your Railway account (not a
   project-scoped token — this needs to create new environments/services).
   See [Railway's API docs](https://docs.railway.com/integrations/api) for
   where to generate one.
3. **Copy `.env.example` to `.env`** in this folder and fill in:
   - `RAILWAY_API_TOKEN` — from step 2.
   - `RAILWAY_CUSTOMERS_PROJECT_ID` — from step 1 (visible in that project's
     Railway dashboard URL/settings).
   - `GITHUB_REPO` / `BACKEND_ROOT_DIRECTORY` — already filled with sensible
     defaults, confirm they're right for this repo.
4. **Install dependencies:** `cd saas-ops && npm install`.

## Before touching a real customer — test this first

Run `node provision-customer.js "Test Customer"` and actually check the
result: log into the Railway dashboard, confirm the environment, database,
and backend service all exist and the app boots, confirm you can hit its API.
Only after that has worked cleanly once should you run this against a real
customer. This isn't optional caution — it's the same lesson from the 2026-09
outage: things that look like they should work still need to be watched
actually work before you trust them.

When you're done testing, delete that test environment from the Railway
dashboard (and remove its entry from `registry.json`) before it accumulates as
clutter or, worse, gets mistaken for a real customer later.

## Schema status (as of 2026-09-15)

Every mutation `lib/railway-api.js` uses has been checked field-by-field
against Railway's live schema (via `railway.com/graphiql`), not just their
docs: `environmentCreate`, `serviceCreate`, `variableUpsert`,
`serviceInstanceDeploy`, the `variables` query, `serviceInstanceUpdate`
(needed for `rootDirectory` — it turned out this is NOT part of
`serviceCreate`'s input, a real mismatch caught during verification),
`volumeCreate`, and `tcpProxyCreate` (deprecated by Railway in favor of their
newer "staged changes" system, but still functional — it just requires a
redeploy afterward to activate, which the code already does).

**What's still NOT verified: an actual end-to-end run.** Your Railway
account hit its trial limit mid-testing (2026-09-15), before
`provision-customer.js` could be run successfully against a live database.
The schema-level checks give high confidence the pieces are correct, but the
first real run after your plan is active should still be treated as the
real test — watch it end to end, don't assume it'll work just because the
schema matched.

**Migration script fixed — twice (2026-09-15):** the first full end-to-end
test run completed "successfully" but silently left the new customer's
database missing several tables and an enum type. Root cause:
`provision-customer.js` was reusing `backend/scripts/railway-migrate.js`,
which pre-marks a hardcoded list of migrations as "already applied" without
running them — correct for RarePrint's own production database (it
reconciles known historical drift), actively harmful on a brand-new, empty
database (it skips real schema-creating SQL forever).

First fix attempt — `backend/scripts/provision-new-customer-migrate.js`
running a plain `prisma migrate deploy` — also failed on retest: migration
`20260520000100_performance_indexes` indexes `OrderItem.itemProductionStage`,
but NO migration file anywhere actually creates that column. It was
evidently added to production by hand outside the tracked migration
history at some point — the same kind of drift `RECOVERABLE_MIGRATIONS`
and `ensure-all-columns.js` exist to paper over elsewhere. There's no
confidence this is the only such gap in the 89-migration history.

**Final fix:** `provision-new-customer-migrate.js` now uses `prisma db push`
instead — syncs a new database directly to match current `schema.prisma`
(the real, working target schema) in one shot, bypassing the migration
history and its gaps entirely. It then "baselines" the migration history
(marks all existing migration files as applied, per Prisma's own documented
baselining workflow) so `rollout-migration.js`'s future incremental rollouts
to this customer still work normally afterward. `railway-migrate.js` itself
was left completely untouched throughout; it's still correct for production.

**What building a Postgres service this way actually involves:** clicking
"Add Database" → "PostgreSQL" in Railway's dashboard uses a different
mechanism (a template deploy) that auto-generates credentials, a volume, and
network access for you. Creating a Postgres service via the API from a raw
Docker image (`serviceCreate` + `source: { image: ... }`) does none of that
automatically — `createPostgresService` in `lib/railway-api.js` now does it
by hand: attaches a volume at `/var/lib/postgresql/data`, sets
`POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB`/`PGDATA` itself, exposes
port 5432 via a TCP proxy (needed because `provision-customer.js`'s
migration step runs from your own machine, outside Railway's private
network), and builds `DATABASE_URL` from all of that. An earlier version of
this script skipped all of this and created a database with no volume, no
credentials, and no `DATABASE_URL` — confirmed by inspecting the resulting
service in the Railway dashboard during testing.

## Day-to-day usage, once set up

**New customer:**
```powershell
cd saas-ops
node provision-customer.js "Customer Name"
```
Creates their environment, database, and backend deploy, and runs the
initial migration once against their new (empty) database. Records the
result in `registry.json`.

**Rolling out a schema change to every existing customer:**
```powershell
cd saas-ops
node rollout-migration.js                      # every customer
node rollout-migration.js --only demo-test-co  # one customer (comma-separate for several)
```
Loops through every customer in `registry.json` and runs `prisma migrate
deploy` against each one's database in turn. If one customer fails, it's
logged and the script continues to the rest — you fix and re-run with
`--only <slug>` for just the failed one(s), not everyone.

First validated end-to-end against `demo-test-co` on 2026-09-21 (a no-op run:
89/89 migrations already applied, real exit code, correct datasource printed
by Prisma). The path that actually *applies* a new migration to a customer
has not yet been exercised — there has been no new migration since
`demo-test-co` was provisioned. Watch the first real one.

**Checking on every customer (fleet status):**
```powershell
cd saas-ops
node customer-status.js                      # every customer
node customer-status.js --only demo-test-co  # one customer
```
Read-only. One row per customer: from their database — reachable or not,
migrations applied vs. the repo (with pending ones named), stuck migration
rows, table/user/order counts, last order date — and from their backend —
whether `/health` answers OK (that endpoint also checks the app's own DB
connection from inside Railway). The backend's hostname is looked up from
Railway each run since the registry doesn't store it; if `RAILWAY_API_TOKEN`
/ `RAILWAY_CUSTOMERS_PROJECT_ID` aren't set the backend column is skipped
rather than failing the report. Exits 1 if anything needs attention, so it
doubles as a pre-rollout check — run it before `rollout-migration.js`, and
again after. The `access` column shows what `registry.json` says (active /
suspended, see below) next to what the backend itself reports from
`/health`; a MISMATCH means a redeploy is still in flight or someone changed
the variable by hand in Railway. This is the first increment of the
superadmin console (roadmap Section 5); suspend/activate is the second (next
paragraph) and impersonation the third. Audit logging exists only for
impersonation so far, and only as a machine-local file (see below).

**Suspending / re-activating a customer (e.g. unpaid invoice):**
```powershell
cd saas-ops
node suspend-customer.js demo-test-co --reason "invoice overdue 30d"
node activate-customer.js demo-test-co
```
Suspending sets `CUSTOMER_SUSPENDED=true` on the customer's backend service
in Railway and redeploys it. From then on the backend refuses every request
(login included) with HTTP 403 "This account is suspended. Please contact
RarePrint support to restore access." — the login page shows that message
verbatim (it prints the body's `message` for anything that isn't a 503);
other screens wrap it as "Could not load data (This account is
suspended...)". Only `/health` still answers (reporting
`suspended: true`), so `customer-status.js` can tell "suspended" apart from
"down". Activating removes the variable and redeploys. Either way the change
is live only once that redeploy finishes (a few minutes) — confirm with
`node customer-status.js --only <slug>`.

Why a variable and not a stopped container: every customer's backend is
connected to `main`, so a stopped deployment would silently come back to
life on the next push. A variable survives redeploys. The customer's
database, environment and data are never touched; `rollout-migration.js`
keeps migrating suspended customers too, so re-activation needs nothing
extra. The `--reason` is stored in `registry.json` (`status`, `suspendedAt`,
`suspendedBy`, `suspendReason`); these two don't write to `audit-log.jsonl`
yet — see the impersonation section below.

The backend side (`backend/src/common/suspended-customer.middleware.ts`) is
a no-op unless the variable is set, so it's inert on RarePrint's own
production deployment.

**Impersonating a customer's user for support:**
```powershell
cd saas-ops
node impersonate-customer.js demo-test-co
node impersonate-customer.js demo-test-co --email owner@printco.in --minutes 10
```
Prints a login token for one customer's backend, valid 30 minutes by default
(`--minutes`, capped at 240). With no `--email` it picks that customer's
oldest active ADMIN. Use it as `Authorization: Bearer <token>` against their
API, or paste it into `localStorage` (`rareprint_token` / `rareprint_user`)
on a frontend pointed at their backend via `NEXT_PUBLIC_API_URL` — there is
no per-customer frontend deployment yet, so that means your own local
frontend.

There is no backend side to this and no new endpoint on customer instances.
Every customer's backend already has its own random `JWT_SECRET` (see
`customer-env-template.js`) and `jwt.strategy.ts` accepts any HS256 token
signed with it, so the token is signed locally from the secret Railway
already holds. A token is therefore scoped to exactly one customer — it is
useless against any other customer or against RarePrint's own production.

**This is a real login as a real user.** Inside the customer's app, anything
done with the token is indistinguishable from that user doing it themselves;
the `impersonatedBy` claim is carried in the token but the app ignores it.
Prefer read-only actions, and don't paste a token anywhere shared.

Every mint is appended to `audit-log.jsonl` (gitignored) with who ran it,
which customer, which user, and the expiry — never the token or any secret.
Known limitation: that file is local to the machine that ran the command, so
it's evidence for one operator, not a centralised or tamper-proof trail. If
superadmin access ever spreads beyond one or two trusted people, it needs to
move to a real append-only store. `suspend-customer.js` /
`activate-customer.js` don't write to it yet — their record is the `status` /
`suspendedBy` / `suspendReason` fields in `registry.json`.

**Rolling out a plain code change (no schema change) to every customer:**
No script needed for this — if every customer's backend service is connected
to the same GitHub branch as RarePrint's own production backend, pushing to
that branch redeploys every customer automatically through Railway's normal
Git integration.

## Files

- `provision-customer.js` — new customer setup.
- `rollout-migration.js` — run a migration against every existing customer.
- `customer-status.js` — read-only health/usage row per customer, from their database.
- `suspend-customer.js` / `activate-customer.js` — turn a customer's backend
  access off/on via the `CUSTOMER_SUSPENDED` variable (see above).
- `lib/suspension.js` — the shared flow behind those two.
- `impersonate-customer.js` — mint a short-lived support login token for one
  customer's instance (see above).
- `lib/audit.js` — appends superadmin actions to `audit-log.jsonl`.
- `lib/registry.js` — reads/writes `registry.json`; `findCustomer()` is the
  shared lookup that refuses RarePrint's own production database.
- `customer-env-template.js` — the environment variables a new customer's
  backend needs, and which ones are intentionally left blank (RarePrint's own
  integration accounts — Shiprocket, BigShip, Razorpay, Gmail — must never be
  copied to a customer).
- `lib/railway-api.js` — Railway GraphQL API wrapper.
- `lib/registry.js` — reads/writes `registry.json`.
- `registry.json` (gitignored, created on first provision) — the list of
  every customer and their Railway/database details. Contains real database
  passwords in plain text — never commit it, back it up somewhere safe.
- `.env` (gitignored) — this tooling's own config (Railway API token, project
  ID). Not to be confused with a customer's own environment variables, which
  live on their Railway service, not in this repo anywhere.
