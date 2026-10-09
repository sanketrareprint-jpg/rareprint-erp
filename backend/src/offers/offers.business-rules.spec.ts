/**
 * BUSINESS RULE: Order-level offers (Offers tab) — pricing, locking, commission
 *
 * RULE 1 — Offer prices come from the backend, never the browser:
 *   DISCOUNT    = rate-card total − ₹ amount, or × (100 − %)/100, rounded to paise
 *   FREE_ON_QTY = bought line at its rate-card total + free line at ₹0
 *   COMBO       = the combo's fixed line amounts
 * RULE 2 — Offer lines are saved offerLocked = true with the offer's id.
 * RULE 3 — Offer lines earn a flat commission slab, never profit ÷ 4 (÷ 3.75 C):
 *   target met A 10% (sticker 15%), B 10%, C 12% (sticker 17%);
 *   target not met A 7%, B 5%; D = Sale − Rate card.
 *
 * These call the real OffersService / OrdersService / CostTableService code
 * with an in-memory Prisma stand-in. If they fail after a code change, an
 * offer pricing or commission rule has been broken.
 */

import { BadRequestException } from '@nestjs/common';
import { OffersService } from './offers.service';
import { discountedLineTotal, isOfferInWindow, offerLineCommission } from './offer-rules';
import { OrdersService } from '../orders/orders.service';
import { CostTableService } from '../cost-table/cost-table.service';

// ── Fixtures ────────────────────────────────────────────────────────────────
// Envelope: rate card ₹1,200 for 1,000; cost ₹0.90/unit (₹900 for 1,000).
const ENVELOPE = { id: 'p-env', name: 'Envelope 9x4', isActive: true, category: { name: 'Envelopes' } };
const STICKER = { id: 'p-stk', name: 'Round Sticker', isActive: true, category: { name: 'Stickers' } };
const RATE_SLABS = [
  { productId: 'p-env', minQuantity: 1000, maxQuantity: 1999, rateAmount: 1200 },
  { productId: 'p-stk', minQuantity: 500, maxQuantity: 999, rateAmount: 999 },
];
const COST_SLABS = [{ productId: 'p-env', minQuantity: 1000, maxQuantity: 1999, unitPrice: 0.9 }];

const base = { isActive: true, validFrom: null, validTo: null, notes: null, createdAt: new Date(), discountValue: null, discountMode: null, productIds: [] as string[], buyProductId: null, buyQuantity: null, freeProductId: null, freeQuantity: null, comboItems: null, description: 'text' };
const OFFERS: Record<string, any> = {
  'o-pct': { ...base, id: 'o-pct', code: 'ENV10', offerType: 'DISCOUNT', discountMode: 'PERCENT', discountValue: 10, productIds: ['p-env'] },
  'o-amt': { ...base, id: 'o-amt', code: 'ALL150', offerType: 'DISCOUNT', discountMode: 'AMOUNT', discountValue: 150, productIds: [] },
  'o-free': { ...base, id: 'o-free', code: 'BUY1KGET500', offerType: 'FREE_ON_QTY', buyProductId: 'p-env', buyQuantity: 1000, freeProductId: 'p-stk', freeQuantity: 500 },
  'o-combo': { ...base, id: 'o-combo', code: 'COMBO2K', offerType: 'COMBO', comboItems: [{ productId: 'p-env', quantity: 1000, lineTotal: 1500 }, { productId: 'p-stk', quantity: 500, lineTotal: 500 }] },
  'o-off': { ...base, id: 'o-off', code: 'OFF', offerType: 'DISCOUNT', discountMode: 'PERCENT', discountValue: 5, isActive: false },
  'o-legacy': { ...base, id: 'o-legacy', code: 'OLD', offerType: 'FREE_ITEM' },
};

function makePrisma() {
  const saved: { order?: any } = {};
  const prisma: any = {
    offerCode: { findUnique: jest.fn(async ({ where }: any) => OFFERS[where.id] ?? null) },
    productRateSlab: {
      findFirst: jest.fn(async ({ where }: any) =>
        RATE_SLABS
          .filter((s) => s.productId === where.productId && s.minQuantity <= where.minQuantity.lte && (s.maxQuantity == null || s.maxQuantity >= where.minQuantity.lte))
          .sort((a, b) => b.minQuantity - a.minQuantity)[0] ?? null),
    },
    product: {
      findMany: jest.fn(async ({ where }: any) => [ENVELOPE, STICKER].filter((p) => where.id.in.includes(p.id))),
      findUnique: jest.fn(async ({ where }: any) => [ENVELOPE, STICKER].find((p) => p.id === where.id) ?? null),
    },
    productRule: { findMany: jest.fn(async () => [{ productId: 'p-stk', minQty: 1000, isActive: true }]) },
    order: { findUnique: jest.fn(async () => null) },
    $queryRaw: jest.fn(async () => [{ max: '1500' }]),
    $transaction: jest.fn(async (fn: any) => fn({
      customer: { findUnique: jest.fn(async () => null), findFirst: jest.fn(async () => null), create: jest.fn(async () => ({ id: 'c1' })) },
      order: { create: jest.fn(async ({ data }: any) => { saved.order = data; return { id: 'ord1' }; }) },
      statusLog: { create: jest.fn(async () => ({})) },
      payment: { create: jest.fn(async () => ({})) },
    })),
  };
  return { prisma, saved };
}

const orderDto = (items: any[], offerId?: string) => ({
  customer: { name: 'Test Party', phone: '9876543210', dateOfBirth: '1990-05-12' },
  items,
  offerId,
  leadSource: 'WALK_IN',
});

// ── RULE 1: pricing maths ───────────────────────────────────────────────────
describe('BUSINESS RULE: offer discount maths', () => {
  it('₹ amount off the rate-card total', () => {
    expect(discountedLineTotal(1200, 'AMOUNT', 150)).toBe(1050);
  });
  it('% off the rate-card total', () => {
    expect(discountedLineTotal(1200, 'PERCENT', 10)).toBe(1080);
  });
  it('% discount rounds half-up to paise (999 × 87.5% = 874.125 → 874.13)', () => {
    expect(discountedLineTotal(999, 'PERCENT', 12.5)).toBe(874.13);
  });
  it('refuses a discount that leaves ₹0 or less', () => {
    expect(() => discountedLineTotal(100, 'AMOUNT', 100)).toThrow();
    expect(() => discountedLineTotal(100, 'AMOUNT', 150)).toThrow();
  });
});

describe('BUSINESS RULE: offer validity window (inclusive IST days)', () => {
  const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
  const offer = { isActive: true, validFrom: day('2026-10-01'), validTo: day('2026-10-31') };
  it('valid from 00:00 IST on the first day', () => {
    expect(isOfferInWindow(offer, new Date('2026-09-30T18:30:00.000Z'))).toBe(true);
    expect(isOfferInWindow(offer, new Date('2026-09-30T18:29:59.000Z'))).toBe(false);
  });
  it('valid until 23:59 IST on the last day', () => {
    expect(isOfferInWindow(offer, new Date('2026-10-31T18:29:59.000Z'))).toBe(true);
    expect(isOfferInWindow(offer, new Date('2026-10-31T18:30:00.000Z'))).toBe(false);
  });
  it('an inactive offer is never valid', () => {
    expect(isOfferInWindow({ ...offer, isActive: false }, new Date('2026-10-15T06:00:00.000Z'))).toBe(false);
  });
});

describe('BUSINESS RULE: OffersService.priceOffer', () => {
  const svc = () => new OffersService(makePrisma().prisma);

  it('DISCOUNT prices only qualifying lines from the rate card', async () => {
    const { lines } = await svc().priceOffer('o-pct', [
      { productId: 'p-env', quantity: 1000 },
      { productId: 'p-stk', quantity: 500 },
    ]);
    expect(lines).toEqual([{ sourceIndex: 0, productId: 'p-env', quantity: 1000, unitPrice: 1.08, lineTotal: 1080, isFree: false }]);
  });
  it('DISCOUNT with no product filter applies to every line', async () => {
    const { lines } = await svc().priceOffer('o-amt', [
      { productId: 'p-env', quantity: 1000 },
      { productId: 'p-stk', quantity: 500 },
    ]);
    expect(lines.map((l) => l.lineTotal)).toEqual([1050, 849]);
  });
  it('DISCOUNT refuses a line with no rate-card price at that quantity', async () => {
    await expect(svc().priceOffer('o-pct', [{ productId: 'p-env', quantity: 5000 }])).rejects.toThrow(/No rate-card price/);
  });
  it('DISCOUNT refuses an order with no qualifying product', async () => {
    await expect(svc().priceOffer('o-pct', [{ productId: 'p-stk', quantity: 500 }])).rejects.toThrow(/does not apply/);
  });
  it('FREE_ON_QTY = bought line at rate card + free line at ₹0', async () => {
    const { lines } = await svc().priceOffer('o-free', []);
    expect(lines).toEqual([
      { sourceIndex: null, productId: 'p-env', quantity: 1000, unitPrice: 1.2, lineTotal: 1200, isFree: false },
      { sourceIndex: null, productId: 'p-stk', quantity: 500, unitPrice: 0, lineTotal: 0, isFree: true },
    ]);
  });
  it('COMBO = fixed line amounts', async () => {
    const { lines } = await svc().priceOffer('o-combo', []);
    expect(lines.map((l) => [l.productId, l.quantity, l.lineTotal])).toEqual([['p-env', 1000, 1500], ['p-stk', 500, 500]]);
  });
  it('refuses an inactive offer and a legacy per-item code', async () => {
    await expect(svc().priceOffer('o-off', [{ productId: 'p-env', quantity: 1000 }])).rejects.toThrow(/not active/);
    await expect(svc().priceOffer('o-legacy', [])).rejects.toThrow(/not found/);
  });
});

// ── RULE 1 + 2: OrdersService.create saves the backend's prices, locked ─────
describe('BUSINESS RULE: order creation with an offer', () => {
  function makeOrders() {
    const { prisma, saved } = makePrisma();
    const whatsapp: any = { sendOrderCreated: jest.fn() };
    return { orders: new OrdersService(prisma, whatsapp, new OffersService(prisma)), saved };
  }

  it('DISCOUNT: ignores the browser price, saves the offer price locked', async () => {
    const { orders, saved } = makeOrders();
    await orders.create(orderDto([
      { productId: 'p-env', quantity: 1000, unitPrice: 0.01, fromOffer: true },
      { productId: 'p-stk', quantity: 1000, unitPrice: 2 },
    ], 'o-pct') as any, 'agent1');
    const [offerLine, normalLine] = saved.order.items.create;
    expect(Number(offerLine.lineTotal)).toBe(1080);
    expect(offerLine.offerLocked).toBe(true);
    expect(offerLine.offerCodeId).toBe('o-pct');
    expect(Number(normalLine.lineTotal)).toBe(2000);
    expect(normalLine.offerLocked).toBe(false);
    expect(normalLine.offerCodeId).toBeNull();
    expect(Number(saved.order.grandTotal)).toBe(3080);
  });

  it('FREE_ON_QTY: free line saved at ₹0 and skips the min-qty rule (500 < 1000 min)', async () => {
    const { orders, saved } = makeOrders();
    await orders.create(orderDto([
      { productId: 'p-env', quantity: 1000, unitPrice: 5, fromOffer: true },
      { productId: 'p-stk', quantity: 500, unitPrice: 5, fromOffer: true },
    ], 'o-free') as any, 'agent1');
    expect(saved.order.items.create.map((i: any) => [Number(i.lineTotal), i.offerLocked])).toEqual([[1200, true], [0, true]]);
    expect(Number(saved.order.grandTotal)).toBe(1200);
  });

  it('COMBO: refuses offer lines whose quantity was changed', async () => {
    const { orders } = makeOrders();
    await expect(orders.create(orderDto([
      { productId: 'p-env', quantity: 2000, unitPrice: 1, fromOffer: true },
      { productId: 'p-stk', quantity: 500, unitPrice: 1, fromOffer: true },
    ], 'o-combo') as any, 'agent1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('no offer: prices and min-qty rule unchanged', async () => {
    const { orders, saved } = makeOrders();
    await orders.create(orderDto([{ productId: 'p-env', quantity: 1000, unitPrice: 1.1 }]) as any, 'agent1');
    const [line] = saved.order.items.create;
    expect(Number(line.lineTotal)).toBe(1100);
    expect(line.offerLocked).toBe(false);
    await expect(orders.create(orderDto([{ productId: 'p-stk', quantity: 500, unitPrice: 1 }]) as any, 'agent1'))
      .rejects.toThrow(/Minimum order quantity/);
  });
});

// ── RULE 3: commission ──────────────────────────────────────────────────────
describe('BUSINESS RULE: offer line commission (flat slab)', () => {
  const c = (category: string | null, lineTotal: number, belowTarget: boolean, isSticker = false, rateTotal = 1200) =>
    Number(offerLineCommission({ category, isSticker, lineTotal, rateTotal, belowTarget }).amount.toFixed(2));

  it('target met: A 10% / sticker 15%, B 10%, C 12% / sticker 17%', () => {
    expect(c('A', 1080, false)).toBe(108);
    expect(c('A', 1000, false, true)).toBe(150);
    expect(c('B', 1080, false)).toBe(108);
    expect(c('C', 1080, false)).toBe(129.6);
    expect(c('C', 1000, false, true)).toBe(170);
  });
  it('target not met: A 7%, B 5%, C unchanged', () => {
    expect(c('A', 1080, true)).toBe(75.6);
    expect(c('B', 1080, true)).toBe(54);
    expect(c('C', 1080, true)).toBe(129.6);
  });
  it('D keeps Sale − Rate card (nothing on a discounted line)', () => {
    expect(c('D', 1080, false)).toBe(0);
    expect(c('D', 1300, false)).toBe(100);
  });
  it('free line and uncategorised agent earn nothing', () => {
    expect(c('A', 0, false)).toBe(0);
    expect(c(null, 1080, false)).toBe(0);
  });
});

describe('BUSINESS RULE: commission code paths use the flat slab for offer lines', () => {
  // ₹1,080 for 1,000 envelopes = 10% below rate card; cost ₹900 → profit ₹180.
  // Normal rule (discount > 5%): profit ÷ 4 = ₹45. Offer rule: flat slab.
  const item = (offerLocked: boolean) => ({
    id: offerLocked ? 'i-offer' : 'i-normal', productId: 'p-env', quantity: 1000, unitPrice: 1.08, lineTotal: 1080, offerLocked,
    product: { ...ENVELOPE, costSlabs: COST_SLABS, rateSlabs: RATE_SLABS.filter((s) => s.productId === 'p-env') },
  });

  it('CostTableService.commissionForLine (dashboard net profit)', () => {
    const svc: any = new CostTableService({} as any, {} as any);
    const order = { salesAgent: { salesAgentCategory: 'A' } };
    expect(svc.commissionForLine(order, item(false), 900)).toBe(45);
    expect(svc.commissionForLine(order, item(true), 900)).toBe(108);
  });

  it('CostTableService.getAgentCommissionSheet (monthly payout, below ₹1.15L target)', async () => {
    const prisma: any = {
      order: { findMany: jest.fn(async () => [{
        id: 'ord1', orderNumber: '1501', orderDate: new Date('2026-10-05'), status: 'APPROVED', grandTotal: 2160,
        salesAgent: { id: 'agent1', fullName: 'Agent', salesAgentCategory: 'A' },
        customer: { businessName: 'Party' }, shipments: [], payments: [],
        items: [item(false), item(true)],
      }]) },
      commissionVerification: { findUnique: jest.fn(() => Promise.resolve(null)) },
      user: { findUnique: jest.fn(() => Promise.resolve({ fullName: 'Agent', salesAgentCategory: 'A', baseSalary: null, email: 'a@x', usesAgencyRatesForCommission: false })) },
      productCostSlab: { findMany: jest.fn(async () => COST_SLABS) },
      productRateSlab: { findMany: jest.fn(async () => RATE_SLABS) },
      commissionOverride: { findMany: jest.fn(() => Promise.resolve([])) },
    };
    const svc: any = new CostTableService(prisma, {} as any);
    jest.spyOn(svc, 'buildEmployeeSalaryLookup').mockResolvedValue(new Map());
    jest.spyOn(svc, 'resolveAgentBaseSalary').mockReturnValue(0);
    const sheet = await svc.getAgentCommissionSheet('agent1', 2026, 10);
    const byId = Object.fromEntries(sheet.rows.map((r: any) => [r.orderItemId, r]));
    expect(byId['i-normal'].commissionAmt).toBe(45);      // profit ÷ 4 (below cap 7% = 75.60)
    expect(byId['i-offer'].commissionAmt).toBe(75.6);     // flat 7% — A below target
    expect(byId['i-offer'].calcMethod).toMatch(/Offer: Sale × 7% flat/);
  });

  it('OrdersService order-list commission column', () => {
    const orders: any = new OrdersService({} as any, {} as any, {} as any);
    const order = { salesAgent: { salesAgentCategory: 'A' }, grandTotal: 1080 };
    const withSlabs = (i: any) => ({ ...i, matchingCostSlab: COST_SLABS[0] });
    expect(orders.calculateOrderCommission({ ...order, items: [withSlabs(item(false))] }).commissionTotal).toBe(45);
    expect(orders.calculateOrderCommission({ ...order, items: [withSlabs(item(true))] }).commissionTotal).toBe(108);
  });
});
