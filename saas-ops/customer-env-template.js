// The set of environment variables a brand-new customer's backend service
// needs. This is NOT the same as saas-ops/.env (this tooling's own config) —
// this is what gets written onto the CUSTOMER's Railway environment.
//
// Built from backend/.env's actual key list, sorted into three groups. See
// README.md for the full explanation of why each group is handled the way
// it is — this file only contains the decisions, not the reasoning.

// Group 1: generated fresh, per customer, by provision-customer.js.
// Never copied from RarePrint's own values.
//   DATABASE_URL — filled in automatically once Railway provisions this
//                  customer's own Postgres (see provision-customer.js).
//   JWT_SECRET   — a fresh random secret per customer. Copying RarePrint's
//                  own JWT_SECRET would mean a login token signed for one
//                  customer could be replayed against another — never do
//                  that, even though the databases are already separate.

// Group 2: RarePrint-specific accounts — do NOT copy these values. Every
// customer needs their OWN account with each of these providers before
// these features will work for them. Left blank on purpose; the app should
// degrade gracefully with these unset until the customer provides their own
// (that's a real thing to verify on the first disposable test environment,
// not assume).
//
// AISENSY_API_KEY must be here even though nothing else in this group is
// WhatsApp: the backend falls back to RarePrint's own key when it is UNSET
// (whatsapp.service.ts, crm.service.ts), so leaving it out sends a customer's
// WhatsApp messages through RarePrint's AiSensy account. Found 2026-10-14 on
// demo-test-co, which predates this line.
const BLANK_UNTIL_CUSTOMER_PROVIDES_OWN = [
  'AISENSY_API_KEY',
  'SHIPROCKET_EMAIL',
  'SHIPROCKET_PASSWORD',
  'SHIPROCKET_PICKUP_PINCODE',
  'SHIPROCKET_PICKUP_LOCATION',
  'SHIPROCKET_DEFAULT_DELIVERY_PINCODE',
  'ACTIVE_CARRIER',
  'BIGSHIP_USERNAME',
  'BIGSHIP_PASSWORD',
  'BIGSHIP_ACCESS_KEY',
  'BIGSHIP_PICKUP_WAREHOUSE_ID',
  'BIGSHIP_RETURN_WAREHOUSE_ID',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'GMAIL_CLIENT_ID',
  'GMAIL_CLIENT_SECRET',
  'GMAIL_REFRESH_TOKEN',
  'GMAIL_FROM',
];

// Group 3: RarePrint's own internal identities — definitely do not copy
// these to a customer. A customer's Virtual-CEO alerts should not ring
// Sanket's or Prajakta's phone. Left blank; wire up per customer once that
// feature is actually turned on for them.
//
// OWNER_EMAIL is in here for a sharper reason than alert routing. It names
// the account that holds owner-level rights regardless of role — including
// the right to create user accounts. Backend code falls back to RarePrint's
// own owner email when the variable is unset, so leaving it out of a
// customer's environment would mean that address quietly held owner rights
// over that customer's data. Setting it to an empty string tells
// backend/src/common/super-admin.ts this deployment has no owner-by-email,
// leaving the ADMIN role as the only thing that grants access there.
//
// OWNER_WHATSAPP_PHONE and HR_NOTIFY_EMAIL follow the same rule
// (backend/src/common/brand.ts): unset means RarePrint's own number/inbox, so
// a customer without the empty value would copy every order notice and event
// wish to RarePrint's owner, and tell RarePrint's HR inbox about another
// company's employees.
const BLANK_RAREPRINT_INTERNAL_ONLY = [
  'VCEO_PRAJAKTA_PHONE',
  'VCEO_SANKET_PHONE',
  'OWNER_EMAIL',
  'OWNER_WHATSAPP_PHONE',
  'HR_NOTIFY_EMAIL',
];

import crypto from 'node:crypto';

/**
 * @param {string} databaseUrl - this customer's own Postgres connection
 *   string, from Railway, after provisioning their database.
 * @param {{ brandName: string, contactPhone?: string }} brand - the business
 *   name (BRAND_NAME: their name in WhatsApp/email/PDF text instead of
 *   RarePrint's) and, when known, their own phone (FALLBACK_CONTACT_PHONE:
 *   given to a lead whose agent has no phone saved — blank otherwise, never
 *   RarePrint's number).
 * @returns {Record<string, string>} full variable set to write onto the
 *   customer's Railway service.
 */
export function buildCustomerEnv(databaseUrl, { brandName, contactPhone = '' }) {
  if (!brandName?.trim()) throw new Error('buildCustomerEnv needs the customer brand name.');
  const vars = {
    DATABASE_URL: databaseUrl,
    JWT_SECRET: crypto.randomBytes(32).toString('hex'),
    BRAND_NAME: brandName.trim(),
    FALLBACK_CONTACT_PHONE: contactPhone.trim(),
  };
  for (const key of [...BLANK_UNTIL_CUSTOMER_PROVIDES_OWN, ...BLANK_RAREPRINT_INTERNAL_ONLY]) {
    vars[key] = '';
  }
  return vars;
}
