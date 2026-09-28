/**
 * The owner account — one email that carries owner-level rights independently
 * of its role (e.g. the Dashboard's owner-only Courier Profit section, and
 * creating user accounts).
 *
 * Configurable per deployment, which matters because this repo deploys to
 * RarePrint's own production AND to every SaaS customer from the same branch.
 * With the email hardcoded, anyone who got an account with that address on a
 * customer's instance would hold owner rights over that customer's data —
 * their instance, RarePrint's owner email. Provisioning now sets OWNER_EMAIL
 * to an empty string for customers (see saas-ops/customer-env-template.js),
 * which means "this deployment has no owner-by-email" and leaves the ADMIN
 * role as the only thing that grants access there.
 *
 * Unset falls back to RarePrint's own owner, so production behaviour is
 * unchanged by this being introduced.
 *
 * Note accounts.service.ts still declares its own copy of this literal (and
 * accounts.business-rules.spec.ts mirrors it). It was deliberately NOT
 * consolidated here: that file drives order approval and payment logic, and
 * changing it is not worth the risk as a side effect of unrelated work.
 * Consolidate when something else needs to change in it anyway.
 */
export const SUPER_ADMIN_EMAIL = (process.env.OWNER_EMAIL ?? 'sanket.rareprint@gmail.com').trim();

/**
 * Whether `email` is this deployment's owner. Always false when OWNER_EMAIL
 * is set to an empty string — an empty configured value must never match an
 * empty or missing email and hand out owner rights.
 */
export function isOwnerEmail(email: string | null | undefined): boolean {
  if (!SUPER_ADMIN_EMAIL) return false;
  if (!email) return false;
  return email.trim().toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
}
