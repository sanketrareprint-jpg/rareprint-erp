// backend/src/complaints/complaints.calc.ts
//
// Pure-function core of the complaint/ticket module: status-transition
// legality, SLA due-date math (incl. clock pausing), reopen-window and
// auto-close eligibility, escalation decisions, and ticket-number
// formatting/sequencing. Kept dependency-free (no Prisma/Nest) so it can be
// unit tested directly, same pattern as backend/src/loyalty/loyalty.calc.ts.

export type ComplaintStatus =
  | 'OPEN'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'PENDING_CUSTOMER'
  | 'PENDING_VENDOR'
  | 'RESOLVED'
  | 'CLOSED'
  | 'REOPENED';

export type ComplaintPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

// ── Status transition graph ──────────────────────────────────────────────
// OPEN → ASSIGNED → IN_PROGRESS → PENDING_CUSTOMER/PENDING_VENDOR → RESOLVED
//   → CLOSED → REOPENED → ASSIGNED (loop)
// Only the edges below are legal. Anything else (e.g. CLOSED → IN_PROGRESS
// directly) must be rejected — go through REOPENED instead.
export const COMPLAINT_STATUS_TRANSITIONS: Record<ComplaintStatus, ComplaintStatus[]> = {
  OPEN: ['ASSIGNED'],
  ASSIGNED: ['IN_PROGRESS', 'PENDING_CUSTOMER', 'PENDING_VENDOR'],
  IN_PROGRESS: ['PENDING_CUSTOMER', 'PENDING_VENDOR', 'RESOLVED'],
  PENDING_CUSTOMER: ['IN_PROGRESS', 'RESOLVED'],
  PENDING_VENDOR: ['IN_PROGRESS', 'RESOLVED'],
  RESOLVED: ['CLOSED'],
  CLOSED: ['REOPENED'],
  REOPENED: ['ASSIGNED'],
};

export function isValidStatusTransition(from: ComplaintStatus, to: ComplaintStatus): boolean {
  if (from === to) return false;
  return COMPLAINT_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

// ── SLA targets (defaults; overridable per-deployment via SystemConfig) ──
export interface SlaTargets {
  responseHours: number;
  resolutionHours: number;
}

export const DEFAULT_SLA_TARGETS: Record<ComplaintPriority, SlaTargets> = {
  URGENT: { responseHours: 1, resolutionHours: 8 },
  HIGH: { responseHours: 4, resolutionHours: 24 },
  MEDIUM: { responseHours: 8, resolutionHours: 48 },
  LOW: { responseHours: 24, resolutionHours: 96 },
};

export function computeSlaDueDates(
  createdAt: Date,
  priority: ComplaintPriority,
  targets: Record<ComplaintPriority, SlaTargets> = DEFAULT_SLA_TARGETS,
): { responseDueAt: Date; resolutionDueAt: Date } {
  const t = targets[priority] ?? DEFAULT_SLA_TARGETS[priority];
  return {
    responseDueAt: new Date(createdAt.getTime() + t.responseHours * 60 * 60 * 1000),
    resolutionDueAt: new Date(createdAt.getTime() + t.resolutionHours * 60 * 60 * 1000),
  };
}

// ── Clock pausing while PENDING_CUSTOMER / PENDING_VENDOR ───────────────
// Rather than a separate "paused" field, we derive paused duration from the
// ComplaintStatusLog history: sum the wall-clock time spent in either
// pending status, then push the resolution due date out by that amount.
export interface StatusInterval {
  status: ComplaintStatus;
  from: Date;
  to: Date;
}

const PAUSING_STATUSES: ComplaintStatus[] = ['PENDING_CUSTOMER', 'PENDING_VENDOR'];

export function computePausedDurationMs(intervals: StatusInterval[]): number {
  return intervals
    .filter((i) => PAUSING_STATUSES.includes(i.status))
    .reduce((sum, i) => sum + Math.max(0, i.to.getTime() - i.from.getTime()), 0);
}

export function effectiveResolutionDueAt(baseResolutionDueAt: Date, pausedDurationMs: number): Date {
  return new Date(baseResolutionDueAt.getTime() + Math.max(0, pausedDurationMs));
}

// ── Reopen window ─────────────────────────────────────────────────────────
export function canReopen(closedAt: Date | null | undefined, now: Date, windowDays: number): boolean {
  if (!closedAt) return false;
  const deadline = new Date(closedAt.getTime() + windowDays * 24 * 60 * 60 * 1000);
  return now.getTime() <= deadline.getTime();
}

// ── Auto-close (RESOLVED → CLOSED after N days with no customer response) ─
export function isEligibleForAutoClose(resolvedAt: Date | null | undefined, now: Date, autoCloseDays: number): boolean {
  if (!resolvedAt) return false;
  const deadline = new Date(resolvedAt.getTime() + autoCloseDays * 24 * 60 * 60 * 1000);
  return now.getTime() >= deadline.getTime();
}

// ── SLA breach / escalation ──────────────────────────────────────────────
const TERMINAL_STATUSES: ComplaintStatus[] = ['RESOLVED', 'CLOSED'];

export function isSlaBreached(resolutionDueAt: Date | null | undefined, now: Date, status: ComplaintStatus): boolean {
  if (!resolutionDueAt) return false;
  if (TERMINAL_STATUSES.includes(status)) return false;
  return now.getTime() > resolutionDueAt.getTime();
}

/** Should escalate now? Only true on the first breach — once escalatedToAdmin
 *  is set the cron must not fire again for the same ticket. */
export function shouldEscalate(params: {
  resolutionDueAt: Date | null | undefined;
  now: Date;
  status: ComplaintStatus;
  alreadyEscalated: boolean;
}): boolean {
  if (params.alreadyEscalated) return false;
  return isSlaBreached(params.resolutionDueAt, params.now, params.status);
}

// ── Ticket number formatting + concurrency-safe sequencing ──────────────
export function formatTicketNumber(year: number, sequence: number): string {
  return `CMP-${year}-${String(sequence).padStart(5, '0')}`;
}

/**
 * Generates a unique ticket number by trying sequential numbers starting at
 * `startSequence`, retrying on collision (e.g. a concurrent create already
 * took that number). `attemptCreate` should return true on success, false on
 * a unique-constraint collision (caller catches Prisma P2002 and maps it).
 */
export async function generateUniqueTicketNumber(
  year: number,
  startSequence: number,
  attemptCreate: (ticketNumber: string) => Promise<boolean>,
  maxAttempts = 5,
): Promise<string> {
  let seq = startSequence;
  for (let i = 0; i < maxAttempts; i++) {
    const ticketNumber = formatTicketNumber(year, seq);
    const ok = await attemptCreate(ticketNumber);
    if (ok) return ticketNumber;
    seq++;
  }
  throw new Error(`Could not generate a unique ticket number after ${maxAttempts} attempts`);
}
