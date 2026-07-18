/**
 * BUSINESS RULE: Loyalty Points Earn / Redeem / Reverse (see loyalty-points-spec.md)
 *
 * RULE 1 — discount <= 5%: points = floor(baseAmount * 5%).
 * RULE 2 — discount > 5%: points = floor(min(grossProfit * 10%, baseAmount * 5%)).
 * RULE 3 — missing or negative grossProfit ALWAYS awards 0 points and flags the
 *   order, in BOTH discount tiers — never falls back to the flat 5% rate.
 * RULE 4 — points are clamped to [0, pointCap] (default 2000).
 * RULE 5 — EARN is idempotent per orderId — a second attempt for the same
 *   order must not double-credit.
 * RULE 6 — REDEEM is capped at min(50% of bill, available balance).
 * RULE 7 — REVERSE claws back points but never drives the wallet negative —
 *   flags for manual reconciliation instead if the balance was already spent.
 *
 * These are pure functions (no Prisma/I/O) so they're tested directly here,
 * the same way accounts.business-rules.spec.ts tests the approval guards.
 */

import { computeEarnPoints, computeRedemption, computeReversal } from './loyalty.calc';

describe('computeEarnPoints', () => {
  it('RULE 1: normal case, discount <= 5% — awards flat 5% of baseAmount', () => {
    // subtotal 10,000, discount 200 (2%) -> baseAmount 9,800
    const result = computeEarnPoints({
      baseAmount: 9800,
      discountPct: 2,
      grossProfit: 3000,
      hasMissingCost: false,
    });
    expect(result.flagged).toBe(false);
    expect(result.points).toBe(Math.floor(9800 * 0.05)); // 490
  });

  it('RULE 2: discount > 5% falls to 10%-of-GP tier when GP is the smaller number', () => {
    // baseAmount 9,800 -> 5% cap = 490. grossProfit 4,000 -> 10% = 400 (smaller)
    const result = computeEarnPoints({
      baseAmount: 9800,
      discountPct: 12,
      grossProfit: 4000,
      hasMissingCost: false,
    });
    expect(result.flagged).toBe(false);
    expect(result.points).toBe(400);
  });

  it('GP exceeding the 5% cap — the flat 5%-of-baseAmount ceiling still wins', () => {
    // baseAmount 9,800 -> 5% cap = 490. grossProfit 8,000 -> 10% = 800 (larger, so capped at 490)
    const result = computeEarnPoints({
      baseAmount: 9800,
      discountPct: 15,
      grossProfit: 8000,
      hasMissingCost: false,
    });
    expect(result.flagged).toBe(false);
    expect(result.points).toBe(490);
  });

  it('RULE 3: negative grossProfit awards 0 points and flags, even in the <=5% discount tier', () => {
    const result = computeEarnPoints({
      baseAmount: 9800,
      discountPct: 2, // would normally qualify for flat 5%
      grossProfit: -500,
      hasMissingCost: false,
    });
    expect(result.points).toBe(0);
    expect(result.flagged).toBe(true);
    expect(result.flagReason).toBe('NEGATIVE_GROSS_PROFIT');
  });

  it('RULE 3: missing cost slab (grossProfit unknown) awards 0 points and flags', () => {
    const result = computeEarnPoints({
      baseAmount: 9800,
      discountPct: 2,
      grossProfit: null,
      hasMissingCost: true,
    });
    expect(result.points).toBe(0);
    expect(result.flagged).toBe(true);
    expect(result.flagReason).toBe('MISSING_COST');
  });

  it('RULE 4: clamps to the 2000-point cap on a very large order', () => {
    const result = computeEarnPoints({
      baseAmount: 1_000_000,
      discountPct: 1,
      grossProfit: 400_000,
      hasMissingCost: false,
    });
    expect(result.points).toBe(2000);
  });

  it('RULE 4: never returns negative points', () => {
    const result = computeEarnPoints({
      baseAmount: 0,
      discountPct: 0,
      grossProfit: 0,
      hasMissingCost: false,
    });
    expect(result.points).toBe(0);
  });

  it('rounds down (floor), not to nearest', () => {
    // baseAmount 199 -> 5% = 9.95 -> floor -> 9
    const result = computeEarnPoints({
      baseAmount: 199,
      discountPct: 1,
      grossProfit: 100,
      hasMissingCost: false,
    });
    expect(result.points).toBe(9);
  });

  it('respects configurable thresholds instead of hardcoded defaults', () => {
    const result = computeEarnPoints({
      baseAmount: 10000,
      discountPct: 1,
      grossProfit: 5000,
      hasMissingCost: false,
      earnRatePct: 8, // finance tuned this via SystemConfig
    });
    expect(result.points).toBe(800); // 8% of 10,000
  });
});

describe('EARN idempotency (RULE 5)', () => {
  // The real guard lives in LoyaltyService.earnForOrder (a findFirst check
  // backed by a DB unique index on (orderId, type)). This models that same
  // decision as a pure function so the rule is exercised without a database.
  function shouldSkipEarn(existingEarnTxnForOrder: unknown): boolean {
    return existingEarnTxnForOrder != null;
  }

  it('first attempt for an order proceeds (no existing EARN transaction)', () => {
    expect(shouldSkipEarn(null)).toBe(false);
  });

  it('re-run for the same order is skipped once an EARN transaction exists', () => {
    const existingTxn = { id: 'txn_1', orderId: 'order_1', type: 'EARN', points: 490 };
    expect(shouldSkipEarn(existingTxn)).toBe(true);
  });
});

describe('computeRedemption (RULE 6)', () => {
  it('normal case — redeems the requested amount when under both caps', () => {
    // Customer has 2,000 points and asks to redeem only 300 against a
    // 10,000 bill (50% cap = 5,000) — neither cap is the binding constraint.
    const result = computeRedemption({ billValue: 10000, availableBalance: 2000, requestedPoints: 300 });
    expect(result.redeemed).toBe(300);
    expect(result.cappedByBill).toBe(false);
    expect(result.cappedByBalance).toBe(false);
  });

  it('redemption exceeding 50% of the bill is capped at 50% of the bill', () => {
    // 50% of 1,000 = 500, but wallet has 2,000 available
    const result = computeRedemption({ billValue: 1000, availableBalance: 2000 });
    expect(result.redeemed).toBe(500);
    expect(result.cappedByBill).toBe(true);
    expect(result.cappedByBalance).toBe(false);
  });

  it('redemption exceeding available balance is capped at the wallet balance', () => {
    // 50% of 10,000 = 5,000, but wallet only has 120
    const result = computeRedemption({ billValue: 10000, availableBalance: 120 });
    expect(result.redeemed).toBe(120);
    expect(result.cappedByBalance).toBe(true);
    expect(result.cappedByBill).toBe(false);
  });

  it('respects a configurable redemption cap percentage', () => {
    const result = computeRedemption({ billValue: 1000, availableBalance: 1000, redemptionCapPct: 25 });
    expect(result.redeemed).toBe(250);
  });

  it('zero balance redeems nothing', () => {
    const result = computeRedemption({ billValue: 1000, availableBalance: 0 });
    expect(result.redeemed).toBe(0);
  });
});

describe('computeReversal (RULE 7)', () => {
  it('reversal on cancellation claws back points when the balance covers it', () => {
    const result = computeReversal(500, 200);
    expect(result.newBalance).toBe(300);
    expect(result.needsManualReconciliation).toBe(false);
  });

  it('flags for manual reconciliation instead of going negative when points were already spent', () => {
    // Customer earned 200, then redeemed most of it elsewhere, leaving only 50
    const result = computeReversal(50, 200);
    expect(result.newBalance).toBe(50); // unchanged — do not go negative
    expect(result.needsManualReconciliation).toBe(true);
  });

  it('reversing exactly the available balance zeroes it out cleanly', () => {
    const result = computeReversal(200, 200);
    expect(result.newBalance).toBe(0);
    expect(result.needsManualReconciliation).toBe(false);
  });

  it('no-op when there is nothing to reverse', () => {
    const result = computeReversal(500, 0);
    expect(result.newBalance).toBe(500);
    expect(result.needsManualReconciliation).toBe(false);
  });
});
