// Who this deployment is, for text and copies the backend sends outside the
// app (WhatsApp, email, PDFs). One codebase serves RarePrint and every SaaS
// customer, so nothing here may hardcode RarePrint for a customer.
//
// Name precedence, most specific first:
//   1. The name an admin set in Settings > App Branding (cached here by
//      ErpConfigService on startup and on every change).
//   2. BRAND_NAME — set per customer at approve time (saas-ops).
//   3. "RarePrint" — RarePrint's own deployment sets neither.
//
// RarePrint's own contacts follow the OWNER_EMAIL convention
// (common/super-admin.ts): unset = RarePrint's value, exactly as before;
// set to an empty string (every customer, via saas-ops/customer-env-template)
// = this deployment has no such contact, so nothing is sent to RarePrint.
// Env is read on every call, not at import, because ConfigModule loads .env
// after modules are imported.

const DEFAULT_BRAND = 'RarePrint';
const RAREPRINT_OWNER_WHATSAPP = '919637318960';
const RAREPRINT_CONTACT_PHONE = '9637318960';
const RAREPRINT_HR_NOTIFY_EMAIL = 'hr.rareprint@gmail.com';

let settingsName: string | null = null;

/** Called by ErpConfigService with the Settings name (null = not set). */
export function setBrandSettingsName(name: string | null) {
  settingsName = name?.trim() || null;
}

function envBrandName(): string {
  return process.env.BRAND_NAME?.trim() || '';
}

export function brandName(): string {
  return settingsName || envBrandName() || DEFAULT_BRAND;
}

/**
 * Sign-off used when an order has no sales agent. RarePrint's own wording
 * ("Rareprint Team") is kept byte-for-byte so its live WhatsApp messages
 * do not change.
 */
export function brandTeamName(): string {
  if (!settingsName && !envBrandName()) return 'Rareprint Team';
  return `${brandName()} Team`;
}

function rareprintOrBlank(envKey: string, rareprintValue: string): string {
  const value = process.env[envKey];
  return value === undefined ? rareprintValue : value.trim();
}

/** WhatsApp number that gets owner copies of order notices and event wishes. Empty = send none. */
export function ownerWhatsappPhone(): string {
  return rareprintOrBlank('OWNER_WHATSAPP_PHONE', RAREPRINT_OWNER_WHATSAPP);
}

/** Phone given to a lead when their assigned agent has none saved. */
export function fallbackContactPhone(): string {
  return rareprintOrBlank('FALLBACK_CONTACT_PHONE', RAREPRINT_CONTACT_PHONE);
}

/** Inbox told when an employee accepts the HR agreement. Empty = no notice. */
export function hrNotifyEmail(): string {
  return rareprintOrBlank('HR_NOTIFY_EMAIL', RAREPRINT_HR_NOTIFY_EMAIL);
}
