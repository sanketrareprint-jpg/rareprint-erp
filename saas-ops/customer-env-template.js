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
const BLANK_UNTIL_CUSTOMER_PROVIDES_OWN = [
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
const BLANK_RAREPRINT_INTERNAL_ONLY = ['VCEO_PRAJAKTA_PHONE', 'VCEO_SANKET_PHONE', 'OWNER_EMAIL'];

import crypto from 'node:crypto';

/**
 * @param {string} databaseUrl - this customer's own Postgres connection
 *   string, from Railway, after provisioning their database.
 * @returns {Record<string, string>} full variable set to write onto the
 *   customer's Railway service.
 */
export function buildCustomerEnv(databaseUrl) {
  const vars = {
    DATABASE_URL: databaseUrl,
    JWT_SECRET: crypto.randomBytes(32).toString('hex'),
  };
  for (const key of [...BLANK_UNTIL_CUSTOMER_PROVIDES_OWN, ...BLANK_RAREPRINT_INTERNAL_ONLY]) {
    vars[key] = '';
  }
  return vars;
}
