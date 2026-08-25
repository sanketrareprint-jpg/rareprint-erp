# Events module — shared context

Read this before touching anything under `backend/src/events/`, `frontend/app/events/`, or the `Event*`/`Festival` models in `schema.prisma`. It exists because this module was independently built twice in one day by two concurrent Claude sessions before being reconciled — these are the decisions Sanket actually made, so a future session doesn't redo that.

## What it does

Register a customer, friend, or anyone else (`EventPerson`) with a WhatsApp number and an optional date of birth / anniversary date. On their birthday or anniversary, and on any recurring festival date, the backend renders a flyer image from a saved template and sends it via AiSensy WhatsApp to both that person and the owner's own number.

## Decisions that are NOT obvious from the code — don't "fix" these

- **One shared AiSensy campaign for everything.** `WhatsAppService.sendEventWish()` uses a single `AISENSY_EVENTS_CAMPAIGN` env var (default `events_wish_erp`) for birthdays, anniversaries, and every festival. This was a deliberate choice to minimize how many WhatsApp template approvals Meta/AiSensy requires — not an oversight. Do not split this into per-occasion campaigns without asking first.
- **Festivals recur by month/day, not an exact date.** `Festival.month` + `Festival.day` (both `Int`) are entered once and fire every year — there is no `date`/`sentAt` column. This was changed from an earlier "exact date, re-added every year" design specifically because Sanket asked for recurring records. If you see any reference to `Festival.date` or `Festival.sentAt` anywhere, it's stale — remove it.
- **Idempotency is uniform across all three occasion types**: before sending, the scheduler checks "does a `SUCCESS` `EventSendLog` already exist for this person + occasion (+ festivalId for festivals) + calendar year?" There's no per-row "already sent" flag on `Festival` itself, because that would have permanently blocked a recurring festival from ever firing again.
- **One photo per person**, reused for both their birthday and anniversary flyer — not separate photos per occasion.
- **Text rendering is sharp + SVG `<text>`**, not pdfkit. Unlike the Certificate Generator (which deliberately avoids SVG text to sidestep a fontconfig/Pango dependency on Railway), this module accepts that tradeoff because flyers are short single-line values (a name, a date) and the font bytes are embedded directly into the SVG as a base64 `@font-face` (`backend/src/events/fonts.ts`), which does not require the OS to know about the font — so it should still be self-contained on Railway. If flyer text ever renders as tofu/boxes in production, this embedding is the first thing to check, not a reason to rewrite the renderer.
- **Flyer field positions are fractions (0..1)** of the template image's own pixel width/height — not inches/DPI like `CertificateTemplate`, because a flyer is only ever a raster JPEG for WhatsApp, never printed.
- **`EventSendLog.occasionYear = 0`** is a sentinel for manual "send test" clicks — it's intentionally excluded from the real idempotency check so a test send can never block (or fake) a real scheduled send later that year.
- **The public flyer-image route** (`GET /events/flyer/:id?token=&expires=`) is unauthenticated on purpose — AiSensy fetches the image directly. Access control is the signed HMAC token (`EventsService.signPublicToken`/`verifyPublicToken`), same scheme as `BillingService`'s public invoice PDF link, reusing `JWT_SECRET`. Requires `BACKEND_PUBLIC_URL` to be set in the environment or every send silently fails with a logged reason — check that env var first if wishes stop going out.
- **Owner's WhatsApp number is hardcoded** (`919637318960`) inside `WhatsAppService`, matching the existing pattern for order-created notifications elsewhere in this codebase — not read from `SystemConfig` or any admin setting.

## ⚠️ Never edit an already-applied migration file — add a new one instead

2026-08-25: `Festival.month`/`.day` were first shipped by editing `20260824090000_add_events_module/migration.sql` in place, after wrongly assuming it had never been deployed. It had — `prisma migrate deploy` checksums every already-applied migration file, and this app's `scripts/railway-migrate.js` treats a `migrate deploy` failure as a non-fatal warning (so the app keeps booting on drift instead of crashing loudly). Result: the checksum mismatch silently blocked the upgrade from ever running, production's `Festival` table stayed on the old `date`/`sentAt` columns while the redeployed code's Prisma Client expected `month`/`day`, and every Festival query 500'd with Prisma error `P2022` (column does not exist) until this was caught and fixed by a follow-up migration. `20260824090000` is restored to its original applied content; the month/day change now lives in `20260825120000_events_recurring_festivals/migration.sql`. The rule going forward, for this migration and every other one in the repo: once a migration folder has shipped, it is immutable — a later change is always a new migration, never an edit.

## Files

- `backend/prisma/schema.prisma` — `EventOccasionType`, `EventSendStatus` enums; `EventFlyerTemplate`, `EventPerson`, `Festival`, `EventSendLog` models. Migrations: `backend/prisma/migrations/20260824090000_add_events_module/` (base tables) + `20260825120000_events_recurring_festivals/` (Festival date→month/day).
- `backend/src/events/events.service.ts` — CRUD for templates/people/festivals, plus `renderAndSend()` (shared by the scheduler and manual test-send) and the signed public-URL logic.
- `backend/src/events/events-scheduler.service.ts` — the daily `@Cron` job (`EVERY_DAY_AT_8AM`, `Asia/Kolkata`). Separate file from the CRUD service on purpose.
- `backend/src/events/flyer-render.ts` + `fonts.ts` — sharp/SVG compositing.
- `backend/src/events/events.controller.ts`, `events.module.ts` — routes under `/events/...`, registered in `app.module.ts`.
- `frontend/app/events/page.tsx` — People / Templates (called "Flyer Templates" via `?occasionType=`) / Festivals / History tabs. Nav entry in `dashboard-shell.tsx` (`PartyPopper` icon).
- `backend/src/whatsapp/whatsapp.service.ts` — `sendEventWish()`.

## Deployment

Code is deployed (Vercel frontend + Railway backend, both auto-deploy on push to `main`). The two migrations above need a fresh push to actually apply — Railway only runs `scripts/railway-migrate.js` (which runs `prisma migrate deploy`) as part of its own boot command, there's no way to trigger it from outside a real deploy (no `DATABASE_URL` in the local backend `.env`, no `railway` CLI on this machine). After that, follow `docs/Events_Module_Setup.md` for the two things that live outside this repo: creating+approving the shared AiSensy template and setting `AISENSY_EVENTS_CAMPAIGN` / `BACKEND_PUBLIC_URL` in Railway. Before trusting the automatic daily job, use the People tab's "send test" button on a real number first.
