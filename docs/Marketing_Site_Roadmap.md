# Marketing / Sales Website Roadmap (printerp.in-style)

Sub-roadmap for section 6 of `SaaS_Conversion_Roadmap_v2.md`. This covers the public site where a stranger printer-owner lands, sees features + pricing, and buys — separate from the ERP app itself and from `rareprint-website/`.

## Where it lives

**Decision: stays inside the `rareprint-erp` repo for now**, as a new top-level folder — `marketing-site/` — sitting next to `frontend/` and `backend/`, not merged into either.

Why a new folder instead of new routes inside `frontend/`: `frontend/` is the authenticated ERP app — it's already carrying Capacitor/Android config, 90+ modules, and a long tail of one-off scripts. Bolting public marketing pages onto that would mean every marketing page ships with the whole ERP bundle, and separating them out later gets *harder*, not easier. Confirmed the repo already runs this "multiple apps, one repo" pattern: `frontend/` and `backend/` each have their own `Dockerfile` and their own `railway.json`, deployed as two separate Railway services from one GitHub repo. `marketing-site/` follows the same pattern as a third service — same repo, same push, own deploy, own domain.

This also directly sets up the "shift it out later" option you mentioned: because `marketing-site/` won't share code with `frontend/` or `backend/` (it only talks to a small public API), moving it to its own repo later is a straight folder copy, not a rewrite.

**Domain:** decide between a fresh domain (e.g. `printerp.in`) pointed at the `marketing-site/` Railway service, vs. a subdomain split (`app.yourdomain.com` = product, `yourdomain.com` = marketing). Either works with this folder structure — it's a DNS/Railway config choice, not a code one. Flagging as an open question below.

## Build order

**Phase A — Scaffold (no backend dependency, can start anytime)**
- New `marketing-site/` folder: lightweight Next.js app (or even static export — no auth, no app router complexity needed), own `package.json`, own `Dockerfile` copied/adapted from `frontend/Dockerfile`.
- New Railway service pointed at `marketing-site/` as root directory, same pattern as the existing two services.
- Domain/subdomain wired up (the open question above needs an answer before this step).

**Phase B — Static content pages (no backend dependency)**
- Homepage: what it does, who it's for.
- Feature pages/sections — decide which of the 90+ modules to lead with (production tracking, accounting, CRM, WhatsApp bot, rewards, sales-learning, virtual-CEO) vs. bury in a "full feature list."
- About/contact, basic SEO metadata, analytics snippet.
- Can ship and go live with **hardcoded placeholder pricing** at this stage — doesn't have to wait for billing.

**Phase C — Public pricing API (depends on section 4 of the main roadmap: `Plan` model must exist)**
- Backend: one small **unauthenticated, read-only** endpoint, e.g. `GET /public/plans`, exposing only what's safe to show publicly (name, price, cycle, feature limits) — not the full `Plan` record.
- `marketing-site/` pricing page fetches from this instead of hardcoded copy, so a price change in billing shows up on the site automatically.
- Until Phase C lands, pricing page in Phase B just uses static copy you update by hand — acceptable short-term, flagged so it doesn't get forgotten once billing exists.

**Phase D — Lead capture (no hard backend dependency, but worth reusing what exists)**
- "Book a demo" / "Talk to us" form for visitors not ready to self-serve.
- You already have CRM + marketing modules in the ERP — simplest option is the form posts to a small public endpoint that drops the lead straight into your own CRM's leads table (eating your own dog food), instead of building a separate leads inbox just for this site.

**Phase E — "Start free trial" → real signup (depends on sections 1–3 and 5 of the main roadmap: Tenant model, auth, and the signup/onboarding wizard must exist)**
- Until the signup wizard exists, the CTA button is just a "join waitlist" / lead-capture form (reuses Phase D).
- Once the wizard exists, point the button straight at it — this is the one piece of `marketing-site/` that genuinely can't go fully live before the core SaaS conversion does.

**Phase F — Polish**
- Testimonials/case studies — placeholder content until first paying tenants exist.
- Performance/SEO pass, sitemap, OG tags for link previews.

## What can start today vs. what's blocked

- **Can build now, independent of everything else:** Phase A (scaffold) and Phase B (content pages with placeholder pricing).
- **Blocked on billing (`Plan` model):** Phase C (live pricing).
- **Blocked on Tenant + signup wizard:** the "real" version of Phase E.
- **Never blocked:** Phase D (lead capture can point at your existing CRM from day one).

So the practical path: scaffold the folder and write the content pages now, launch with a "join waitlist" CTA and static pricing, then swap in live pricing and self-serve signup as the backend phases land — instead of waiting for the whole SaaS conversion to finish before anyone can see the site.

## Open questions

1. Domain: new domain (e.g. `printerp.in`) vs. subdomain split off your existing domain?
2. Which modules do you want to lead with on the homepage vs. list further down (full suite is a lot to show a first-time visitor at once)?
3. Until Phase C/E land, are you OK launching with static pricing + a waitlist form, or would you rather hold the site back until pricing/signup are real?
