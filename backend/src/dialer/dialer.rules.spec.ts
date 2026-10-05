/**
 * BUSINESS RULES: Auto dialer (backend/src/dialer/dialer.rules.ts)
 *
 * RULE 1 — Outcome → status: INTERESTED → INTERESTED, CALLBACK → CONTACTED
 *   (both only move a lead forward, never backwards), NOT_INTERESTED and
 *   WRONG_NUMBER → LOST, NOT_ANSWERED / BUSY leave the status alone.
 * RULE 2 — Only answered-type outcomes close follow-ups; NOT_ANSWERED / BUSY
 *   keep them open so the lead is retried.
 * RULE 3 — NOT_INTERESTED gets the 30-day recycle check; WRONG_NUMBER never does.
 * RULE 4 — POST /dialer/result input is validated (lead or contact, number,
 *   known outcome, CALLBACK needs a future callbackAt, sane duration/date).
 * RULE 5 — "Today" for session stats starts at midnight India time.
 * RULE 6 — Skip window is 30 minutes (agreed with Sanket 2026-10-05).
 *
 * If these tests fail after a code change, a dialer rule has been broken.
 */
import { DialerOutcome, LeadStatus } from '@prisma/client';
import {
  RECENT_CALL_SKIP_MINUTES,
  formatDuration,
  isConclusiveOutcome,
  istDayStart,
  nextStatusForOutcome,
  normalizeDialPhone,
  parseDialerResult,
  wantsRecycleFollowUp,
} from './dialer.rules';

describe('dialer rules — outcome → status (RULE 1)', () => {
  it('INTERESTED moves NEW/CONTACTED forward, never QUOTED/WON backwards', () => {
    expect(nextStatusForOutcome(LeadStatus.NEW, DialerOutcome.INTERESTED)).toBe(LeadStatus.INTERESTED);
    expect(nextStatusForOutcome(LeadStatus.CONTACTED, DialerOutcome.INTERESTED)).toBe(LeadStatus.INTERESTED);
    expect(nextStatusForOutcome(LeadStatus.INTERESTED, DialerOutcome.INTERESTED)).toBeNull();
    expect(nextStatusForOutcome(LeadStatus.QUOTED, DialerOutcome.INTERESTED)).toBeNull();
    expect(nextStatusForOutcome(LeadStatus.WON, DialerOutcome.INTERESTED)).toBeNull();
  });

  it('INTERESTED revives a LOST lead', () => {
    expect(nextStatusForOutcome(LeadStatus.LOST, DialerOutcome.INTERESTED)).toBe(LeadStatus.INTERESTED);
  });

  it('CALLBACK moves NEW/RECYCLED to CONTACTED but keeps INTERESTED/QUOTED', () => {
    expect(nextStatusForOutcome(LeadStatus.NEW, DialerOutcome.CALLBACK)).toBe(LeadStatus.CONTACTED);
    expect(nextStatusForOutcome(LeadStatus.RECYCLED, DialerOutcome.CALLBACK)).toBe(LeadStatus.CONTACTED);
    expect(nextStatusForOutcome(LeadStatus.INTERESTED, DialerOutcome.CALLBACK)).toBeNull();
    expect(nextStatusForOutcome(LeadStatus.QUOTED, DialerOutcome.CALLBACK)).toBeNull();
  });

  it('NOT_INTERESTED and WRONG_NUMBER mark the lead LOST', () => {
    expect(nextStatusForOutcome(LeadStatus.INTERESTED, DialerOutcome.NOT_INTERESTED)).toBe(LeadStatus.LOST);
    expect(nextStatusForOutcome(LeadStatus.NEW, DialerOutcome.WRONG_NUMBER)).toBe(LeadStatus.LOST);
    expect(nextStatusForOutcome(LeadStatus.LOST, DialerOutcome.WRONG_NUMBER)).toBeNull();
  });

  it('NOT_ANSWERED and BUSY never change the status', () => {
    for (const s of Object.values(LeadStatus)) {
      expect(nextStatusForOutcome(s, DialerOutcome.NOT_ANSWERED)).toBeNull();
      expect(nextStatusForOutcome(s, DialerOutcome.BUSY)).toBeNull();
    }
  });
});

describe('dialer rules — follow-ups (RULES 2, 3)', () => {
  it('only answered-type outcomes are conclusive', () => {
    expect(isConclusiveOutcome(DialerOutcome.NOT_ANSWERED)).toBe(false);
    expect(isConclusiveOutcome(DialerOutcome.BUSY)).toBe(false);
    expect(isConclusiveOutcome(DialerOutcome.INTERESTED)).toBe(true);
    expect(isConclusiveOutcome(DialerOutcome.CALLBACK)).toBe(true);
    expect(isConclusiveOutcome(DialerOutcome.WRONG_NUMBER)).toBe(true);
    expect(isConclusiveOutcome(DialerOutcome.NOT_INTERESTED)).toBe(true);
  });

  it('recycle check only for NOT_INTERESTED', () => {
    expect(wantsRecycleFollowUp(DialerOutcome.NOT_INTERESTED)).toBe(true);
    expect(wantsRecycleFollowUp(DialerOutcome.WRONG_NUMBER)).toBe(false);
    expect(wantsRecycleFollowUp(DialerOutcome.CALLBACK)).toBe(false);
  });
});

describe('dialer rules — POST /dialer/result validation (RULE 4)', () => {
  const now = new Date('2026-10-05T10:00:00Z');
  const base = { leadId: 'lead1', number: '+91 98765-43210', outcome: 'INTERESTED', durationSec: 75, startedAt: '2026-10-05T09:58:00Z' };

  it('accepts a valid result and normalizes the number', () => {
    const r = parseDialerResult(base, now);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.phone).toBe('9876543210');
      expect(r.value.answered).toBe(true); // durationSec > 0
      expect(r.value.callbackAt).toBeNull();
    }
  });

  it('requires a lead or contact', () => {
    expect(parseDialerResult({ ...base, leadId: undefined }, now).ok).toBe(false);
    expect(parseDialerResult({ ...base, leadId: undefined, importedContactId: 'c1' }, now).ok).toBe(true);
  });

  it('rejects unknown outcomes and missing numbers', () => {
    expect(parseDialerResult({ ...base, outcome: 'MAYBE' }, now).ok).toBe(false);
    expect(parseDialerResult({ ...base, number: '' }, now).ok).toBe(false);
  });

  it('CALLBACK needs a valid future callbackAt', () => {
    expect(parseDialerResult({ ...base, outcome: 'CALLBACK' }, now).ok).toBe(false);
    expect(parseDialerResult({ ...base, outcome: 'CALLBACK', callbackAt: 'not a date' }, now).ok).toBe(false);
    expect(parseDialerResult({ ...base, outcome: 'CALLBACK', callbackAt: '2026-10-04T10:00:00Z' }, now).ok).toBe(false);
    const ok = parseDialerResult({ ...base, outcome: 'CALLBACK', callbackAt: '2026-10-06T05:30:00Z' }, now);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value.callbackAt?.toISOString()).toBe('2026-10-06T05:30:00.000Z');
  });

  it('ignores callbackAt for non-CALLBACK outcomes', () => {
    const r = parseDialerResult({ ...base, callbackAt: '2026-10-06T05:30:00Z' }, now);
    expect(r.ok && r.value.callbackAt).toBeNull();
  });

  it('rejects negative / fractional durations and future start times', () => {
    expect(parseDialerResult({ ...base, durationSec: -1 }, now).ok).toBe(false);
    expect(parseDialerResult({ ...base, durationSec: 1.5 }, now).ok).toBe(false);
    expect(parseDialerResult({ ...base, startedAt: '2026-10-05T11:00:00Z' }, now).ok).toBe(false);
  });

  it('zero duration means not answered unless told otherwise', () => {
    const r = parseDialerResult({ ...base, outcome: 'NOT_ANSWERED', durationSec: 0 }, now);
    expect(r.ok && r.value.answered).toBe(false);
  });
});

describe('dialer rules — India-time day and helpers (RULES 5, 6)', () => {
  it('day starts at 00:00 IST = 18:30 UTC the previous day', () => {
    // 2026-10-05 03:00 IST
    expect(istDayStart(new Date('2026-10-04T21:30:00Z')).toISOString()).toBe('2026-10-04T18:30:00.000Z');
    // 2026-10-05 23:59 IST
    expect(istDayStart(new Date('2026-10-05T18:29:00Z')).toISOString()).toBe('2026-10-04T18:30:00.000Z');
    // 2026-10-06 00:00 IST
    expect(istDayStart(new Date('2026-10-05T18:30:00Z')).toISOString()).toBe('2026-10-05T18:30:00.000Z');
  });

  it('skip window is 30 minutes', () => {
    expect(RECENT_CALL_SKIP_MINUTES).toBe(30);
  });

  it('normalizes and formats', () => {
    expect(normalizeDialPhone('0091-98765 43210')).toBe('9876543210');
    expect(formatDuration(5)).toBe('5s');
    expect(formatDuration(125)).toBe('2m 05s');
  });
});
