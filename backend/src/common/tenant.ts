// Single-tenant default used everywhere until real multi-tenant tenant
// resolution (per-request, via subdomain/auth) is built. Every existing row
// in the database was backfilled onto this exact tenant id by the
// 20260907140000_add_tenant_id_rollout migration — do not change this
// value without a corresponding data migration.
export const DEFAULT_TENANT_ID = 'tenant_rareprint_default';
