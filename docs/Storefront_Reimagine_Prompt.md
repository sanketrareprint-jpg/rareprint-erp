# Prompt: Reimagine the /suite storefront

Paste this into a Claude session with the `design-taste-frontend` skill available (Cowork, Claude Code, etc.) and the `rareprint-erp` repo connected.

---

Redesign the public storefront at `frontend/app/suite/` in the `rareprint-erp` repo. This is the marketing site for selling the RarePrint ERP as a SaaS product to other printing businesses — separate from the ERP dashboard itself and from RarePrint's own customer-facing print storefront at `/web-to-print`. It's already live at `https://rareprint-erp.vercel.app/suite`, riding on the same Next.js app and Vercel deploy as the ERP (no separate service).

Use the `design-taste-frontend` skill. Treat this as a **redesign — overhaul**, not a preserve pass: I want a genuinely different visual direction from what's there now, not a polish of the current one. Audit the current `/suite` pages first before writing any code.

**Pages in scope** (all under `frontend/app/suite/`): `page.tsx` (home), `features/page.tsx`, `pricing/page.tsx`, `faq/page.tsx`, `about/page.tsx`, `start-free/page.tsx`. Shared chrome: `components/site-nav.tsx`, `components/site-footer.tsx`, `layout.tsx` (scoped Plus Jakarta Sans font, doesn't affect the rest of the ERP — keep that isolation).

**Brand & content facts — don't invent beyond these:**
- Placeholder brand name is `RarePrint Suite` (single source of truth: `lib/site-config.ts`'s `BRAND_NAME`) — "PrintERP" was rejected as a real competitor's product name, don't reintroduce it.
- No self-serve signup or billing exists yet. "Start free" / demo CTAs go to a WhatsApp message or a `mailto:` waitlist fallback (`lib/site-config.ts`), not a real signup flow. Keep it honest — don't imply instant signup.
- No real paying customers yet — no fabricated testimonials, logos, or customer counts.
- Feature/plan copy lives in `lib/features-data.ts` / `lib/plans-data.ts` / `lib/faq-data.ts` — update content there if the new design needs different copy, don't hardcode strings duplicated across components.
- Multi-tenant infrastructure behind this pitch (tenantId, per-tenant billing, signup wizard) does not currently exist in the backend — it was built once, caused a production outage, and was deliberately reverted (see `docs/SaaS_Conversion_Roadmap_v2.md` and project memory). The storefront is allowed to keep marketing the vision, but don't add anything that implies a live multi-tenant product exists today.

**What NOT to touch:** the ERP app itself (`frontend/app/(dashboard routes)`, everything outside `frontend/app/suite/`), the `/web-to-print` storefront, and any backend code — this is a frontend-only, `/suite`-scoped visual redesign.

Give me a one-line "Design Read" (page kind / audience / vibe / design system) before writing any code, per the skill's own process, so I can redirect early if it's off.
