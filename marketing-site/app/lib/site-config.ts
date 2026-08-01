// Central place for the placeholder contact details used across the site.
// Nothing here is wired to a backend yet (see docs/Marketing_Site_Roadmap.md,
// Phase D/E) — these are just where a visitor's click currently goes.

// TODO: replace with the real customer-facing WhatsApp Business number.
// (Two numbers exist in backend/.env — didn't want to guess which one is
// meant to be public-facing vs. an internal/API sender ID.)
export const WHATSAPP_NUMBER = "91XXXXXXXXXX";

export const DEMO_WHATSAPP_MESSAGE =
  "Hi! I'd like to book a demo of PrintERP for my printing business.";

export function whatsappLink(message: string = DEMO_WHATSAPP_MESSAGE) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

// Used for the waitlist/contact mailto fallback until Phase D wires a real
// lead-capture endpoint into the CRM.
export const CONTACT_EMAIL = "sanket.rareprint@gmail.com";

export function waitlistMailtoLink(subject: string = "PrintERP waitlist") {
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}
