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
  { value: "ALL", label: "All (follow-ups, new leads, not contacted)" },
  { value: "NEW_LEADS", label: "New leads" },
  { value: "NOT_CONTACTED", label: "Not contacted" },
  { value: "FOLLOW_UPS", label: "Follow-ups due" },
  { value: "INTERESTED", label: "Interested" },
  { value: "BUSY", label: "Busy (last call)" },
  { value: "NOT_ANSWERED", label: "Not answered (last call)" },
  { value: "NOT_INTERESTED", label: "Not interested" },
];

export const DIALER_SOURCE_LABELS: Record<string, string> = {
  FOLLOW_UP_DUE: "Follow-up due",
  FRESH_LEAD: "New lead",
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
  outcomeCampaigns: Partial<Record<DialerOutcome, string>>;
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
