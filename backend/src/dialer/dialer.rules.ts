// backend/src/dialer/dialer.rules.ts
//
// Pure business rules for the auto dialer — no database access, so the
// service and dialer.rules.spec.ts use the exact same logic.
import { DialerOutcome, LeadStatus } from '@prisma/client';

/** A number dialed in the last N minutes (by anyone) is skipped by GET /dialer/next. */
export const RECENT_CALL_SKIP_MINUTES = 30;
/** A lock older than this is treated as abandoned (app closed mid-call, etc.). */
export const DIALER_LOCK_MINUTES = 15;
/** Only these roles may use the dialer (prompt: SALES_AGENT and admin). */
export const DIALER_ROLES = ['SALES_AGENT', 'ADMIN'];
/** Longest note accepted from the outcome screen. */
export const MAX_NOTE_LENGTH = 2000;

const IST_OFFSET_MS = 330 * 60 * 1000; // India is UTC+5:30, no DST

export const DIALER_OUTCOMES: DialerOutcome[] = [
  DialerOutcome.INTERESTED,
  DialerOutcome.CALLBACK,
  DialerOutcome.NOT_ANSWERED,
  DialerOutcome.BUSY,
  DialerOutcome.WRONG_NUMBER,
  DialerOutcome.NOT_INTERESTED,
];

/** Start of "today" in India time, as a UTC instant (servers run in UTC). */
export function istDayStart(now: Date = new Date()): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - IST_OFFSET_MS);
}

/** Start of the current calendar month in India time, as a UTC instant. */
export function istMonthStart(now: Date = new Date()): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  ist.setUTCDate(1);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - IST_OFFSET_MS);
}

/** Periods for GET /dialer/agent-stats. */
export type AgentStatsPeriod = 'today' | '7d' | 'month';

/** Start of the stats window: today, the last 7 days (incl. today), or this month — India time. */
export function agentStatsSince(period: AgentStatsPeriod, now: Date = new Date()): Date {
  if (period === 'month') return istMonthStart(now);
  const dayStart = istDayStart(now);
  if (period === '7d') return new Date(dayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
  return dayStart;
}

/**
 * Every dialer call also writes a LeadActivity starting with this text (for
 * Leads). The agent-stats call count uses it to skip those activities, so a
 * dialer call isn't counted twice (once as DialerCall, once as CRM call).
 */
export const DIALER_ACTIVITY_PREFIX = 'Auto dialer call';

/** Last 10 digits — same normalization as call-compliance's normalizePhone. */
export function normalizeDialPhone(raw: unknown): string {
  return String(raw ?? '').replace(/\D/g, '').slice(-10);
}

// Pipeline order, used so the dialer never moves a lead backwards
// (e.g. a QUOTED lead saying "call me back" stays QUOTED).
const STATUS_RANK: Record<LeadStatus, number> = {
  NEW: 0,
  RECYCLED: 0,
  CONTACTED: 1,
  INTERESTED: 2,
  QUOTED: 3,
  WON: 4,
  LOST: -1,
};

/**
 * The status a lead / Not Contacted contact should move to after a dialer
 * call, or null to leave it unchanged.
 *   INTERESTED      → INTERESTED (only moves forward)
 *   CALLBACK        → CONTACTED  (only moves forward)
 *   NOT_INTERESTED  → LOST
 *   WRONG_NUMBER    → LOST
 *   NOT_ANSWERED / BUSY → unchanged
 */
export function nextStatusForOutcome(current: LeadStatus, outcome: DialerOutcome): LeadStatus | null {
  const forwardTo = (target: LeadStatus) =>
    current !== target && (current === LeadStatus.LOST || STATUS_RANK[current] < STATUS_RANK[target]) ? target : null;

  switch (outcome) {
    case DialerOutcome.INTERESTED:
      return forwardTo(LeadStatus.INTERESTED);
    case DialerOutcome.CALLBACK:
      return forwardTo(LeadStatus.CONTACTED);
    case DialerOutcome.NOT_INTERESTED:
    case DialerOutcome.WRONG_NUMBER:
      return current === LeadStatus.LOST ? null : LeadStatus.LOST;
    default:
      return null;
  }
}

/**
 * Whether the call actually reached a conclusion. Conclusive calls close the
 * follow-up that brought the lead into the queue (plus any older overdue
 * ones, so an old auto follow-up doesn't pull the lead back in). Not
 * answered / busy leave follow-ups open so the lead is retried.
 */
export function isConclusiveOutcome(outcome: DialerOutcome): boolean {
  return outcome !== DialerOutcome.NOT_ANSWERED && outcome !== DialerOutcome.BUSY;
}

/**
 * Whether a pending follow-up is already answered by a dialer call to the
 * same number — possibly made through a different Lead row with that phone
 * (a CSV imported twice), so the call never closed this follow-up itself:
 *   - a conclusive call after the follow-up fell due, or
 *   - a NOT_INTERESTED call after the follow-up was created (the CSV import's
 *     Day 3/7/14/30 follow-ups on a lead that already said no).
 * Follow-ups created by a call (Callback, 30-day recycle) are created after
 * that call is saved, so the call that created them never cancels them.
 */
export function isFollowUpAnsweredByCall(
  followUp: { scheduledAt: Date; createdAt: Date },
  call: { outcome: DialerOutcome; startedAt: Date; createdAt: Date },
): boolean {
  if (isConclusiveOutcome(call.outcome) && call.startedAt >= followUp.scheduledAt) return true;
  return call.outcome === DialerOutcome.NOT_INTERESTED && call.createdAt > followUp.createdAt;
}

/** NOT_INTERESTED gets the same 30-day recycle check as CrmService.updateStatus(LOST). WRONG_NUMBER never does. */
export function wantsRecycleFollowUp(outcome: DialerOutcome): boolean {
  return outcome === DialerOutcome.NOT_INTERESTED;
}

// ── Reply details: why not interested, which products ─────────────────────

/** Why a customer is not interested (DialerCall.notInterestedReason). */
export const NOT_INTERESTED_REASONS = ['RATE', 'QUANTITY', 'TRUST', 'NO_REQUIREMENT'] as const;
export type NotInterestedReason = (typeof NOT_INTERESTED_REASONS)[number];
export const NOT_INTERESTED_REASON_LABELS: Record<NotInterestedReason, string> = {
  RATE: 'Rate problem',
  QUANTITY: 'Quantity problem',
  TRUST: 'Trust problem',
  NO_REQUIREMENT: 'No requirement',
};
/** Most products one reply may list. */
export const MAX_REPLY_PRODUCTS = 20;

/**
 * A product the customer talked about. quantity = units they need;
 * rate = ₹ per unit typed by the agent (Interested: the rate discussed;
 * Rate problem: the rate the customer is asking for), null when not given.
 * productName is filled in by the service from the Product table.
 */
export interface ReplyProduct { productId: string; quantity: number; rate: number | null; productName?: string; }

/**
 * Which replies carry products:
 *   INTERESTED                  — optional, quantity + rate
 *   NOT_INTERESTED / RATE       — at least one, quantity + asking rate
 *   NOT_INTERESTED / QUANTITY   — at least one, quantity only
 *   anything else               — none
 */
export function replyProductRule(outcome: DialerOutcome, reason: NotInterestedReason | null): 'none' | 'optional' | 'required' {
  if (outcome === DialerOutcome.INTERESTED) return 'optional';
  if (outcome === DialerOutcome.NOT_INTERESTED && (reason === 'RATE' || reason === 'QUANTITY')) return 'required';
  return 'none';
}

function parseReplyProducts(raw: unknown, allowRate: boolean): { ok: true; value: ReplyProduct[] } | { ok: false; error: string } {
  if (raw == null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, error: 'products must be a list' };
  if (raw.length > MAX_REPLY_PRODUCTS) return { ok: false, error: `At most ${MAX_REPLY_PRODUCTS} products` };
  const out: ReplyProduct[] = [];
  for (const [i, p] of raw.entries()) {
    const productId = typeof p?.productId === 'string' ? p.productId.trim() : '';
    if (!productId) return { ok: false, error: `Product ${i + 1}: choose a product` };
    const quantity = Number(p?.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) return { ok: false, error: `Product ${i + 1}: quantity must be a whole number above 0` };
    let rate: number | null = null;
    if (allowRate && p?.rate != null && p.rate !== '') {
      rate = Number(p.rate);
      if (!Number.isFinite(rate) || rate < 0) return { ok: false, error: `Product ${i + 1}: rate must be a number ≥ 0` };
    }
    out.push({ productId, quantity, rate });
  }
  return { ok: true, value: out };
}

export interface DialerResultInput {
  leadId: string | null;
  importedContactId: string | null;
  followUpId: string | null;
  phone: string;
  startedAt: Date;
  durationSec: number;
  answered: boolean;
  outcome: DialerOutcome;
  note: string | null;
  callbackAt: Date | null;
  notInterestedReason: NotInterestedReason | null;
  products: ReplyProduct[];
}

const trimmedOrNull = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

interface OutcomeFields {
  outcome: DialerOutcome;
  note: string | null;
  callbackAt: Date | null;
  notInterestedReason: NotInterestedReason | null;
  products: ReplyProduct[];
}

/** outcome / note / callbackAt / reason / products — shared by POST /dialer/result and POST /dialer/desk-response. */
function parseOutcomeFields(
  body: any,
  now: Date,
): { ok: true; value: OutcomeFields } | { ok: false; error: string } {
  const outcome = body?.outcome as DialerOutcome;
  if (!DIALER_OUTCOMES.includes(outcome)) {
    return { ok: false, error: `outcome must be one of ${DIALER_OUTCOMES.join(', ')}` };
  }

  const note = trimmedOrNull(body?.note);
  if (note && note.length > MAX_NOTE_LENGTH) return { ok: false, error: `note is longer than ${MAX_NOTE_LENGTH} characters` };

  let callbackAt: Date | null = null;
  if (outcome === DialerOutcome.CALLBACK) {
    if (body?.callbackAt == null || body.callbackAt === '') return { ok: false, error: 'callbackAt is required when outcome is CALLBACK' };
    callbackAt = new Date(body.callbackAt);
    if (Number.isNaN(callbackAt.getTime())) return { ok: false, error: 'callbackAt is not a valid date' };
    if (callbackAt.getTime() < now.getTime() - 60 * 1000) return { ok: false, error: 'callbackAt must be in the future' };
  }

  // Reason: only for NOT_INTERESTED, and optional there so an older app
  // screen that doesn't send one still saves.
  let notInterestedReason: NotInterestedReason | null = null;
  const rawReason = trimmedOrNull(body?.notInterestedReason);
  if (rawReason) {
    if (outcome !== DialerOutcome.NOT_INTERESTED) return { ok: false, error: 'notInterestedReason is only for NOT_INTERESTED' };
    if (!(NOT_INTERESTED_REASONS as readonly string[]).includes(rawReason)) {
      return { ok: false, error: `notInterestedReason must be one of ${NOT_INTERESTED_REASONS.join(', ')}` };
    }
    notInterestedReason = rawReason as NotInterestedReason;
  }

  const productRule = replyProductRule(outcome, notInterestedReason);
  const parsedProducts = parseReplyProducts(body?.products, notInterestedReason !== 'QUANTITY');
  if ('error' in parsedProducts) return parsedProducts;
  const products = parsedProducts.value;
  if (productRule === 'none' && products.length) return { ok: false, error: 'Products can only be given for Interested, or Not interested because of rate / quantity' };
  if (productRule === 'required' && !products.length) return { ok: false, error: 'Choose the product (and quantity) the customer asked about' };

  return { ok: true, value: { outcome, note, callbackAt, notInterestedReason, products } };
}

/** "Envelope 10x4 × 5,000 @ ₹1.2" lines for activity notes. */
export function describeReplyProducts(products: ReplyProduct[]): string {
  return products
    .map((p) => `${p.productName ?? p.productId} × ${p.quantity.toLocaleString('en-IN')}${p.rate != null ? ` @ ₹${p.rate}` : ''}`)
    .join(', ');
}

/** Validates the POST /dialer/result body. Returns the parsed input, or an error message. */
export function parseDialerResult(body: any, now: Date = new Date()): { ok: true; value: DialerResultInput } | { ok: false; error: string } {
  const str = trimmedOrNull;

  const leadId = str(body?.leadId);
  const importedContactId = str(body?.importedContactId);
  if (!leadId && !importedContactId) return { ok: false, error: 'leadId or importedContactId is required' };

  const phone = normalizeDialPhone(body?.number ?? body?.phone);
  if (phone.length < 6) return { ok: false, error: 'number is required' };

  const fields = parseOutcomeFields(body, now);
  if ('error' in fields) return fields;
  const { outcome, note, callbackAt, notInterestedReason, products } = fields.value;

  const startedAt = body?.startedAt != null ? new Date(body.startedAt) : now;
  if (Number.isNaN(startedAt.getTime())) return { ok: false, error: 'startedAt is not a valid date' };
  if (startedAt.getTime() > now.getTime() + 5 * 60 * 1000) return { ok: false, error: 'startedAt is in the future' };

  const durationSec = body?.durationSec == null ? 0 : Number(body.durationSec);
  if (!Number.isInteger(durationSec) || durationSec < 0) return { ok: false, error: 'durationSec must be a whole number ≥ 0' };

  const answered = body?.answered == null ? durationSec > 0 : body.answered === true;

  return {
    ok: true,
    value: {
      leadId,
      importedContactId,
      followUpId: str(body?.followUpId),
      phone,
      startedAt,
      durationSec,
      answered,
      outcome,
      note,
      callbackAt,
      notInterestedReason,
      products,
    },
  };
}

/** "2m 05s" style duration for activity descriptions. */
export function formatDuration(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
}

// ── Dial lists (GET /dialer/next?list=) ───────────────────────────────────

/**
 * Which numbers the agent dials:
 *   ALL            — the default queue order (follow-ups due, new leads, not contacted, older follow-ups)
 *   NEW_LEADS      — NEW leads never called
 *   NOT_CONTACTED  — Not Contacted contacts
 *   FOLLOW_UPS     — follow-ups due today, then older ones
 *   INTERESTED     — leads / contacts in INTERESTED status
 *   NOT_INTERESTED — leads / contacts in LOST status (wrong numbers stay skipped)
 *   BUSY / NOT_ANSWERED / CALLBACK — numbers whose last auto-dialer call ended that way
 *   NI_RATE / NI_QUANTITY / NI_TRUST / NI_NO_REQUIREMENT — last auto-dialer
 *                    call was Not interested for that reason (NI_LIST_REASONS)
 */
export const DIALER_LISTS = [
  'ALL', 'NEW_LEADS', 'NOT_CONTACTED', 'FOLLOW_UPS', 'INTERESTED', 'NOT_INTERESTED', 'BUSY', 'NOT_ANSWERED',
  'CALLBACK', 'NI_RATE', 'NI_QUANTITY', 'NI_TRUST', 'NI_NO_REQUIREMENT',
] as const;
/** Not-interested-reason dial lists → the reason they dial. */
export const NI_LIST_REASONS: Partial<Record<(typeof DIALER_LISTS)[number], NotInterestedReason>> = {
  NI_RATE: 'RATE',
  NI_QUANTITY: 'QUANTITY',
  NI_TRUST: 'TRUST',
  NI_NO_REQUIREMENT: 'NO_REQUIREMENT',
};
export type DialerList = (typeof DIALER_LISTS)[number];

export function parseDialerList(raw: unknown): DialerList | null {
  if (raw == null || raw === '') return 'ALL';
  return (DIALER_LISTS as readonly string[]).includes(String(raw)) ? (String(raw) as DialerList) : null;
}

// ── Response typed on the PC while the phone dials (POST /dialer/desk-response) ──

/** The PC popup only shows a number the phone took within this long. */
export const LIVE_CALL_MAX_MINUTES = 60;

export interface DeskResponseInput extends OutcomeFields {
  phone: string;
}

export function parseDeskResponse(body: any, now: Date = new Date()): { ok: true; value: DeskResponseInput } | { ok: false; error: string } {
  const phone = normalizeDialPhone(body?.number ?? body?.phone);
  if (phone.length < 6) return { ok: false, error: 'number is required' };
  const fields = parseOutcomeFields(body, now);
  if ('error' in fields) return fields;
  return { ok: true, value: { phone, ...fields.value } };
}

/**
 * A response saved on the lock counts only if it was typed after the lock was
 * taken — a lock taken over by another agent (lockedAt reset) never inherits
 * an earlier agent's answer.
 */
export function isDeskResponseCurrent(lock: { lockedAt: Date; deskOutcome: DialerOutcome | null; deskSubmittedAt: Date | null }): boolean {
  return !!lock.deskOutcome && !!lock.deskSubmittedAt && lock.deskSubmittedAt.getTime() >= lock.lockedAt.getTime();
}

/** Same rule for "End call" pressed on the PC: only a press made after the lock was taken counts. */
export function isEndCallRequestCurrent(lock: { lockedAt: Date; deskEndCallAt: Date | null }): boolean {
  return !!lock.deskEndCallAt && lock.deskEndCallAt.getTime() >= lock.lockedAt.getTime();
}

// ── Dialer settings (SystemConfig 'dialer_settings') ──────────────────────

export const DIALER_SETTINGS_KEY = 'dialer_settings';
const MAX_RATE_LISTS = 50;
const MAX_RATE_LIST_NAME = 80;
const MAX_RATE_LIST_MESSAGE = 3000; // stays well inside a WhatsApp Web link's length
const CAMPAIGN_NAME_RE = /^[A-Za-z0-9_\-]{1,100}$/;
/** No WhatsApp goes to a number marked wrong. */
export const CAMPAIGN_OUTCOMES: DialerOutcome[] = DIALER_OUTCOMES.filter((o) => o !== DialerOutcome.WRONG_NUMBER);
/** The same outcome's campaign isn't sent to one number twice within this window. */
export const OUTCOME_CAMPAIGN_REPEAT_HOURS = 24;

/** A ready-made product / rate message the agent sends from their WhatsApp Web. */
export interface RateList { id: string; name: string; message: string; }

export interface DialerSettings {
  rateLists: RateList[];
  /** AiSensy API campaign name per outcome; missing = send nothing. */
  outcomeCampaigns: Partial<Record<DialerOutcome, string>>;
}

export const EMPTY_DIALER_SETTINGS: DialerSettings = { rateLists: [], outcomeCampaigns: {} };

/** Validates PUT /dialer/settings (and is used to read the stored JSON safely). */
export function parseDialerSettings(body: any): { ok: true; value: DialerSettings } | { ok: false; error: string } {
  const rawLists = body?.rateLists ?? [];
  if (!Array.isArray(rawLists)) return { ok: false, error: 'rateLists must be a list' };
  if (rawLists.length > MAX_RATE_LISTS) return { ok: false, error: `At most ${MAX_RATE_LISTS} rate lists` };

  const rateLists: RateList[] = [];
  const ids = new Set<string>();
  for (const [i, r] of rawLists.entries()) {
    const name = trimmedOrNull(r?.name);
    const message = trimmedOrNull(r?.message);
    if (!name) return { ok: false, error: `Rate list ${i + 1}: name is required` };
    if (name.length > MAX_RATE_LIST_NAME) return { ok: false, error: `Rate list "${name}": name is longer than ${MAX_RATE_LIST_NAME} characters` };
    if (!message) return { ok: false, error: `Rate list "${name}": message is required` };
    if (message.length > MAX_RATE_LIST_MESSAGE) return { ok: false, error: `Rate list "${name}": message is longer than ${MAX_RATE_LIST_MESSAGE} characters` };
    let id = trimmedOrNull(r?.id) ?? `rl_${i}_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30)}`;
    while (ids.has(id)) id = `${id}_${i}`;
    ids.add(id);
    rateLists.push({ id, name, message });
  }

  const rawCampaigns = body?.outcomeCampaigns ?? {};
  if (typeof rawCampaigns !== 'object' || Array.isArray(rawCampaigns)) return { ok: false, error: 'outcomeCampaigns must be an object' };
  const outcomeCampaigns: Partial<Record<DialerOutcome, string>> = {};
  for (const [key, value] of Object.entries(rawCampaigns)) {
    if (!CAMPAIGN_OUTCOMES.includes(key as DialerOutcome)) return { ok: false, error: `No WhatsApp campaign can be set for "${key}"` };
    const name = trimmedOrNull(value);
    if (!name) continue; // blank = send nothing for this outcome
    if (!CAMPAIGN_NAME_RE.test(name)) return { ok: false, error: `Campaign name "${name}" may only use letters, numbers, _ and -` };
    outcomeCampaigns[key as DialerOutcome] = name;
  }

  return { ok: true, value: { rateLists, outcomeCampaigns } };
}

/**
 * AiSensy template variables for every outcome campaign, in order:
 *   {{1}} customer name, {{2}} agent name, {{3}} agent phone.
 * Every outcome template must have exactly these three variables.
 */
export function outcomeCampaignParams(customerName: string | null, agentName: string, agentPhone: string): string[] {
  return [customerName?.trim() || 'Customer', agentName.trim(), agentPhone.trim()];
}
