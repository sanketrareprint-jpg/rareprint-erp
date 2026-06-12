const rawApiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "https://rareprint-erp-production.up.railway.app";
export const API_BASE_URL = rawApiBaseUrl.replace(/\/+$/, "");
