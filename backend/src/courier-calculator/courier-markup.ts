// Courier Calculator markup (Sanket, 2026-09-25). The ONE place this formula
// lives -- the frontend only displays what the backend returns.
//
// The tier is picked from the raw platform cost (the rate Bigship/Fship
// returned), then that cost is multiplied:
//
//   cost under 500        COD x1.35   PREPAID x1.25
//   cost 500 to under 1000 COD x1.30   PREPAID x1.20
//   cost 1000 to 1500     COD x1.25   PREPAID x1.15
//   cost above 1500       COD x1.20   PREPAID x1.15
//
// Multipliers are kept as whole percentages and the math is done in paise so
// the result is exact (e.g. 12.30 x 1.25 = 15.375 rounds to 15.38, not the
// 15.37 that floating-point 12.3 * 1.25 would give). Only rounding applied:
// the final charge is rounded to the nearest paisa.

export type CourierPaymentMode = 'PREPAID' | 'COD';

type MarkupTier = { upTo: number; inclusive: boolean; codPct: number; prepaidPct: number };

export const COURIER_MARKUP_TIERS: MarkupTier[] = [
  { upTo: 500,      inclusive: false, codPct: 135, prepaidPct: 125 },
  { upTo: 1000,     inclusive: false, codPct: 130, prepaidPct: 120 },
  { upTo: 1500,     inclusive: true,  codPct: 125, prepaidPct: 115 },
  { upTo: Infinity, inclusive: false, codPct: 120, prepaidPct: 115 },
];

export function courierMarkupPct(cost: number, mode: CourierPaymentMode): number {
  const tier = COURIER_MARKUP_TIERS.find((t) => (t.inclusive ? cost <= t.upTo : cost < t.upTo))!;
  return mode === 'COD' ? tier.codPct : tier.prepaidPct;
}

export function applyCourierMarkup(cost: number, mode: CourierPaymentMode): { multiplier: number; chargeAmount: number } {
  const pct = courierMarkupPct(cost, mode);
  const costPaise = Math.round(cost * 100);
  const chargePaise = Math.round((costPaise * pct) / 100);
  return { multiplier: pct / 100, chargeAmount: chargePaise / 100 };
}
