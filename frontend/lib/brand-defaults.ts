// Build-time brand defaults for this deployment. A plain module (no
// "use client") so server code like app/layout.tsx metadata can read the
// values too. Runtime Settings overrides live in lib/branding.ts.
//
// NEXT_PUBLIC_BRAND_NAME is set per SaaS customer at approve time
// (saas-ops/lib/frontend-provision.js). RarePrint's own deployment leaves it
// unset, so it keeps its name and logo exactly as before.
const ENV_BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME?.trim() || "";
export const IS_CUSTOM_BRAND = ENV_BRAND_NAME !== "";
export const DEFAULT_BRAND_NAME = ENV_BRAND_NAME || "RarePrint";
export const DEFAULT_BRAND_LOGO: string | null = IS_CUSTOM_BRAND ? null : "/rareprint-icon.png";
