import { Prisma } from '@prisma/client';

// Order-level offers, created in the Offers tab (ADMIN) and picked once per
// order on Create Order. Distinct from the legacy per-item codes
// (FREE_ITEM / COMBO_DISCOUNT) managed in Settings > Offers & Combos.
//   DISCOUNT    — fixed ₹ or % off the rate-card price of selected (or all) products
//   FREE_ON_QTY — buy a fixed quantity of one product, get a fixed quantity of another free
//   COMBO       — fixed products at fixed quantities for a fixed price
export const ORDER_OFFER_TYPES = ['DISCOUNT', 'FREE_ON_QTY', 'COMBO'] as const;
export type OrderOfferType = (typeof ORDER_OFFER_TYPES)[number];

export const DISCOUNT_MODES = ['AMOUNT', 'PERCENT'] as const;
export type DiscountMode = (typeof DISCOUNT_MODES)[number];

export function isOrderOfferType(value: unknown): value is OrderOfferType {
  return typeof value === 'string' && (ORDER_OFFER_TYPES as readonly string[]).includes(value);
}

export type ComboItem = { productId: string; quantity: number; lineTotal: number };

// validFrom/validTo are saved from <input type="date"> as UTC midnight of the
// chosen day. Both ends are inclusive whole days in IST (the business's
// timezone), same IST convention as CostTableService's month boundaries.
const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function isOfferInWindow(
  offer: { isActive: boolean; validFrom: Date | null; validTo: Date | null },
  now: Date = new Date(),
): boolean {
  if (!offer.isActive) return false;
  if (offer.validFrom && now.getTime() < offer.validFrom.getTime() - IST_OFFSET_MS) return false;
  if (offer.validTo && now.getTime() >= offer.validTo.getTime() + DAY_MS - IST_OFFSET_MS) return false;
  return true;
}

// Line total after a DISCOUNT offer, from the rate-card total for that line.
// Rounded to paise (the 2 decimals OrderItem.lineTotal stores). Throws when
// the discount would leave the line at ₹0 or below — that is a free item,
// which is what FREE_ON_QTY is for.
export function discountedLineTotal(rateTotal: number, mode: DiscountMode, value: number): number {
  const rate = new Prisma.Decimal(rateTotal);
  const result = mode === 'PERCENT'
    ? rate.mul(new Prisma.Decimal(100).minus(value)).div(100)
    : rate.minus(value);
  const rounded = result.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  if (rounded.lte(0)) {
    throw new Error(`Discount leaves nothing to charge (rate-card total ₹${rate.toFixed(2)})`);
  }
  return rounded.toNumber();
}

// Monthly sales below this put category A/B agents on the reduced rate
// (same threshold as CostTableService's commission sheets).
export const COMMISSION_TARGET_SALES = 115000;

// Commission on a line priced by an order-level offer (OrderItem.offerLocked).
// Per the business rule for offers: never the profit ÷ 4 (÷ 3.75 for C)
// discount formula — a flat slab of the line amount instead:
//   target met:      A 10% (sticker 15%), B 10%, C 12% (sticker 17%)
//   target not met:  A 7%, B 5%; C unchanged
//   D:               Sale − Rate card, same as its normal rule
// A free line (₹0) earns nothing. Callers that don't evaluate the monthly
// target (single-order views) pass belowTarget = false, matching how those
// views already treat normal lines.
export function offerLineCommission(input: {
  category: string | null;
  isSticker: boolean;
  lineTotal: number;
  rateTotal: number;
  belowTarget: boolean;
}): { amount: number; method: string } {
  const { category, isSticker, lineTotal, rateTotal, belowTarget } = input;
  if (!category) return { amount: 0, method: 'No category' };
  if (category === 'D') {
    return {
      amount: Math.max(0, lineTotal - rateTotal),
      method: `Offer: Sale − Rate (₹${lineTotal.toFixed(0)} − ₹${rateTotal.toFixed(0)})`,
    };
  }
  let pct: number;
  let label: string;
  if (belowTarget && category === 'A') {
    pct = 7; label = 'below ₹1.15L';
  } else if (belowTarget && category === 'B') {
    pct = 5; label = 'below ₹1.15L';
  } else if (category === 'A') {
    pct = isSticker ? 15 : 10; label = isSticker ? 'sticker' : 'standard';
  } else if (category === 'C') {
    pct = isSticker ? 17 : 12; label = isSticker ? 'sticker' : 'standard';
  } else {
    pct = 10; label = 'standard';
  }
  return { amount: lineTotal * (pct / 100), method: `Offer: Sale × ${pct}% flat (${label})` };
}
