/**
 * BUSINESS RULES: Rate Calc cost visibility (rate-calculator.service.ts / .controller.ts)
 *
 * RULE 1 — Only ADMIN / INHOUSE / ACCOUNTS see costs, rates, multipliers and
 *          the commission basis. Every other role gets price + production only.
 * RULE 2 — GET /rates for other roles keeps keys (dropdown options) but no values.
 * RULE 3 — Other roles cannot override the multiplier or any ₹ cost input
 *          (comparing two prices would reveal the multiplier, and so the cost).
 * RULE 4 — History amounts are recomputed server-side, never trusted from the client.
 * RULE 5 — Clubbing rates, master rates, raw sticker calc and History delete are
 *          admin-role only.
 *
 * If these tests fail after a code change, sales users may be able to see or
 * derive our costs.
 */
import { ForbiddenException } from '@nestjs/common';
import { RateCalculatorService, canSeeRateCosts } from './rate-calculator.service';
import { RateCalculatorController } from './rate-calculator.controller';

const RATES = {
  paper: { '1823-map100': 1260 },
  plate: 250,
  printing: { '4color': { first1k: 900, nextK: 300 }, '1color': { flat: 150 }, '2color': { flat: 300 } },
  multiplier: 1.67,
  keychain: { multiplier: 1.67, numberRates: { KC1: 12, KC9: 30 } },
  nonWovenBag: { ratePerKg: 120, perPlateRate: 500, multicolorPerPlateRate: 1000, printingCostPerBag: 1, multiplier: 1.67, bagsPerKg: { '12x15': 40 } },
  ppFiles: { tiers: [1000, 2000] },
  calendarTinning: { top: 2 },
};

function makeService(extraPrisma: any = {}) {
  const prisma: any = { $queryRawUnsafe: jest.fn().mockResolvedValue([{ value: JSON.stringify(RATES) }]), ...extraPrisma };
  return new RateCalculatorService(prisma);
}

const SALES = 'SALES_AGENT';
const MONEY_KEYS = ['subtotal', 'multiplier', 'clubbing', 'plainSubtotal', 'nonTearableSubtotal', 'plainSheetRate', 'clubbingCost', 'plainMultiplier', 'dieRatePerSqIn', 'clubbingRatePerSqIn', 'clubbingFixedCost'];

describe('Rate Calc cost visibility', () => {
  it('cost roles are exactly ADMIN, INHOUSE, ACCOUNTS', () => {
    for (const r of ['ADMIN', 'INHOUSE', 'ACCOUNTS']) expect(canSeeRateCosts(r)).toBe(true);
    for (const r of ['SALES_AGENT', 'PRODUCTION', 'DISPATCH', 'DESIGNER', '', undefined, null]) expect(canSeeRateCosts(r as any)).toBe(false);
  });

  it('GET /rates: keys kept, every value removed for sales; full for admin', async () => {
    const svc = makeService();
    const sales = await svc.getRatesForRole(SALES);
    expect(Object.keys(sales.paper)).toContain('1823-map100');
    expect(Object.keys(sales.keychain.numberRates)).toEqual(expect.arrayContaining(['KC1', 'KC9'])); // + DEFAULT_RATES keys
    expect(sales.ppFiles.tiers).toEqual([1000, 2000]);               // qty thresholds, not money
    expect(sales.calendarTinning).toBeUndefined();
    const json = JSON.stringify({ ...sales, ppFiles: undefined, diagnosticBags: undefined });
    expect(json).not.toMatch(/:\s*-?\d/);                           // no numeric value anywhere
    expect((await svc.getRatesForRole('ADMIN')).paper['1823-map100']).toBe(1260);
  });

  it('reverse: sales gets price + production only; multiplier and ₹ overrides are ignored', async () => {
    const svc = makeService();
    const dto = { product: 'nonwovenbag', qty: 1000, nonWovenSize: '12x15', nonWovenPerPlateRate: 0, nonWovenRatePerKg: 0, nonWovenPrintingCostPerBag: 0, multiplier: 1 };
    const admin: any = await svc.calcReverseForRole({ ...dto }, 'ADMIN');
    const plain: any = await svc.calcReverseForRole({ product: 'nonwovenbag', qty: 1000, nonWovenSize: '12x15' }, 'ADMIN');
    const sales: any = await svc.calcReverseForRole({ ...dto }, SALES);
    expect(admin.costsVisible).toBe(true);
    expect(admin.total).toBeCloseTo(admin.subtotal * 1, 6);           // admin overrides honoured
    expect(sales.costsVisible).toBe(false);
    expect(sales.total).toBeCloseTo(plain.total, 6);                  // overrides ignored → master price
    expect(sales.breakdown).toEqual([]);
    for (const k of MONEY_KEYS) expect(sales[k]).toBeUndefined();
    expect(sales.description).not.toMatch(/Rs\.|₹/);                  // "@ Rs.120/kg" stripped
  });

  it('reverse sticker: sales sees prices and layout, no rates/costs/multipliers', async () => {
    const r: any = await makeService().calcReverseForRole({ product: 'sticker', qty: 2000, stickerW: 2, stickerH: 3 }, SALES);
    expect(r.sticker.plainTotal).toBeGreaterThan(0);
    expect(r.sticker.stickersPerSheet).toBeGreaterThan(0);
    for (const k of MONEY_KEYS) expect(r.sticker[k]).toBeUndefined();
  });

  it('forward: sales gets no breakdown or subtotal, multiplier override ignored', async () => {
    const svc = makeService();
    const dto = { layers: [{ psize: '1823', gsm: 'map100', qty: 1000, fsize: 'A4', colors: 4, sides: 'single' }], multiplier: 1 };
    const admin: any = await svc.calcForwardForRole({ ...dto, multiplier: undefined }, 'ADMIN');
    const sales: any = await svc.calcForwardForRole(dto, SALES);
    expect(sales.total).toBeCloseTo(admin.total, 6);
    expect(sales.breakdown).toEqual([]);
    expect(sales.subtotal).toBeUndefined();
    expect(sales.multiplier).toBeUndefined();
  });

  it('history: amounts recomputed server-side for reverse/forward; unknown type rejected', async () => {
    const create = jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'h1', ...data }));
    const svc = makeService({ quoteHistory: { create } });
    const inputParams = { product: 'keychain', qty: 100, keychainNumber: 'KC1', multiplier: 1 };
    await svc.saveHistory({ calcType: 'reverse', subtotal: 1, total: 1, inputParams }, SALES);
    const saved = create.mock.calls[0][0].data;
    expect(saved.subtotal).toBeCloseTo(1200, 6);                     // 100 × ₹12, not the client's 1
    expect(saved.total).toBeCloseTo(1200 * 1.67, 6);                 // ×1 ignored for sales
    expect(saved.inputParams.multiplier).toBeUndefined();
    await svc.saveHistory({ calcType: 'reverse', inputParams }, 'ADMIN');
    expect(create.mock.calls[1][0].data.total).toBeCloseTo(1200, 6); // admin ×1 honoured
    await expect(svc.saveHistory({ calcType: 'bogus', total: 5 }, SALES)).rejects.toThrow('Unknown quote type');
  });

  it('controller: rate config, clubbing, raw sticker calc and history delete are admin-role only', () => {
    const svc: any = { saveRates: jest.fn(), getClubbingRates: jest.fn(), saveClubbingRates: jest.fn(), deleteHistory: jest.fn(), calcSticker: jest.fn() };
    const ctrl = new RateCalculatorController(svc);
    const sales = { user: { role: SALES } };
    const admin = { user: { role: 'ACCOUNTS' } };
    expect(() => ctrl.saveRates({}, sales)).toThrow(ForbiddenException);
    expect(() => ctrl.getClubbingRates(sales)).toThrow(ForbiddenException);
    expect(() => ctrl.saveClubbingRates({}, sales)).toThrow(ForbiddenException);
    expect(() => ctrl.deleteHistory('x', sales)).toThrow(ForbiddenException);
    expect(() => ctrl.calcSticker({}, sales)).toThrow(ForbiddenException);
    ctrl.saveRates({}, admin); ctrl.getClubbingRates(admin); ctrl.saveClubbingRates({}, admin); ctrl.deleteHistory('x', admin); ctrl.calcSticker({}, admin);
    for (const fn of Object.values(svc)) expect(fn).toHaveBeenCalledTimes(1);
  });
});

// Sticker prices must not change when their rates moved from code into
// DEFAULT_RATES (so they are no longer shipped in the frontend bundle).
describe('Sticker pricing (rates from master rates)', () => {
  it('2,000 × 2×3 in: plain ₹2,080, non tearable ₹3,040, clubbing ₹1,710', async () => {
    const r: any = await makeService().calcReverse({ product: 'sticker', qty: 2000, stickerW: 2, stickerH: 3 });
    const s = r.sticker;
    expect(s.sheetsNeeded).toBe(80);                      // 25 per sheet
    expect(s.plainSubtotal).toBeCloseTo(80 * 13, 6);
    expect(s.plainMultiplier).toBe(2);                    // 1,040 is in the 1,000–3,000 slab
    expect(s.plainTotal).toBeCloseTo(2080, 6);
    expect(s.nonTearableTotal).toBeCloseTo(3040, 6);
    expect(s.clubbingCost).toBeCloseTo(12 * 1000 * 0.035 + 150, 6);
    expect(s.clubbingMultiplier).toBe(3);                 // 570 is in the 500–1,000 slab
    expect(s.clubbingTotal).toBeCloseTo(1710, 6);
    expect(r.total).toBeCloseTo(2080, 6);
  });

  it('multiplier slabs: <500 ×4, <1000 ×3, <3000 ×2, else ×1.67', async () => {
    const svc: any = makeService();
    const m = async (sheets: number) => (await svc.calcReverse({ product: 'sticker', qty: sheets * 25, stickerW: 2, stickerH: 3 })).multiplier;
    expect(await m(38)).toBe(4);     // 494
    expect(await m(39)).toBe(3);     // 507
    expect(await m(76)).toBe(3);     // 988
    expect(await m(77)).toBe(2);     // 1,001
    expect(await m(230)).toBe(2);    // 2,990
    expect(await m(231)).toBe(1.67); // 3,003
  });
});
