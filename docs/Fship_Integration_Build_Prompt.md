# Fship Integration — Detailed Build Prompt

**How to use this file:** hand this directly to whoever (or whichever AI session) builds
this, alongside Fship's own API documentation PDF. It assumes the reader has NOT seen the
planning conversation — everything needed to start implementing is here, except the exact
Fship API request/response shapes, which are intentionally left as placeholders (§6) until
the PDF is provided. **Do not guess Fship's API surface — confirm every endpoint, field
name, auth mechanism, and unit (kg vs g, cm vs mm) against the actual PDF before writing
the FshipService code.** This matches this codebase's CLAUDE.md rule: never invent an
external API's behavior.

## 0. What was decided (confirmed by Sanket, 2026-08-20)

RarePrint already ships via **Bigship** (primary) and **Shiprocket** (secondary/fallback),
selected today by a single global "active carrier" setting in Settings. Sanket wants to add
**Fship** as a third courier, but explicitly wants **per-shipment selection** — a dropdown
right in the Book Shipment flow, so the dispatcher picks Bigship or Fship (or Shiprocket)
for *that specific shipment*, not a global switch that changes every shipment on the system
until someone flips it back. This is a materially bigger change than "add a 3rd option to
the global toggle" — it touches the rate-fetch call, the booking call, and the Shipment
record itself, not just Settings.

---

## 1. Current architecture (read this before touching anything)

- **`backend/src/carrier-config/carrier-config.service.ts`** — `CarrierConfigService`.
  Holds one `ActiveCarrier` (`'shiprocket' | 'bigship'`) plus per-carrier credentials.
  Priority: env vars (Railway) > DB (`SystemConfig` row, key `carrier_config`) > built-in
  defaults. `getConfig()` / `getActiveCarrier()` are read anywhere that needs to know which
  carrier is "on" right now.
- **`backend/src/bigship/bigship.service.ts`** — `BigshipService`. The pattern to mirror for
  `FshipService`. Key methods: `getAuthToken()`, `fetchCourierRates()` /
  `fetchB2BCourierRates()` (2+ boxes routes to B2B), `tryCreateAdhocOrder()` (draft),
  `placeExistingOrder()` (manifest/confirm — two-step: draft then place, because Bigship
  rejects booking a stale draft), `getOrderShipmentDetails()` (tracking/status poll),
  `getCachedWarehouses()` / `getWarehouseList()` / `refreshWarehouseCache()`.
- **`backend/src/dispatch/dispatch.service.ts`** — the orchestrator. `getRates()` and
  `bookItems()` branch on `activeCarrier` (currently `'bigship'` vs `'shiprocket'`, with
  Shiprocket also used as an automatic fallback if Bigship returns zero live rates).
  Both functions already scope quotes/booking to the specific item(s) selected in the
  Book Shipment modal (`itemIds` param — added recently, see
  `deploy-fix-booking-amounts-selected-items.ps1`), computing `dispatchItemsValue` /
  `readyItemsValue` from just those items rather than the whole order. **Reuse that exact
  item-scoping logic for Fship — do not recompute it differently.**
- **`backend/prisma/schema.prisma` → `model Shipment`** — one row per physical booking.
  Generic fields: `carrierName`, `awbNumber`, `trackingNumber`, `status`. Bigship-specific
  fields bolted on directly: `bigshipOrderId`, `bigshipStatus`, `bigshipSyncedAt`. No
  Shiprocket-specific columns exist (Shiprocket apparently didn't need any extra state
  beyond the generic fields). Follow the same "bolt on N carrier-specific columns" pattern
  for Fship rather than inventing a generic JSON blob — keeps things greppable and matches
  what's already there twice.
- **Frontend `frontend/app/orders/page.tsx`** — Book Shipment modal. `RateQuote` type
  already carries `carrierName` per quote (`{ carrierName, amount, estimatedDays, rateId }`)
  — display already expects multi-carrier-labeled quotes, it just never gets more than one
  carrier's worth today. `fetchRates()` calls `GET /dispatch/rates/:orderId` with
  `itemIds` in the query string.
- **Frontend `frontend/app/dispatch/page.tsx`** — Dispatch queue's own booking flow, same
  `itemIds`-scoped `fetchRates()` pattern, separate from the Orders page modal.
- **`backend/src/dispatch/dispatch.controller.ts`** — `GET /dispatch/rates/:orderId` and
  `POST /dispatch/book` (+ `/book-transport`, `/direct/send-otp`) are the relevant routes.

---

## 2. Backend changes

### 2.1 `CarrierConfigService`
- Extend `ActiveCarrier` to `'shiprocket' | 'bigship' | 'fship'`.
- Add `FshipCfg` type (fields TBD from the PDF — likely API key/secret or username+password,
  plus a pickup-location/warehouse identifier if Fship has that concept like Bigship does).
- Add `fship: FshipCfg` to `CarrierConfig`, default values in `buildDefault()`, env var
  overlay block (`FSHIP_...` vars) in `overlayEnvVars()`, and mirror entries in
  `applyToEnv()`. Follow the exact same block structure already used for `bigship`/
  `shiprocket` in that file — don't restructure the class.
- The existing `activeCarrier` field keeps working as-is: it's now just "the default
  pre-selected option in the per-shipment dropdown," not the only option. No behavior change
  for orders that don't explicitly pick a carrier.

### 2.2 New `FshipService` (new module: `backend/src/fship/`)
Mirror `BigshipModule`'s file layout: `fship.module.ts`, `fship.service.ts`. Needs (exact
signatures depend on the PDF — this is the required capability list, not a spec):
- Auth (token fetch/refresh, or static API key — whichever the PDF specifies).
- Rate quote by pickup pincode + delivery pincode + weight (+ COD flag if that affects
  pricing) — equivalent to `fetchCourierRates()`.
- Create/book a shipment for a confirmed order — equivalent to
  `tryCreateAdhocOrder()` + `placeExistingOrder()` if Fship is also a two-step draft→confirm
  flow, or a single call if Fship books in one step. **Confirm which from the PDF — don't
  assume Bigship's two-step shape carries over.**
- Fetch shipment status/tracking — equivalent to `getOrderShipmentDetails()`.
- Pickup location / warehouse listing, if Fship has that concept (Bigship does; Shiprocket
  does via a different shape; confirm what Fship expects — a single fixed pickup address
  might be enough if Fship doesn't have multi-warehouse).
- Cancel, if the PDF documents a cancel endpoint (not currently used for Bigship/Shiprocket
  in this codebase, but check anyway — don't skip reading it in the PDF).

### 2.3 `dispatch.service.ts`
- `getRates(orderId, warehouseId?, weightKgOverride?, pickupOverride?, packageBoxes?, itemIds?, carrier?)`
  — add a new optional last param `carrier?: 'bigship' | 'shiprocket' | 'fship'`. When
  provided, use it instead of `carrierConfig.getActiveCarrier()` to decide which branch
  runs. When omitted, fall back to today's behavior (global default) — existing callers
  that don't pass it must keep working unchanged.
- `bookItems(...)` (and `bookTransport`, `sendDirectOtp` if Fship applies there too — likely
  only `bookItems`/courier flow, transport/by-hand are carrier-agnostic) — same `carrier`
  param threaded through, branching to `this.fship.*` calls in a third `if` arm parallel to
  the existing `bigship`/`shiprocket` ones. Reuse the existing `dispatchItemsValue` /
  `itemsToDispatch` / `dispatchedAt`-setting logic verbatim — the item-scoping and
  dispatched-tracking fixes from this session apply identically regardless of which courier
  is used, don't duplicate that logic inside the new branch.
- Write `fshipOrderId` / `fshipStatus` / `fshipSyncedAt` (new Shipment columns, §3) instead
  of the `bigshipOrderId` equivalents when the Fship branch runs, `carrierName` set to
  whatever Fship calls itself (confirm exact display name from the PDF, e.g. "Fship
  Courier").

### 2.4 `dispatch.controller.ts`
- `GET /dispatch/rates/:orderId` — add `@Query('carrier') carrier?: string`, pass through.
- `POST /dispatch/book` — add `carrier?: string` to the request body type, pass through.

### 2.5 Register the module
- `backend/src/fship/fship.module.ts` exports `FshipService`.
- Add `FshipModule` to `DispatchModule`'s `imports` array
  (`backend/src/dispatch/dispatch.module.ts`), alongside `BigshipModule`/`ShiprocketModule`.
- Add `FshipModule` to `app.module.ts` only if anything outside `DispatchModule` needs it
  directly (unlikely — check the equivalent for Bigship first, it's probably only imported
  via `DispatchModule`).

---

## 3. Database changes (additive only — see CLAUDE.md §6)

New migration under `backend/prisma/migrations/`, idempotent SQL (`ADD COLUMN IF NOT
EXISTS`), following the existing pattern in `backend/scripts/ensure-all-columns.js` (add a
new check block there too, same file, same idempotent style — this is how schema changes
get applied to the live Railway Postgres per `team-history.md`, **never** via
`prisma migrate dev` against this DB and **never** wired into `railway.json`'s
`startCommand`):

```
Shipment.fshipOrderId    String?
Shipment.fshipStatus     String?
Shipment.fshipSyncedAt   DateTime?
```

Add the same three fields to `schema.prisma`'s `model Shipment`, mirroring the existing
`bigshipOrderId`/`bigshipStatus`/`bigshipSyncedAt` fields exactly (comments, nullability).
Do not touch the existing Bigship columns.

---

## 4. Frontend changes

### 4.1 `frontend/app/orders/page.tsx` — Book Shipment modal
- Add a carrier selector (radio group or small dropdown — match whatever control style this
  modal already uses for `dispatchType`) labeled something like "Ship via:" with options for
  every carrier that's actually configured (don't hardcode all three if, say, Fship
  credentials aren't set yet — mirror however the modal currently decides whether to even
  show the COURIER option at all, if it does that kind of conditional today). Default
  selection = the current global `activeCarrier` from Settings, so existing behavior is the
  default and nothing changes for someone who never touches the new control.
- Add local state, e.g. `const [selectedCarrier, setSelectedCarrier] = useState<string>(...)`.
- `fetchRates()` — append `&carrier=${selectedCarrier}` to the existing `itemIds`-scoped
  query string.
- The final book/submit call — include `carrier: selectedCarrier` in the request body.

### 4.2 `frontend/app/dispatch/page.tsx`
- Same additions, mirrored — this page has its own independent `fetchRates`/book calls (see
  the summary of prior work: it was already confirmed this page has no separate COD logic,
  just its own rate/booking calls, so add the carrier param here exactly the same way).

### 4.3 `frontend/app/settings/page.tsx`
- Extend the existing carrier config section to add Fship credential fields (whatever
  `FshipCfg` ends up being, §2.1) and add "Fship" as a selectable value for the existing
  "default active carrier" control — this becomes the pre-selected default in the new
  per-shipment dropdown, not a hard switch anymore.

---

## 5. Explicitly out of scope unless separately requested

- Automatic "cheapest rate across all 3 carriers" comparison/auto-select — the dropdown is a
  manual choice, not a rate-shopping engine. (Could be a natural follow-up later, but adds
  real complexity — fetching quotes from all providers on every rate check — so don't build
  it speculatively now.)
- Deprecating or removing Bigship/Shiprocket, or changing the global default.
- Migrating/backfilling old Shipment rows.
- A Fship equivalent of the existing "Sync Bigship" / "Sync Bigship All" manual-refresh
  buttons and delivered-report reconciliation tooling (`bigship-remittance` matching, etc.)
  — only build this if Fship's tracking doesn't update live and Sanket asks for it later.

---

## 6. Information required from Fship's API PDF before coding §2.2

Read the PDF and fill this in before writing `FshipService` — do not proceed on guesses:

- Base URL(s): sandbox vs production, and how the app switches between them.
- Auth mechanism: API key header, OAuth token, username/password login (like Bigship's
  `getAuthToken()`), and token lifetime/refresh behavior.
- Rate quote endpoint: request fields (pickup/delivery pincode, weight, dimensions — kg or
  g? cm or mm?, COD vs prepaid, declared value) and response shape (per-courier options,
  price, ETA, a rate/quote ID to reuse at booking time — Bigship's `rateId` is reused this
  way, check if Fship works the same way or if quotes are single-use/informational only).
  Also check whether the sandbox `/dispatch/getRates` needs its `itemIds`/`packageBoxes`
  logic replicated 1:1 for Fship or if Fship has different B2B/B2C thresholds than Bigship's
  "2+ boxes → B2B" rule.
- Order creation endpoint: required fields, address format (does it need split
  address/city/state/pincode fields like `splitAddressForShiprocket()` builds, or a single
  address string?), whether it's one-step (create+ship immediately, like Shiprocket) or
  two-step (draft then place/manifest, like Bigship), what's returned (order ID, AWB
  number, or is AWB assigned separately/later?).
- Tracking/status endpoint: poll-based (like `getOrderShipmentDetails()`) or webhook-based?
  If webhook, a new controller route will be needed to receive it — check the PDF for the
  exact payload shape and any signature/verification requirement before building that.
  What status strings does Fship use, and how do they map onto this codebase's
  `ShipmentStatus` enum (see `mapBigshipStatusToShipmentStatus()` in `dispatch.service.ts`
  for the pattern — Fship will need its own mapping function since the codebase can't
  assume Fship uses the same status vocabulary).
- Cancel/return endpoint, if any.
- Error response shape — so failures surface a real message to the dispatcher (per
  CLAUDE.md §7, don't swallow errors behind a generic message — this session's earlier fix
  to the Orders page's rate-fetch error handling exists specifically because of that rule).
- Weight/box limits, COD support and any COD-specific fields, pickup warehouse/location
  concept (single fixed address vs multiple registered warehouses).

---

## 7. Suggested build order

1. `CarrierConfigService` extension (§2.1) + Settings UI fields (§4.3) — get credentials
   storable/configurable first, nothing else depends on anything except this.
2. `FshipService` (§2.2), built directly against the confirmed PDF details (§6) — test its
   methods in isolation (a scratch script or a temporary debug route, same as
   `getWarehouseListDebug` exists for Bigship) before wiring it into `dispatch.service.ts`.
3. `dispatch.service.ts` + `dispatch.controller.ts` `carrier` param threading (§2.3, §2.4).
4. Database migration (§3) — needed before step 3's writes will succeed against the real DB;
   run `backend/scripts/railway-migrate.js` locally per `team-history.md` before deploying
   step 3/5's code.
5. Frontend carrier dropdown, both pages (§4.1, §4.2).
6. Test end-to-end on one real low-value order before treating this as done — get an actual
   AWB/tracking number back from Fship, confirm the Shipment row populated correctly, and
   confirm the existing item-scoped invoice-value logic (§1) produced the right value for
   Fship the same way it does for Bigship.
