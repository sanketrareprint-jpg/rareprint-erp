// backend/src/loyalty/loyalty.calc.ts
//
// Pure calculation functions for the loyalty points system — no Prisma, no
// I/O. Kept separate from loyalty.service.ts so the point/redemption/reversal
// math can be unit tested directly (see loyalty.calc.spec.ts) without mocking
// the database, mirroring how this repo tests business rules elsewhere
// (see accounts.business-rules.spec.ts).

export interface EarnCalcInput {
  baseAmount: number;       // subtotal − discount
  discountPct: number;      // discount / subtotal × 100
  grossProfit: number | null;
  hasMissingCost: boolean;
  earnRatePct?: number;     // default 5  (% of baseAmount when discount <= earnRatePct threshold)
  gpRatePct?: number;       // default 10 (% of grossProfit when discount is high)
  pointCap?: number;        // default 2000 (max points per order)
}

export interface EarnCalcResult {
  points: number;
  flagged: boolean;
  flagReason?: 'MISSING_COST' | 'NEGATIVE_GROSS_PROFIT';
}

// RULE (loyalty-points-spec.md §1 + §2):
//   baseAmount = subtotal − discount
//   discountPct = discount / subtotal × 100
//   if discountPct <= 5:  points = floor(baseAmount * earnRatePct%)
//   else:                 points = floor(min(grossProfit * gpRatePct%, baseAmount * earnRatePct%))
//   points = clamp(points, 0, pointCap)
//
// Missing/negative grossProfit ALWAYS awards 0 + flags for review, in BOTH
// tiers — the spec's "improvements" section is explicit that a loss-making or
// uncosted order must never fall back to the flat 5% rate just because the
// discount was small enough to qualify for that tier.
export function computeEarnPoints(input: EarnCalcInput): EarnCalcResult {
  const {
    baseAmount,
    discountPct,
    grossProfit,
    hasMissingCost,
    earnRatePct = 5,
    gpRatePct = 10,
    pointCap = 2000,
  } = input;

  if (hasMissingCost || grossProfit == null || grossProfit < 0) {
    return {
      points: 0,
      flagged: true,
      flagReason: hasMissingCost ? 'MISSING_COST' : 'NEGATIVE_GROSS_PROFIT',
    };
  }

  const capByEarnRate = Math.max(0, baseAmount) * (earnRatePct / 100);
  const raw = discountPct <= 5
    ? capByEarnRate
    : Math.min(grossProfit * (gpRatePct / 100), capByEarnRate);

  const points = Math.max(0, Math.min(Math.floor(raw), pointCap));
  return { points, flagged: false };
}

export interface RedemptionCalcInput {
  billValue: number;
  availableBalance: number;
  requestedPoints?: number;  // what the customer/agent asked to redeem; defaults to "as much as possible"
  redemptionCapPct?: number; // default 50
}

export interface RedemptionCalcResult {
  redeemed: number;
  cappedByBill: boolean;
  cappedByBalance: boolean;
}

// Redemption: up to redemptionCapPct% of the bill, never more than the
// wallet's available balance, never more than what was actually requested.
export function computeRedemption(input: RedemptionCalcInput): RedemptionCalcResult {
  const { billValue, availableBalance, requestedPoints, redemptionCapPct = 50 } = input;
  const billCap = Math.floor(Math.max(0, billValue) * (redemptionCapPct / 100));
  const balance = Math.max(0, Math.floor(availableBalance));
  const requested = requestedPoints != null ? Math.max(0, Math.floor(requestedPoints)) : Infinity;

  const redeemed = Math.min(billCap, balance, requested);
  return {
    redeemed,
    cappedByBill: redeemed === billCap && billCap < Math.min(balance, requested),
    cappedByBalance: redeemed === balance && balance < Math.min(billCap, requested),
  };
}

export interface ReversalCalcResult {
  newBalance: number;
  needsManualReconciliation: boolean;
}

// Reversal: claw back points on cancellation/refund. Never let the balance
// go negative — if the customer already spent the points elsewhere, flag it
// for manual reconciliation instead of silently going negative.
export function computeReversal(currentBalance: number, pointsToReverse: number): ReversalCalcResult {
  if (pointsToReverse <= 0) return { newBalance: currentBalance, needsManualReconciliation: false };
  if (currentBalance >= pointsToReverse) {
    return { newBalance: currentBalance - pointsToReverse, needsManualReconciliation: false };
  }
  return { newBalance: currentBalance, needsManualReconciliation: true };
}
