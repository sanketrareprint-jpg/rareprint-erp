// backend/src/common/complaint-link.ts
//
// Per-order link to the public complaint/query form (frontend /support),
// sent inside the order status WhatsApp (order_status_support_erp). The token
// is "<orderNumber>.<signature>": it only opens the form for that one order
// and can't be guessed or edited to another order. It doesn't expire — a
// customer may raise an issue weeks after delivery. Same JWT_SECRET HMAC
// approach as the invoice PDF link (BillingService.signPublicToken), with its
// own prefix so the two token kinds can never be swapped for each other.
import { createHmac, timingSafeEqual } from 'crypto';

function signature(orderNumber: string): string {
  return createHmac('sha256', process.env.JWT_SECRET ?? '')
    .update(`complaint-form:${orderNumber}`)
    .digest('hex')
    .slice(0, 16);
}

export function complaintFormToken(orderNumber: string): string {
  return `${orderNumber}.${signature(orderNumber)}`;
}

// The order number the token was issued for, or null if it's invalid.
export function verifyComplaintFormToken(token: string): string | null {
  const dot = String(token ?? '').lastIndexOf('.');
  if (dot <= 0) return null;
  const orderNumber = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(signature(orderNumber));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return orderNumber;
}

// FRONTEND_ORIGIN may be a comma-separated list (main.ts CORS) — the first
// entry is the site customers are sent to.
export function complaintFormUrl(orderNumber: string): string {
  const firstOrigin = (process.env.FRONTEND_ORIGIN ?? '').split(',')[0].trim();
  const origin = (firstOrigin || 'https://rareprint-erp.vercel.app').replace(/\/+$/, '');
  return `${origin}/support?t=${encodeURIComponent(complaintFormToken(orderNumber))}`;
}
