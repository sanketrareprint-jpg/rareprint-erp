// UNUSED — left over from the SaaS tenantId conversion, reverted 2026-09-09
// (the migration that added tenantId columns was never applied to
// production and the code shipped ahead of it, causing a site-wide P2022
// outage). Nothing imports DEFAULT_TENANT_ID anymore.
//
// File deletion isn't available in this environment, so this is a stub
// instead of a removed file. Safe to delete manually via `git rm
// backend/src/common/tenant.ts`, or just leave it — it's dead code, not a
// bug. If SaaS conversion resumes, do it on the `saas-conversion` branch.
export {};
