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
 * RULE 7 — Agent-stats periods (today / last 7 days / this month) start at
 *   midnight India time.
 * RULE 8 — Dial lists: missing list = ALL (the original queue); unknown list rejected.
 * RULE 9 — A PC-popup response is validated like a phone result, and only
 *   counts if typed after the lock was taken (never inherited by another agent).
 * RULE 11 — Reply details: Not interested may carry a reason (RATE / QUANTITY /
 *   TRUST / NO_REQUIREMENT); products (whole quantity > 0, rate ≥ 0) only for
 *   Interested (optional) or Rate / Quantity problem (required; Quantity has no
 *   rate). New dial lists per reason + Callback. End call from the PC only counts
 *   if pressed after the lock was taken.
 * RULE 10 — Dialer settings: no WhatsApp campaign for WRONG_NUMBER; blank
 *   campaign = send nothing; outcome templates get exactly 3 variables
 *   (customer name, agent name, agent phone).
 *
 * If these tests fail after a code change, a dialer rule has been broken.
 */
import { DialerOutcome, LeadStatus } from '@prisma/client';
import {
  RECENT_CALL_SKIP_MINUTES,
  isDeskResponseCurrent,
  isEndCallRequestCurrent,
  describeReplyProducts,
  replyProductRule,
  outcomeCampaignParams,
  parseDeskResponse,
  parseDialerList,
  parseDialerSettings,
  agentStatsSince,
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

describe('dialer rules — agent-stats periods (RULE 7)', () => {
  // 2026-10-08 01:00 IST = 2026-10-07 19:30 UTC — still "yesterday" in UTC.
  const now = new Date('2026-10-07T19:30:00Z');

  it('today starts at midnight India time', () => {
    expect(agentStatsSince('today', now).toISOString()).toBe('2026-10-07T18:30:00.000Z');
  });

  it('last 7 days includes today (6 days before today’s midnight)', () => {
    expect(agentStatsSince('7d', now).toISOString()).toBe('2026-10-01T18:30:00.000Z');
  });

  it('this month starts on the 1st, India time', () => {
    expect(agentStatsSince('month', now).toISOString()).toBe('2026-09-30T18:30:00.000Z');
  });

  it('month start uses the India date, not the UTC date, at a month boundary', () => {
    // 2026-11-01 00:30 IST = 2026-10-31 19:00 UTC → November in India.
    expect(agentStatsSince('month', new Date('2026-10-31T19:00:00Z')).toISOString()).toBe('2026-10-31T18:30:00.000Z');
  });
});

describe('dialer rules — dial lists (RULE 8)', () => {
  it('defaults to the original queue', () => {
    expect(parseDialerList(undefined)).toBe('ALL');
    expect(parseDialerList('')).toBe('ALL');
  });
  it('accepts known lists and rejects others', () => {
    expect(parseDialerList('BUSY')).toBe('BUSY');
    expect(parseDialerList('NOT_INTERESTED')).toBe('NOT_INTERESTED');
    expect(parseDialerList('busy')).toBeNull();
    expect(parseDialerList('WON')).toBeNull();
  });
});

describe('dialer rules — PC popup response (RULE 9)', () => {
  const now = new Date('2026-10-08T06:00:00Z');

  it('needs a number and a known outcome', () => {
    expect(parseDeskResponse({ outcome: 'INTERESTED' }, now)).toEqual({ ok: false, error: 'number is required' });
    expect('error' in parseDeskResponse({ number: '9876543210', outcome: 'MAYBE' }, now)).toBe(true);
  });

  it('CALLBACK needs a future callbackAt, same as the phone', () => {
    expect(parseDeskResponse({ number: '9876543210', outcome: 'CALLBACK' }, now)).toEqual({ ok: false, error: 'callbackAt is required when outcome is CALLBACK' });
    const ok = parseDeskResponse({ number: '+91 98765 43210', outcome: 'CALLBACK', callbackAt: '2026-10-08T10:00:00Z', note: '  call after lunch ' }, now);
    expect(ok).toEqual({ ok: true, value: { phone: '9876543210', outcome: DialerOutcome.CALLBACK, note: 'call after lunch', callbackAt: new Date('2026-10-08T10:00:00Z'), notInterestedReason: null, products: [] } });
  });

  it('ignores callbackAt for other outcomes', () => {
    const r = parseDeskResponse({ number: '9876543210', outcome: 'BUSY', callbackAt: 'garbage' }, now);
    expect(r).toEqual({ ok: true, value: { phone: '9876543210', outcome: DialerOutcome.BUSY, note: null, callbackAt: null, notInterestedReason: null, products: [] } });
  });

  it('only a response typed after the lock was taken counts', () => {
    const lockedAt = new Date('2026-10-08T06:00:00Z');
    expect(isDeskResponseCurrent({ lockedAt, deskOutcome: DialerOutcome.INTERESTED, deskSubmittedAt: new Date('2026-10-08T06:01:00Z') })).toBe(true);
    expect(isDeskResponseCurrent({ lockedAt, deskOutcome: DialerOutcome.INTERESTED, deskSubmittedAt: new Date('2026-10-08T05:59:00Z') })).toBe(false);
    expect(isDeskResponseCurrent({ lockedAt, deskOutcome: null, deskSubmittedAt: null })).toBe(false);
  });
});

describe('dialer rules — settings (RULE 10)', () => {
  it('keeps rate lists and campaign names, drops blank campaigns', () => {
    const r = parseDialerSettings({
      rateLists: [{ name: ' Visiting cards ', message: 'Hi {name}, 1000 cards ₹450' }],
      outcomeCampaigns: { NOT_ANSWERED: 'dialer_missed_call', BUSY: '  ', INTERESTED: 'dialer_interested' },
    });
    expect('value' in r && r.value.rateLists).toEqual([{ id: expect.any(String), name: 'Visiting cards', message: 'Hi {name}, 1000 cards ₹450' }]);
    expect('value' in r && r.value.outcomeCampaigns).toEqual({ NOT_ANSWERED: 'dialer_missed_call', INTERESTED: 'dialer_interested' });
  });

  it('never allows a campaign for wrong numbers', () => {
    expect('error' in parseDialerSettings({ outcomeCampaigns: { WRONG_NUMBER: 'x' } })).toBe(true);
  });

  it('rejects unsafe campaign names and empty rate lists', () => {
    expect('error' in parseDialerSettings({ outcomeCampaigns: { BUSY: 'bad name!' } })).toBe(true);
    expect('error' in parseDialerSettings({ rateLists: [{ name: 'A', message: '' }] })).toBe(true);
  });

  it('gives unique ids to rate lists', () => {
    const r = parseDialerSettings({ rateLists: [{ id: 'a', name: 'A', message: 'x' }, { id: 'a', name: 'B', message: 'y' }] });
    const ids = 'value' in r ? r.value.rateLists.map((l) => l.id) : [];
    expect(new Set(ids).size).toBe(2);
  });

  it('outcome templates get customer name, agent name, agent phone', () => {
    expect(outcomeCampaignParams('Ravi', 'Priya', '9876500000')).toEqual(['Ravi', 'Priya', '9876500000']);
    expect(outcomeCampaignParams(null, 'Priya', '9876500000')).toEqual(['Customer', 'Priya', '9876500000']);
  });
});

describe('dialer rules — reply details: reason, products, end call (RULE 11)', () => {
  const now = new Date('2026-10-08T09:00:00Z');
  const base = { leadId: 'lead1', number: '9876543210', durationSec: 60, startedAt: '2026-10-08T08:58:00Z' };
  const product = { productId: 'p1', quantity: 5000, rate: '1.25' };

  it('Interested: products optional, quantity + rate kept', () => {
    const none = parseDialerResult({ ...base, outcome: 'INTERESTED' }, now);
    expect(none.ok && none.value.products).toEqual([]);
    const r = parseDialerResult({ ...base, outcome: 'INTERESTED', products: [product, { productId: 'p2', quantity: '200' }] }, now);
    expect(r.ok && r.value.products).toEqual([
      { productId: 'p1', quantity: 5000, rate: 1.25 },
      { productId: 'p2', quantity: 200, rate: null },
    ]);
  });

  it('Rate / Quantity problem need a product; Quantity drops the rate', () => {
    expect(parseDialerResult({ ...base, outcome: 'NOT_INTERESTED', notInterestedReason: 'RATE' }, now))
      .toEqual({ ok: false, error: 'Choose the product (and quantity) the customer asked about' });
    const rate = parseDialerResult({ ...base, outcome: 'NOT_INTERESTED', notInterestedReason: 'RATE', products: [product] }, now);
    expect(rate.ok && rate.value.products).toEqual([{ productId: 'p1', quantity: 5000, rate: 1.25 }]);
    const qty = parseDialerResult({ ...base, outcome: 'NOT_INTERESTED', notInterestedReason: 'QUANTITY', products: [product] }, now);
    expect(qty.ok && qty.value.products).toEqual([{ productId: 'p1', quantity: 5000, rate: null }]);
  });

  it('Trust / No requirement / other outcomes take no products', () => {
    expect(parseDialerResult({ ...base, outcome: 'NOT_INTERESTED', notInterestedReason: 'TRUST', products: [product] }, now).ok).toBe(false);
    expect(parseDialerResult({ ...base, outcome: 'BUSY', products: [product] }, now).ok).toBe(false);
    expect(parseDialerResult({ ...base, outcome: 'NOT_INTERESTED', notInterestedReason: 'NO_REQUIREMENT' }, now).ok).toBe(true);
    expect(replyProductRule(DialerOutcome.CALLBACK, null)).toBe('none');
  });

  it('reason is optional for Not interested (older app), rejected elsewhere, must be known', () => {
    const r = parseDialerResult({ ...base, outcome: 'NOT_INTERESTED' }, now);
    expect(r.ok && r.value.notInterestedReason).toBeNull();
    expect(parseDialerResult({ ...base, outcome: 'INTERESTED', notInterestedReason: 'RATE' }, now).ok).toBe(false);
    expect(parseDialerResult({ ...base, outcome: 'NOT_INTERESTED', notInterestedReason: 'PRICE' }, now).ok).toBe(false);
  });

  it('rejects bad quantities / rates', () => {
    const bad = (p: object) => parseDialerResult({ ...base, outcome: 'INTERESTED', products: [p] }, now).ok;
    expect(bad({ productId: 'p1', quantity: 0 })).toBe(false);
    expect(bad({ productId: 'p1', quantity: 2.5 })).toBe(false);
    expect(bad({ productId: 'p1', quantity: 10, rate: -1 })).toBe(false);
    expect(bad({ productId: 'p1', quantity: 10, rate: 'abc' })).toBe(false);
    expect(bad({ productId: '', quantity: 10 })).toBe(false);
  });

  it('PC popup response carries the same details', () => {
    const r = parseDeskResponse({ number: '9876543210', outcome: 'NOT_INTERESTED', notInterestedReason: 'QUANTITY', products: [product] }, now);
    expect(r).toEqual({ ok: true, value: {
      phone: '9876543210', outcome: DialerOutcome.NOT_INTERESTED, note: null, callbackAt: null,
      notInterestedReason: 'QUANTITY', products: [{ productId: 'p1', quantity: 5000, rate: null }],
    } });
  });

  it('new dial lists', () => {
    for (const l of ['CALLBACK', 'NI_RATE', 'NI_QUANTITY', 'NI_TRUST', 'NI_NO_REQUIREMENT']) expect(parseDialerList(l)).toBe(l);
  });

  it('end call counts only when pressed after the lock was taken', () => {
    const lockedAt = new Date('2026-10-08T09:00:00Z');
    expect(isEndCallRequestCurrent({ lockedAt, deskEndCallAt: null })).toBe(false);
    expect(isEndCallRequestCurrent({ lockedAt, deskEndCallAt: new Date('2026-10-08T08:59:00Z') })).toBe(false);
    expect(isEndCallRequestCurrent({ lockedAt, deskEndCallAt: new Date('2026-10-08T09:00:30Z') })).toBe(true);
  });

  it('describes products for the activity note', () => {
    expect(describeReplyProducts([{ productId: 'p1', productName: 'Envelope 10x4', quantity: 5000, rate: 1.25 }, { productId: 'p2', productName: 'Bill book', quantity: 20, rate: null }]))
      .toBe('Envelope 10x4 × 5,000 @ ₹1.25, Bill book × 20');
  });
});
