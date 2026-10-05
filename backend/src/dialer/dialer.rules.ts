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

/** NOT_INTERESTED gets the same 30-day recycle check as CrmService.updateStatus(LOST). WRONG_NUMBER never does. */
export function wantsRecycleFollowUp(outcome: DialerOutcome): boolean {
  return outcome === DialerOutcome.NOT_INTERESTED;
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
}

/** Validates the POST /dialer/result body. Returns the parsed input, or an error message. */
export function parseDialerResult(body: any, now: Date = new Date()): { ok: true; value: DialerResultInput } | { ok: false; error: string } {
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

  const leadId = str(body?.leadId);
  const importedContactId = str(body?.importedContactId);
  if (!leadId && !importedContactId) return { ok: false, error: 'leadId or importedContactId is required' };

  const phone = normalizeDialPhone(body?.number ?? body?.phone);
  if (phone.length < 6) return { ok: false, error: 'number is required' };

  const outcome = body?.outcome as DialerOutcome;
  if (!DIALER_OUTCOMES.includes(outcome)) {
    return { ok: false, error: `outcome must be one of ${DIALER_OUTCOMES.join(', ')}` };
  }

  const startedAt = body?.startedAt != null ? new Date(body.startedAt) : now;
  if (Number.isNaN(startedAt.getTime())) return { ok: false, error: 'startedAt is not a valid date' };
  if (startedAt.getTime() > now.getTime() + 5 * 60 * 1000) return { ok: false, error: 'startedAt is in the future' };

  const durationSec = body?.durationSec == null ? 0 : Number(body.durationSec);
  if (!Number.isInteger(durationSec) || durationSec < 0) return { ok: false, error: 'durationSec must be a whole number ≥ 0' };

  const answered = body?.answered == null ? durationSec > 0 : body.answered === true;

  const note = str(body?.note);
  if (note && note.length > MAX_NOTE_LENGTH) return { ok: false, error: `note is longer than ${MAX_NOTE_LENGTH} characters` };

  let callbackAt: Date | null = null;
  if (outcome === DialerOutcome.CALLBACK) {
    if (body?.callbackAt == null || body.callbackAt === '') return { ok: false, error: 'callbackAt is required when outcome is CALLBACK' };
    callbackAt = new Date(body.callbackAt);
    if (Number.isNaN(callbackAt.getTime())) return { ok: false, error: 'callbackAt is not a valid date' };
    if (callbackAt.getTime() < now.getTime() - 60 * 1000) return { ok: false, error: 'callbackAt must be in the future' };
  }

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
    },
  };
}

/** "2m 05s" style duration for activity descriptions. */
export function formatDuration(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
}
