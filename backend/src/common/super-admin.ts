/**
 * The owner account — the one email that carries owner-level rights
 * independently of its role, used for checks like "owner only" on the
 * Dashboard's Courier Profit section.
 *
 * Note this same literal is also declared locally in accounts.service.ts
 * (and mirrored in accounts.business-rules.spec.ts). It was NOT consolidated
 * here when this file was added, deliberately: accounts.service.ts drives
 * order approval and payment logic, and editing it to change an import is
 * not worth the risk while doing unrelated work. Consolidate when something
 * else needs to change in that file anyway.
 */
export const SUPER_ADMIN_EMAIL = 'sanket.rareprint@gmail.com';
