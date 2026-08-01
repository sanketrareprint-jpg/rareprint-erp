# marketing-site

Public marketing/sales website for **RarePrint Suite** (placeholder name — see below) — the SaaS
version of RarePrint's ERP. Separate app from `../frontend` (the authenticated ERP product) and
`../rareprint-website` (RarePrint's own printing storefront) — see `../docs/Marketing_Site_Roadmap.md`
for the full plan and reasoning.

This is Phase A + B of that roadmap: scaffold + static content pages, no backend dependency yet.
Pricing (`app/lib/plans-data.ts`) and contact links (`app/lib/site-config.ts`) are placeholders —
see the TODOs in those two files.

## Naming: read this before showing anyone

The original placeholder brand was "PrintERP." Turns out that's a real, live competitor at
**printerp.in** (Shubh Ventures, Raipur) selling almost the same thing — GST billing, CRM,
production, inventory for print shops. Renamed everything to **"RarePrint Suite"** as a safer
placeholder (2026-08-01). `BRAND_NAME` in `app/lib/site-config.ts` is the single place to change
it again once a real name is picked — every page reads from that constant.

## What's deliberately NOT on this site (don't add without a real decision)

- **No fabricated stats.** Competitors show "120+ businesses / 10K+ users" style numbers. We
  don't have paying customers yet, so the homepage "proof strip" only states things that are
  literally true right now (built running RarePrint's own operations, etc.) instead of invented
  social proof.
- **No business address, GSTIN, or legal entity name** in the footer or `/about`, unlike
  competitor sites that publish this. Whether sales happen under the RarePrint entity or a new
  one, and whether a separate GSTIN is needed, hasn't been decided — left off rather than guessed.
- **No SEO long-tail landing pages** (things like `/flex-printing-billing-software`,
  `/offset-printing-erp`, etc. — printerp.in has ~15 of these). Real SEO value, but picking the
  right keywords and writing them well is its own project; flagged as a later phase, not built now.
- **"Is my data secure / isolated per tenant" FAQ answer** describes the tenant-isolation design
  goal from the main SaaS roadmap (Phase 1 there), which hasn't been built yet. Don't launch this
  page publicly until that's actually true — see the comment in `app/lib/faq-data.ts`.

## Local dev

```bash
npm install
npm run dev
```

Runs on `http://localhost:3002` (3001 is already `frontend`, 3000 is Next's default).

## Before this goes live

1. **Pick a real name and domain** — replace `BRAND_NAME` in `app/lib/site-config.ts` and
   `SITE_URL` in `app/layout.tsx` (currently a placeholder `.example` domain, deliberately not
   printerp.in). Open question #1 in the roadmap doc.
2. **Replace the WhatsApp number** in `app/lib/site-config.ts` — currently a placeholder. Two
   candidate numbers exist in `backend/.env`; didn't want to guess which is meant to be
   customer-facing.
3. **Lock real pricing** — `app/lib/plans-data.ts` has three placeholder tiers, placeholder INR
   numbers, and a placeholder 10x-monthly annual discount. Update or replace before launch.
4. **Create the Railway service.** This repo already runs `frontend/` and `backend/` as two
   separate Railway services from one GitHub repo (see their `Dockerfile`/`railway.json`). Add
   `marketing-site/` as a third service the same way — point its root directory at
   `marketing-site/` in the Railway dashboard.
5. **Decide the legal/business info** question above before adding a footer legal block.

## Later phases (not built yet, tracked in the roadmap doc)

- **Phase C** — swap `getPlans()` in `app/lib/plans-data.ts` for a real fetch to
  `GET /public/plans` once the backend `Plan` model exists.
- **Phase D** — replace the WhatsApp/email links on `/about` with a form posting to a public
  lead-capture endpoint that drops straight into the ERP's own CRM.
- **Phase E** — once the Tenant model + signup wizard exist, point "Book a demo" /
  "Talk to us" CTAs at real self-serve signup instead of WhatsApp.
- **SEO landing pages** — once keyword targets are picked.
