// Shared by the Android auto dialer (app/dialer/page.tsx) and the PC popup
// (components/DialerDeskPopup.tsx). Backend: backend/src/dialer.

export type DialerOutcome = "INTERESTED" | "CALLBACK" | "NOT_ANSWERED" | "BUSY" | "WRONG_NUMBER" | "NOT_INTERESTED";

export const DIALER_OUTCOMES: Array<{ value: DialerOutcome; label: string; className: string }> = [
  { value: "INTERESTED", label: "Interested", className: "bg-green-600 text-white" },
  { value: "CALLBACK", label: "Callback", className: "bg-blue-600 text-white" },
  { value: "NOT_ANSWERED", label: "Not answered", className: "bg-slate-600 text-white" },
  { value: "BUSY", label: "Busy", className: "bg-amber-500 text-white" },
  { value: "WRONG_NUMBER", label: "Wrong number", className: "bg-red-700 text-white" },
  { value: "NOT_INTERESTED", label: "Not interested", className: "bg-red-500 text-white" },
];

/** GET /dialer/next?list= — same keys as DIALER_LISTS in dialer.rules.ts. */
export const DIAL_LISTS: Array<{ value: string; label: string }> = [
  { value: "ALL", label: "All (follow-ups, new leads, not contacted, then reserved)" },
  { value: "NEW_LEADS", label: "New leads (then reserved when new run out)" },
  { value: "RESERVED_LEADS", label: "Reserved leads" },
  { value: "NOT_CONTACTED", label: "Not contacted" },
  { value: "FOLLOW_UPS", label: "Follow-ups due" },
  { value: "INTERESTED", label: "Interested" },
  { value: "BUSY", label: "Busy (last call)" },
  { value: "NOT_ANSWERED", label: "Not answered (last call)" },
  { value: "NOT_INTERESTED", label: "Not interested" },
  { value: "CALLBACK", label: "Callback (last call)" },
  { value: "NI_RATE", label: "Not interested · Rate problem" },
  { value: "NI_QUANTITY", label: "Not interested · Quantity problem" },
  { value: "NI_TRUST", label: "Not interested · Trust problem" },
  { value: "NI_NO_REQUIREMENT", label: "Not interested · No requirement" },
];

export const DIALER_SOURCE_LABELS: Record<string, string> = {
  CALLBACK: "Callback last time",
  NI_RATE: "Rate problem last time",
  NI_QUANTITY: "Quantity problem last time",
  NI_TRUST: "Trust problem last time",
  NI_NO_REQUIREMENT: "No requirement last time",
  FOLLOW_UP_DUE: "Follow-up due",
  FRESH_LEAD: "New lead",
  RESERVED_LEAD: "Reserved lead",
  NOT_CONTACTED: "Not contacted",
  OLD_CALLBACK: "Older follow-up",
  INTERESTED: "Interested",
  NOT_INTERESTED: "Not interested",
  BUSY: "Busy last time",
  NOT_ANSWERED: "Not answered last time",
};

export interface RateList { id: string; name: string; message: string; }
export interface DialerSettings {
  rateLists: RateList[];
  /** AiSensy campaign per outcome, or per not-interested reason (NI_RATE, …) — see campaignForReply in dialer.rules.ts. */
  outcomeCampaigns: Partial<Record<string, string>>;
}

/** Placeholders a rate-list message may use. */
export const RATE_LIST_PLACEHOLDERS = "{name}, {business}, {agent}, {agentPhone}";

export function fillRateListMessage(
  message: string,
  vars: { name: string | null; business: string | null; agent: string; agentPhone: string },
): string {
  return message
    .replace(/\{name\}/g, vars.name?.trim() || "Sir/Madam")
    .replace(/\{business\}/g, vars.business?.trim() || "")
    .replace(/\{agent\}/g, vars.agent)
    .replace(/\{agentPhone\}/g, vars.agentPhone);
}

/**
 * Opens the chat in the agent's logged-in WhatsApp Web with the message typed
 * (agent presses Send). WhatsApp Web reloads itself on every such link.
 */
export function whatsappWebUrl(phone: string, text: string): string {
  const digits = phone.replace(/\D/g, "").slice(-10);
  return `https://web.whatsapp.com/send?phone=91${digits}&text=${encodeURIComponent(text)}`;
}

/** Same, in the installed WhatsApp desktop app — no reload. */
export function whatsappAppUrl(phone: string, text: string): string {
  const digits = phone.replace(/\D/g, "").slice(-10);
  return `whatsapp://send?phone=91${digits}&text=${encodeURIComponent(text)}`;
}

// ── Reply details (same rules as dialer.rules.ts on the backend) ──────────

/** Why the customer is not interested — NOT_INTERESTED_REASONS in dialer.rules.ts. */
export type NotInterestedReason = "RATE" | "QUANTITY" | "TRUST" | "NO_REQUIREMENT";
export const NOT_INTERESTED_REASONS: Array<{ value: NotInterestedReason; label: string }> = [
  { value: "RATE", label: "Rate problem" },
  { value: "QUANTITY", label: "Quantity problem" },
  { value: "TRUST", label: "Trust problem" },
  { value: "NO_REQUIREMENT", label: "No requirement" },
];
export const notInterestedReasonLabel = (r: string | null | undefined) =>
  NOT_INTERESTED_REASONS.find((x) => x.value === r)?.label ?? r ?? "";

/** A product row in the reply form. quantity / rate are kept as typed text until sent. */
export interface ReplyProductDraft { productId: string; quantity: string; rate: string; }
/** As saved on a call (productName filled in by the backend). */
export interface ReplyProduct { productId: string; productName?: string; quantity: number | null; rate: number | null; }

/** Which replies carry products — replyProductRule in dialer.rules.ts. */
export function replyProductRule(outcome: DialerOutcome | null, reason: NotInterestedReason | ""): "none" | "optional" | "required" {
  if (outcome === "INTERESTED") return "optional";
  if (outcome === "NOT_INTERESTED" && (reason === "RATE" || reason === "QUANTITY")) return "required";
  return "none";
}

/**
 * Checks the reply details and builds the request fields
 * ({ notInterestedReason, products }), or returns an error message.
 */
export function buildReplyDetails(
  outcome: DialerOutcome | null,
  reason: NotInterestedReason | "",
  rows: ReplyProductDraft[],
): { ok: true; value: { notInterestedReason?: NotInterestedReason; products?: Array<{ productId: string; quantity: number | null; rate: number | null }> } } | { ok: false; error: string } {
  if (outcome === "NOT_INTERESTED" && !reason) return { ok: false, error: "Choose why the customer is not interested." };
  const rule = replyProductRule(outcome, reason);
  if (rule === "none") return { ok: true, value: outcome === "NOT_INTERESTED" ? { notInterestedReason: reason as NotInterestedReason } : {} };
  const withRate = reason !== "QUANTITY";
  const filled = rows.filter((r) => r.productId || r.quantity.trim() || r.rate.trim());
  // Quantity is only required for "Not interested — quantity"; otherwise optional, like rate.
  const requireQuantity = reason === "QUANTITY";
  const products: Array<{ productId: string; quantity: number | null; rate: number | null }> = [];
  for (const [i, r] of filled.entries()) {
    if (!r.productId) return { ok: false, error: `Product ${i + 1}: choose the product.` };
    let quantity: number | null = null;
    if (requireQuantity || r.quantity.trim()) {
      quantity = Number(r.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) return { ok: false, error: `Product ${i + 1}: enter the quantity (whole number).` };
    }
    let rate: number | null = null;
    if (withRate && r.rate.trim()) {
      rate = Number(r.rate);
      if (!Number.isFinite(rate) || rate < 0) return { ok: false, error: `Product ${i + 1}: rate must be a number.` };
    }
    products.push({ productId: r.productId, quantity, rate });
  }
  if (rule === "required" && !products.length) return { ok: false, error: requireQuantity ? "Choose the product and quantity the customer asked about." : "Choose the product the customer asked about." };
  return {
    ok: true,
    value: {
      ...(outcome === "NOT_INTERESTED" ? { notInterestedReason: reason as NotInterestedReason } : {}),
      ...(products.length ? { products } : {}),
    },
  };
}

/**
 * WhatsApp message listing the products agreed on the call (Interested):
 * name, quantity and the rate typed by the agent. No totals are worked out
 * here — the quote / order is where amounts are calculated.
 */
export function productsWhatsAppMessage(
  products: Array<{ name: string; quantity: number | null; rate: number | null }>,
  vars: { name: string | null; agent: string; agentPhone: string },
): string {
  const lines = products.map((p) =>
    `• ${p.name}${p.quantity != null ? ` — ${p.quantity.toLocaleString("en-IN")} pcs` : ""}${p.rate != null ? ` @ ₹${p.rate}/pc` : ""}`);
  return [
    `Dear ${vars.name?.trim() || "Sir/Madam"},`,
    "",
    "Thank you for your time on the call. As discussed:",
    ...lines,
    "",
    "Please let me know if you'd like to go ahead or need any changes.",
    "",
    `— ${vars.agent}, RarePrint${vars.agentPhone ? `, ${vars.agentPhone}` : ""}`,
  ].join("\n");
}

/** "Envelope × 5,000 @ ₹1.25" for call history. */
export function describeReplyProducts(products: ReplyProduct[] | null | undefined): string {
  return (products ?? [])
    .map((p) => `${p.productName ?? "Product"}${p.quantity != null ? ` × ${p.quantity.toLocaleString("en-IN")}` : ""}${p.rate != null ? ` @ ₹${p.rate}` : ""}`)
    .join(", ");
}
