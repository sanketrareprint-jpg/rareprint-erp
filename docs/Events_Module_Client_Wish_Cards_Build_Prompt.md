# Events Module — Client Business Festival Wish Cards — Detailed Build Prompt

**How to use this file:** hand this directly to whoever (or whichever AI session) builds
this. It assumes the reader has NOT seen the planning conversation but HAS read
`docs/Events_Module_Context.md` first (mandatory — several hard-won rules from that file
apply unchanged here, especially the migration rule in §7). This file is the spec; nothing
in it has been built yet.

## 0. What this is, and — explicitly — why it is NOT the existing Brand tab

Sanket's request: give RarePrint's own **client businesses** (the shops, clinics, firms,
etc. who are RarePrint's printing/design customers) a ready-made, professionally designed
**festival wish image, branded for their own business**, automatically, on the festival
date — that business then does whatever they want with it (post to WhatsApp Status, forward
to their own customers, etc.). RarePrint's job stops at *handing them the finished image*;
what the client business does with it afterwards is entirely on them.

**This is a new feature, built from scratch — it does NOT reuse or extend the existing
Brand tab / `EventBrandProfile`.** That distinction matters enough to say twice:

- `EventBrandProfile` (the current Brand tab, shipped 2026-08-27) is a **singleton** — one
  row, holding **RarePrint's own** logo/name/address/phone/products — reused across every
  template RarePrint uses to wish **its own registered `EventPerson` contacts**
  (`frontend/app/events/page.tsx`'s People tab). One brand identity, one audience.
- This feature needs **many** brand identities — one per client business — and for each one,
  a festival image gets generated and delivered *to that business*, not to that business's
  own end customers (RarePrint has no relationship with those people at all).

So: **do not add fields to `EventBrandProfile` or the Brand tab for this.** Build a
parallel, new set of models/routes/UI (§3–§6) that happens to reuse the same rendering
engine, font system, and festival-linking pattern the existing module already has — reuse
the *plumbing*, not the *Brand tab itself*.

---

## 1. End-to-end flow this needs to support

1. Sanket adds a **client business** to a new list: business name, logo, a display phone/
   address/tagline (whatever should appear on the wish image), and a WhatsApp number — the
   number *the finished image gets delivered to* (the business owner/manager's own number,
   not their customers).
2. Sanket (or a designer) builds a **wish card template per festival**, same drag/resize
   field editor as today's Templates tab, but the fields are things like "client logo" and
   "client business name" instead of a person's name/photo. Layout is fixed per festival —
   only the client's own data swaps in.
3. On the festival date, for every active client business, the backend renders that
   business's own wish image from that festival's client template and sends it via WhatsApp
   to that business's own number, with a message that's clearly "here's your ready-to-share
   wish card," not a personal greeting.
4. The client business receives the image and does whatever they want with it — WhatsApp
   Status, forwarding to their own contacts, printing it, etc. **RarePrint has no visibility
   or control over that step, and this feature must not try to automate it.**
5. Sanket can see a history of what was generated/sent to which client business, and can
   trigger a manual "send test" the same way the People tab already can.

---

## 2. Current architecture to reuse (read `backend/src/events/` first)

- **`flyer-render.ts`** — `renderFlyer()` already composites a background image + fractional
  (0..1) positioned TEXT/PHOTO/BRAND_LOGO/BRAND_TEXT fields via sharp + SVG `<text>`. The
  BRAND_LOGO/BRAND_TEXT pattern added 2026-08-27 (value comes from a separate profile object
  passed in as a param, not from `values`/`photoBuffer`) is the *exact* shape to copy for
  the new CLIENT_LOGO/CLIENT_TEXT field types (§3.3) — same file, same function, one more
  pair of branches.
- **`fonts.ts`** — 'DejaVu Sans' / 'Segoe UI' / 'Noto Sans Devanagari' are already embedded
  and selectable; nothing new needed here unless a client wants a font none of these covers.
- **`events.service.ts`** — `loadBrandForRender()` is the pattern to copy for a new
  `loadClientForRender(clientBusinessId)` (§4.1): one DB read, converted into the shape
  `flyer-render.ts` wants (a value map + a decoded logo buffer).
- **`events-scheduler.service.ts`** — the daily 8am IST `@Cron` job already loops "active
  Festivals matching today" and, for each, loops recipients and calls
  `EventsService.renderAndSend()`. The new client-wish send is a **second loop inside the
  same festival match**, not a separate cron job — see §4.2.
- **`Festival` model** — already supports recurring (month/day) and one-time (`oneTimeDate`)
  festivals (shipped 2026-08-27) and already links to one `EventFlyerTemplate` via
  `templateId`. This feature adds a **second, optional** template link on the same row
  (§3.2) rather than duplicating the festival-date concept.
- **Idempotency pattern** — every existing send type (birthday/anniversary/festival) is
  guarded by "does a `SUCCESS` log already exist for this recipient + occasion(+festivalId)
  + calendar year?" via `EventSendLog`, not a flag on the source row. Follow the same shape
  for client-wish sends (§3.4) — do not add a `lastSentAt` column to the new client-business
  table, for the same reason `Festival` doesn't have one (a recurring festival must be able
  to fire again next year).
- **Public flyer route + signed token** (`GET /events/flyer/:id?token=&expires=`) — reusable
  as-is if client-wish sends also write into `EventSendLog`-shaped storage (§3.4 recommends
  a parallel table instead — if so, the public route needs a second lookup branch, or its
  own near-identical route; either is fine, keep it simple).

---

## 3. Data model (new, additive — see §7 for the migration rule)

### 3.1 `EventClientBusiness` (new model)

```prisma
model EventClientBusiness {
  id             String   @id @default(cuid())
  businessName   String
  logoDataUrl    String?  @db.Text
  phone          String?              // shown on the wish image, if the template has a field for it
  address        String?  @db.Text
  tagline        String?              // e.g. a short category/slogan line, if wanted on the image
  whatsappNumber String               // where the finished image gets delivered — the business's own number
  isActive       Boolean  @default(true)
  createdById    String
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([isActive])
}
```

Open question (§9): does Sanket want more than a flat field list here (e.g. a
category/industry tag for filtering), or is this enough? Default to this minimal shape
unless told otherwise — matches how lean `EventPerson` is.

### 3.2 `Festival` — add one nullable column

```prisma
clientTemplateId String?
clientTemplate   EventFlyerTemplate? @relation("FestivalClientTemplate", fields: [clientTemplateId], references: [id])
```

A festival can have **both** its existing `templateId` (for RarePrint's own `EventPerson`
contacts) and this new `clientTemplateId` (for client businesses) set independently — a
festival with only one or the other still works; the scheduler (§4.2) just skips whichever
side has no template assigned, same as it already does when `templateId` alone is unset
today.

### 3.3 `EventFlyerTemplate` / `FlyerField` — new field types + occasion type

- Add `'CLIENT_LOGO'` and `'CLIENT_TEXT'` to `FlyerFieldType` (`flyer-render.ts`) and the
  frontend's mirrored `FieldType`, alongside the existing `'BRAND_LOGO'`/`'BRAND_TEXT'`.
  Same box/font/circle-crop controls as their BRAND_* counterparts.
- `FlyerField` gets a `clientKey?: 'businessName' | 'phone' | 'address' | 'tagline'` (mirrors
  `brandKey`), used only by `CLIENT_TEXT` fields.
- Add `'CLIENT_FESTIVAL'` to `EventOccasionType` so the Templates tab can filter to "Client
  Festival" templates separately from the existing "Festival" (own-customer) templates —
  recommended over overloading the existing `FESTIVAL` value, because a client-facing
  template's whole design purpose (feature the *client's* branding prominently) is different
  from an own-customer template's (feature *RarePrint's* branding). Open question in §9 if
  Sanket would rather keep one shared `FESTIVAL` category and just pick per-template which
  audience it's for.

### 3.4 `EventClientWishLog` (new model, parallel to `EventSendLog`)

```prisma
model EventClientWishLog {
  id                String               @id @default(cuid())
  clientBusinessId  String
  clientBusiness    EventClientBusiness  @relation(fields: [clientBusinessId], references: [id])
  templateId        String?
  template          EventFlyerTemplate?  @relation(fields: [templateId], references: [id])
  festivalId        String
  festival          Festival             @relation(fields: [festivalId], references: [id])
  occasionYear      Int                  // same 0-sentinel-for-test-send convention as EventSendLog
  recipientPhone    String
  flyerImageDataUrl String?              @db.Text
  status            EventSendStatus
  errorMessage      String?              @db.Text
  createdAt         DateTime             @default(now())

  @@index([clientBusinessId, festivalId, occasionYear])
  @@index([festivalId])
  @@index([createdAt])
}
```

Why a **separate** table instead of reusing `EventSendLog` with a nullable `personId` +
new nullable `clientBusinessId`: `EventSendLog.personId` is relied on as non-null everywhere
it's already queried (History tab, idempotency check, public flyer route), and this
codebase's own incident history (`docs/Events_Module_Context.md`, "never edit an
already-applied migration") shows the cost of touching shipped, already-depended-on shapes
casually. A parallel table is more code (a second render/send/log path) but zero risk to the
existing one. If a future session strongly prefers merging them, that's a reasonable
alternative — just don't do it by loosening `EventSendLog.personId`'s nullability without
re-auditing every existing query against it first.

---

## 4. Backend changes

### 4.1 `events.service.ts`

- `createClientBusiness` / `listClientBusinesses` / `getClientBusiness` /
  `updateClientBusiness` / `deleteClientBusiness` — same shape as the existing
  `createPerson`/`listPeople`/etc. (logo upload via the same `fileToDataUrl` pattern already
  used for `EventPerson.photoDataUrl` and `EventBrandProfile.logoDataUrl`; block delete if
  `EventClientWishLog` rows exist, same reasoning as `deletePerson`).
- `loadClientForRender(clientBusinessId)` — mirrors `loadBrandForRender()`: one DB read,
  returns `{ clientValues: Partial<Record<ClientKey,string>>, clientLogoBuffer: Buffer|null }`.
- `renderAndSendClientWish({ clientBusiness, template, festival, persist })` — a new sibling
  to `renderAndSend()`, NOT a branch inside it (the recipient shape, log table, and message
  copy are different enough that forcing them into one function would make it harder to read,
  not easier). Reuses `renderFlyer()` directly with `clientValues`/`clientLogoBuffer`, and
  the same signed-public-URL + AiSensy-send + log-update sequence as `renderAndSend()` —
  copy that sequence, don't abstract it prematurely.
- `sendTestClientWish(clientBusinessId, festivalId)` — mirrors `sendTestWish()`, persist:false.
- Festival CRUD (`createFestival`/`updateFestival`) — accept and store `clientTemplateId`
  alongside the existing `templateId`.

### 4.2 `events-scheduler.service.ts`

Inside the existing `sendFestivals()` loop, after the current "for each active `EventPerson`"
block for a matched festival, add a second loop:

```ts
if (festival.clientTemplateId) {
  const clientTemplate = await this.prisma.eventFlyerTemplate.findUnique({ where: { id: festival.clientTemplateId } });
  if (clientTemplate?.isActive) {
    const clients = await this.prisma.eventClientBusiness.findMany({ where: { isActive: true } });
    for (const client of clients) {
      // same already-sent-this-year guard, scoped to EventClientWishLog instead of EventSendLog
    }
  }
}
```

Log a warning (same style as the existing `templateId` missing/inactive warnings) rather
than throwing, if `clientTemplateId` is set but the template itself is missing/inactive —
this festival's own-customer side must keep sending even if the client side is misconfigured,
and vice versa.

### 4.3 `events.controller.ts`

New routes, same auth guard as everything else in this controller:

```
POST   /events/client-businesses
GET    /events/client-businesses
GET    /events/client-businesses/:id
PATCH  /events/client-businesses/:id
DELETE /events/client-businesses/:id
POST   /events/client-businesses/:id/send-test   body: { festivalId }
```

`createFestival`/`updateFestival` body types gain `clientTemplateId?: string`.

### 4.4 `whatsapp.service.ts`

**Open question, flagged for §9 — likely needs a second, separately-approved AiSensy
template.** The existing `sendEventWish()` / `hellomomentwishes` template's copy ("Warm
wishes from RarePrint") is written for a person receiving a personal greeting. A client
business receiving a tool to repost is a different message entirely — something like *"Hi
{{1}}, your {{2}} wish card is ready — share it with your customers!"* Reusing the existing
template's variable slots for different-meaning content risks Meta/AiSensy rejecting it on
review, or just reading oddly to the recipient. Recommend: a new
`WhatsAppService.sendClientWishReady()` method using a **new** `AISENSY_CLIENT_WISH_CAMPAIGN`
env var, pointed at a **new** AiSensy template Sanket creates+gets approved (same manual
process documented in `docs/Events_Module_Setup.md` for the original template) — do not
build this method against a guessed variable shape; confirm the real approved template's
variables the same way `hellomomentwishes` was confirmed on 2026-08-25 before wiring it up.

---

## 5. Frontend changes (`frontend/app/events/page.tsx`)

- New **"Client Businesses"** tab, parallel to the existing People tab: list + add/edit form
  (business name, logo upload, phone, address, tagline, WhatsApp number, active toggle),
  same visual pattern as `PeopleTab`/`PersonForm`.
- `TemplatesTab`'s occasion filter gains `"CLIENT_FESTIVAL"` as a fourth pill (label e.g.
  "Client Wish Cards"), alongside Birthday/Anniversary/Festival.
- `TemplateEditor` gains two more "Add field" buttons — "Add client logo field" / "Add client
  text field" — visible when editing a `CLIENT_FESTIVAL` template (or always visible, your
  call — the existing BRAND_* buttons are always visible regardless of occasion type, so
  matching that is simpler and consistent). `CLIENT_TEXT` fields need a `clientKey` picker
  in the properties panel, same UI shape as the existing `brandKey` picker added 2026-08-27.
- `FestivalsTab`'s add/edit form gains a second template dropdown — "Client wish card
  template" — alongside the existing one, both optional independently.
- History tab: either add a second "Client Wishes" history table (simplest, matches the
  two-separate-tables data model in §3.4), or merge both into one table with a type column —
  your call, flagged in §9.

---

## 6. Database migration (additive only — read this before writing SQL)

**Read `docs/Events_Module_Context.md` §"Never edit an already-applied migration file — add
a new one instead" before touching anything under `backend/prisma/migrations/`.** This
module has now hit that exact mistake twice (2026-08-25, and again — caught before shipping
— 2026-08-27). The existing `20260824090000`, `20260825120000`, and `20260827130000`
migration folders under `backend/prisma/migrations/20260824090000_add_events_module/` and
siblings are **immutable** — this feature's schema changes go in a **new** migration folder
(e.g. `20260828..._events_client_wish_cards`), following the same idempotent
`CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` style already used throughout.
Also add a matching fallback block to `backend/scripts/ensure-all-columns.js` (same
belt-and-suspenders pattern the last two Events migrations both added), and add the new
migration folder's path to `deploy-events-module.ps1`'s `git add` list and its post-migration
SQL-assertion check (mirrors what was just done for `EventBrandProfile`/`Festival.isRecurring`
in that script — copy that block's shape for `EventClientBusiness`/`EventClientWishLog`/
`Festival.clientTemplateId`).

Remember: `prisma migrate deploy` never runs at Railway boot (deliberate, see
`docs/Events_Module_Context.md`) — migrations for this feature will need
`node scripts/railway-migrate.js` run by hand against production `DATABASE_URL` before it
works live, same as every other Events migration so far.

---

## 7. Open product decisions — confirm with Sanket before or during the build

1. **Does the wish image also carry any RarePrint branding/credit** (e.g. a small "Designed
   by RarePrint" line or logo), or is it 100% the client business's own branding with zero
   RarePrint presence on the image itself? Either is easy to build; needs a decision before
   the template layout is finalized.
2. **New AiSensy template needed** (§4.4) — confirm Sanket wants to create+get a second
   template approved, and get its exact variable shape before wiring `sendClientWishReady()`.
3. **`CLIENT_FESTIVAL` as a new occasion type vs. reusing `FESTIVAL`** (§3.3) — recommended
   default is a new type; confirm before writing the enum migration (enum values are
   additive-only in Postgres too, but still worth locking in first).
4. **Does a client business ever need the SAME wish card for a birthday/anniversary of the
   business itself** (not a calendar festival), or is this strictly festival-only, per the
   original request? Building strictly festival-only per §1 unless told otherwise — this
   keeps the scheduler change in §4.2 scoped to the existing festival-match branch only.
5. **History tab: merged or separate** (§5) — either is a small amount of extra work either
   way; pick based on whether Sanket wants one place to look or a clean separation between
   "my own customers" activity and "client business" activity.
6. **Any limit or approval step before a client wish actually sends** (e.g. should Sanket
   preview/approve each business's rendered image before the first automatic send, in case a
   logo doesn't look right in a given layout), or is "send test" from the Client Businesses
   tab (§4.1) sufficient safety net? Recommend relying on send-test only, to match how the
   existing People-tab flow works, unless told otherwise.

---

## 8. Explicitly out of scope unless separately requested

- Any automation of what the client business does with the image after delivery (posting it
  to their own WhatsApp Status, forwarding it, etc.) — that is 100% manual on their end by
  design (per §0/§1), not something this feature touches.
- A client-business-facing login/portal to manage their own wish preferences — delivery is
  WhatsApp-only, same as the existing module.
- Per-client custom layouts (each client gets a different template) — in scope is one fixed
  layout per festival, shared across all client businesses, with only their own data swapped
  in, per the original request ("theres a fixed layout... it just fetches and places it
  accordingly").
- Billing/charging client businesses for this service — pure engagement/goodwill feature as
  described, no payment flow implied anywhere in the request.

---

## 9. Suggested build order

1. Schema + migration (§3, §6) — `EventClientBusiness`, `EventClientWishLog`, `Festival.
   clientTemplateId`, `CLIENT_LOGO`/`CLIENT_TEXT`/`CLIENT_FESTIVAL` additions to the relevant
   enums/types. Get this applied to production early (§6) since every later step depends on
   it existing.
2. `flyer-render.ts` CLIENT_LOGO/CLIENT_TEXT branches (§2, §3.3) — small, mechanical, mirrors
   the existing BRAND_LOGO/BRAND_TEXT branches exactly.
3. `events.service.ts` CRUD + `loadClientForRender` + `renderAndSendClientWish` +
   `sendTestClientWish` (§4.1).
4. `events.controller.ts` routes (§4.3).
5. Frontend: Client Businesses tab, template editor field types, Festival template-picker
   addition (§5) — build and test end-to-end with **manual send-test only** before touching
   the scheduler, so a broken render doesn't reach the daily cron job.
6. `events-scheduler.service.ts` second loop (§4.2) — last, once manual send-test is
   confirmed working for at least one real client business.
7. New AiSensy template (§4.4, §9.2) — this can happen in parallel with steps 1–6 (Sanket
   creating+submitting it for approval takes real-world review time), but
   `sendClientWishReady()` shouldn't be wired to a guessed variable shape — stub it or block
   on the approved template's confirmed shape before calling it live.
8. Update `docs/Events_Module_Context.md` with this feature's own "decisions that aren't
   obvious from the code" section once built, same as every other addition to this module has
   done — future sessions rely on that file being current.
