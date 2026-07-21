/**
 * BUSINESS RULE: Complaint / Ticket Lifecycle (see complaint-ticket-module-spec.md)
 *
 * RULE 1 — Only forward transitions in the lifecycle graph are legal:
 *   OPEN → ASSIGNED → IN_PROGRESS → PENDING_CUSTOMER/PENDING_VENDOR → RESOLVED
 *     → CLOSED → REOPENED → ASSIGNED (loop). e.g. CLOSED → IN_PROGRESS directly
 *   must be rejected — it has to go through REOPENED first.
 * RULE 2 — SLA due dates are computed from priority-specific response/resolution
 *   hour targets (SystemConfig-backed, defaults in DEFAULT_SLA_TARGETS).
 * RULE 3 — The resolution SLA clock pauses while a ticket sits in
 *   PENDING_CUSTOMER or PENDING_VENDOR — that wall-clock time is added back
 *   onto the due date rather than counted against the agent.
 * RULE 4 — REOPENED is only legal within a configurable window (default 7
 *   days) after closedAt.
 * RULE 5 — SLA escalation fires exactly once per breach (guarded by
 *   escalatedToAdmin).
 * RULE 6 — ticketNumber generation retries sequentially on collision so
 *   concurrent creates never produce a duplicate.
 *
 * These are pure functions (no Prisma/I/O) so they're tested directly here,
 * the same way dispatch.business-rules.spec.ts and loyalty.calc.spec.ts test
 * their respective guards.
 */

import {
  DEFAULT_SLA_TARGETS,
  canReopen,
  computePausedDurationMs,
  computeSlaDueDates,
  effectiveResolutionDueAt,
  formatTicketNumber,
  generateUniqueTicketNumber,
  isEligibleForAutoClose,
  isSlaBreached,
  isValidStatusTransition,
  shouldEscalate,
} from './complaints.calc';

describe('isValidStatusTransition (RULE 1)', () => {
  it('allows every edge in the documented lifecycle graph', () => {
    expect(isValidStatusTransition('OPEN', 'ASSIGNED')).toBe(true);
    expect(isValidStatusTransition('ASSIGNED', 'IN_PROGRESS')).toBe(true);
    expect(isValidStatusTransition('ASSIGNED', 'PENDING_CUSTOMER')).toBe(true);
    expect(isValidStatusTransition('ASSIGNED', 'PENDING_VENDOR')).toBe(true);
    expect(isValidStatusTransition('IN_PROGRESS', 'PENDING_CUSTOMER')).toBe(true);
    expect(isValidStatusTransition('IN_PROGRESS', 'PENDING_VENDOR')).toBe(true);
    expect(isValidStatusTransition('IN_PROGRESS', 'RESOLVED')).toBe(true);
    expect(isValidStatusTransition('PENDING_CUSTOMER', 'IN_PROGRESS')).toBe(true);
    expect(isValidStatusTransition('PENDING_CUSTOMER', 'RESOLVED')).toBe(true);
    expect(isValidStatusTransition('PENDING_VENDOR', 'IN_PROGRESS')).toBe(true);
    expect(isValidStatusTransition('PENDING_VENDOR', 'RESOLVED')).toBe(true);
    expect(isValidStatusTransition('RESOLVED', 'CLOSED')).toBe(true);
    expect(isValidStatusTransition('CLOSED', 'REOPENED')).toBe(true);
    expect(isValidStatusTransition('REOPENED', 'ASSIGNED')).toBe(true);
  });

  it('rejects CLOSED → IN_PROGRESS directly — must go through REOPENED', () => {
    expect(isValidStatusTransition('CLOSED', 'IN_PROGRESS')).toBe(false);
  });

  it('rejects skipping ASSIGNED — OPEN → IN_PROGRESS directly', () => {
    expect(isValidStatusTransition('OPEN', 'IN_PROGRESS')).toBe(false);
  });

  it('rejects RESOLVED → REOPENED directly — must be CLOSED first', () => {
    expect(isValidStatusTransition('RESOLVED', 'REOPENED')).toBe(false);
  });

  it('rejects backward transitions, e.g. IN_PROGRESS → OPEN', () => {
    expect(isValidStatusTransition('IN_PROGRESS', 'OPEN')).toBe(false);
  });

  it('rejects a no-op transition to the same status', () => {
    expect(isValidStatusTransition('IN_PROGRESS', 'IN_PROGRESS')).toBe(false);
  });

  it('rejects transitions out of the terminal CLOSED status other than REOPENED', () => {
    expect(isValidStatusTransition('CLOSED', 'RESOLVED')).toBe(false);
    expect(isValidStatusTransition('CLOSED', 'ASSIGNED')).toBe(false);
  });
});

describe('computeSlaDueDates (RULE 2)', () => {
  const createdAt = new Date('2026-07-21T10:00:00.000Z');

  it('URGENT: 1h response / 8h resolution by default', () => {
    const { responseDueAt, resolutionDueAt } = computeSlaDueDates(createdAt, 'URGENT');
    expect(responseDueAt.toISOString()).toBe('2026-07-21T11:00:00.000Z');
    expect(resolutionDueAt.toISOString()).toBe('2026-07-21T18:00:00.000Z');
  });

  it('LOW: 24h response / 96h resolution by default', () => {
    const { responseDueAt, resolutionDueAt } = computeSlaDueDates(createdAt, 'LOW');
    expect(responseDueAt.toISOString()).toBe('2026-07-22T10:00:00.000Z');
    expect(resolutionDueAt.toISOString()).toBe('2026-07-25T10:00:00.000Z');
  });

  it('respects configurable SystemConfig-backed targets instead of defaults', () => {
    const customTargets = { ...DEFAULT_SLA_TARGETS, HIGH: { responseHours: 2, resolutionHours: 12 } };
    const { responseDueAt, resolutionDueAt } = computeSlaDueDates(createdAt, 'HIGH', customTargets);
    expect(responseDueAt.toISOString()).toBe('2026-07-21T12:00:00.000Z');
    expect(resolutionDueAt.toISOString()).toBe('2026-07-21T22:00:00.000Z');
  });
});

describe('SLA clock pausing during PENDING_CUSTOMER / PENDING_VENDOR (RULE 3)', () => {
  it('sums only the paused-status intervals, ignoring active ones', () => {
    const intervals = [
      { status: 'OPEN' as const, from: new Date('2026-07-21T00:00:00Z'), to: new Date('2026-07-21T01:00:00Z') },
      { status: 'ASSIGNED' as const, from: new Date('2026-07-21T01:00:00Z'), to: new Date('2026-07-21T02:00:00Z') },
      { status: 'PENDING_CUSTOMER' as const, from: new Date('2026-07-21T02:00:00Z'), to: new Date('2026-07-21T05:00:00Z') }, // 3h paused
      { status: 'IN_PROGRESS' as const, from: new Date('2026-07-21T05:00:00Z'), to: new Date('2026-07-21T06:00:00Z') },
      { status: 'PENDING_VENDOR' as const, from: new Date('2026-07-21T06:00:00Z'), to: new Date('2026-07-21T08:30:00Z') }, // 2.5h paused
    ];
    const pausedMs = computePausedDurationMs(intervals);
    expect(pausedMs).toBe((3 + 2.5) * 60 * 60 * 1000);
  });

  it('zero paused time when the ticket never entered a pending status', () => {
    const intervals = [
      { status: 'OPEN' as const, from: new Date('2026-07-21T00:00:00Z'), to: new Date('2026-07-21T01:00:00Z') },
      { status: 'ASSIGNED' as const, from: new Date('2026-07-21T01:00:00Z'), to: new Date('2026-07-21T02:00:00Z') },
    ];
    expect(computePausedDurationMs(intervals)).toBe(0);
  });

  it('effectiveResolutionDueAt pushes the due date out by the paused duration', () => {
    const base = new Date('2026-07-21T18:00:00.000Z');
    const pausedMs = 3 * 60 * 60 * 1000; // 3h paused
    const effective = effectiveResolutionDueAt(base, pausedMs);
    expect(effective.toISOString()).toBe('2026-07-21T21:00:00.000Z');
  });
});

describe('canReopen — reopen window enforcement (RULE 4)', () => {
  it('allows reopening the day after closing, well within a 7-day window', () => {
    const closedAt = new Date('2026-07-21T00:00:00Z');
    const now = new Date('2026-07-22T00:00:00Z');
    expect(canReopen(closedAt, now, 7)).toBe(true);
  });

  it('allows reopening exactly at the deadline', () => {
    const closedAt = new Date('2026-07-21T00:00:00Z');
    const now = new Date('2026-07-28T00:00:00Z'); // exactly 7 days later
    expect(canReopen(closedAt, now, 7)).toBe(true);
  });

  it('rejects reopening one second past the window', () => {
    const closedAt = new Date('2026-07-21T00:00:00Z');
    const now = new Date('2026-07-28T00:00:01Z');
    expect(canReopen(closedAt, now, 7)).toBe(false);
  });

  it('rejects reopening a ticket that was never closed', () => {
    expect(canReopen(null, new Date(), 7)).toBe(false);
  });

  it('respects a configurable window instead of the 7-day default', () => {
    const closedAt = new Date('2026-07-21T00:00:00Z');
    const now = new Date('2026-07-24T00:00:00Z'); // 3 days later
    expect(canReopen(closedAt, now, 2)).toBe(false); // 2-day window already expired
    expect(canReopen(closedAt, now, 3)).toBe(true); // exactly at a 3-day window
  });
});

describe('isEligibleForAutoClose — RESOLVED → CLOSED after N days idle', () => {
  it('not eligible before the configured window elapses', () => {
    const resolvedAt = new Date('2026-07-21T00:00:00Z');
    const now = new Date('2026-07-23T00:00:00Z'); // 2 days later
    expect(isEligibleForAutoClose(resolvedAt, now, 3)).toBe(false);
  });

  it('eligible once the configured window has elapsed', () => {
    const resolvedAt = new Date('2026-07-21T00:00:00Z');
    const now = new Date('2026-07-24T00:00:00Z'); // 3 days later
    expect(isEligibleForAutoClose(resolvedAt, now, 3)).toBe(true);
  });

  it('never eligible for a ticket that was never resolved', () => {
    expect(isEligibleForAutoClose(null, new Date(), 3)).toBe(false);
  });
});

describe('SLA breach + escalation firing exactly once (RULE 5)', () => {
  const resolutionDueAt = new Date('2026-07-21T18:00:00Z');

  it('isSlaBreached true once now passes the due date on an active ticket', () => {
    expect(isSlaBreached(resolutionDueAt, new Date('2026-07-21T19:00:00Z'), 'IN_PROGRESS')).toBe(true);
  });

  it('isSlaBreached false before the due date', () => {
    expect(isSlaBreached(resolutionDueAt, new Date('2026-07-21T17:00:00Z'), 'IN_PROGRESS')).toBe(false);
  });

  it('isSlaBreached false for RESOLVED/CLOSED tickets even past due date — already handled', () => {
    expect(isSlaBreached(resolutionDueAt, new Date('2026-07-22T00:00:00Z'), 'RESOLVED')).toBe(false);
    expect(isSlaBreached(resolutionDueAt, new Date('2026-07-22T00:00:00Z'), 'CLOSED')).toBe(false);
  });

  it('shouldEscalate true on first breach (not yet escalated)', () => {
    const escalate = shouldEscalate({
      resolutionDueAt,
      now: new Date('2026-07-21T19:00:00Z'),
      status: 'IN_PROGRESS',
      alreadyEscalated: false,
    });
    expect(escalate).toBe(true);
  });

  it('shouldEscalate false on subsequent cron runs once already escalated — fires exactly once', () => {
    const escalate = shouldEscalate({
      resolutionDueAt,
      now: new Date('2026-07-22T09:00:00Z'), // still breached, cron running again
      status: 'IN_PROGRESS',
      alreadyEscalated: true,
    });
    expect(escalate).toBe(false);
  });
});

describe('Ticket number formatting + concurrency-safe sequencing (RULE 6)', () => {
  it('formats as CMP-{year}-{5-digit zero-padded sequence}', () => {
    expect(formatTicketNumber(2026, 1)).toBe('CMP-2026-00001');
    expect(formatTicketNumber(2026, 42)).toBe('CMP-2026-00042');
    expect(formatTicketNumber(2026, 100000)).toBe('CMP-2026-100000');
  });

  it('returns the first sequence number when there is no collision', async () => {
    const attemptCreate = jest.fn(async () => true);
    const ticketNumber = await generateUniqueTicketNumber(2026, 1, attemptCreate);
    expect(ticketNumber).toBe('CMP-2026-00001');
    expect(attemptCreate).toHaveBeenCalledTimes(1);
  });

  it('retries with the next sequence number on a concurrent collision', async () => {
    // Simulates two requests racing for CMP-2026-00050: the first wins, this
    // caller's attempt at 00050 collides, then 00051 succeeds.
    const attempted: string[] = [];
    const attemptCreate = jest.fn(async (ticketNumber: string) => {
      attempted.push(ticketNumber);
      return ticketNumber !== 'CMP-2026-00050';
    });
    const ticketNumber = await generateUniqueTicketNumber(2026, 50, attemptCreate);
    expect(ticketNumber).toBe('CMP-2026-00051');
    expect(attempted).toEqual(['CMP-2026-00050', 'CMP-2026-00051']);
  });

  it('gives up after maxAttempts consecutive collisions', async () => {
    const attemptCreate = jest.fn(async () => false);
    await expect(generateUniqueTicketNumber(2026, 1, attemptCreate, 3)).rejects.toThrow(
      'Could not generate a unique ticket number after 3 attempts',
    );
    expect(attemptCreate).toHaveBeenCalledTimes(3);
  });
});
