/**
 * BUSINESS RULES: Handle Bag costing (rate-calculator.service.ts → calcReverse, product 'handlebag')
 *
 * RULE 1 — Side flap = (L + 0.75) × (H + 1), 2 per bag, printed. The flap layout
 *          (orientation, flaps per 22×32 sheet, sheet direction on the 63 in roll)
 *          is the one with the lowest flap fabric + printing per bag.
 * RULE 2 — Flap fabric uses roll area per flap, roll-edge waste included.
 * RULE 3 — Printing is per sheet: first 1000 sheets, + per further 1000 or part.
 *          Multicolor 3200 + 1200; single color 1500 + 1200.
 * RULE 4 — Side wall = (W + 1.5) × (2H + L + 0.75), plain, cut whichever way wastes less roll.
 * RULE 5 — Stitching 3.75 with wall / 2.00 without, cutting & wastage 0.50, handle 1.00.
 * RULE 6 — Rates saved before this change (old stitching 2.25 / printing slabs) never apply.
 *
 * If these tests fail after a code change, a handle bag costing rule has been broken.
 */
import { BadRequestException } from '@nestjs/common';
import { RateCalculatorService } from './rate-calculator.service';

// Shape of the handleBag rates already saved in production before this change.
const SAVED_RATES = {
  handleBag: {
    multiplier: 1.67,
    fabricRatePerKg: 220,
    sqInchGsmPerKg: 1550000,
    gussetSeamAllowanceInch: 1.5,
    stitchingWithGusset: 2.25,
    stitchingWithoutGusset: 1.25,
    cuttingWastagePerBag: 0.5,
    printingPerBag: { single: { 1000: 1.5, 2000: 1.25, 5000: 1 }, multicolor: { 1000: 3.2, 2000: 2.25, 5000: 1.75 } },
  },
};

function makeService(rates: any = SAVED_RATES) {
  const prisma: any = { $queryRawUnsafe: jest.fn().mockResolvedValue([{ value: JSON.stringify(rates) }]) };
  return new RateCalculatorService(prisma);
}

const amountOf = (r: any, prefix: string) => r.breakdown.find((b: any) => b.label.startsWith(prefix))?.amount;

describe('Handle Bag costing', () => {
  it('Test 1 — Q 1000, 12×15, W 5, GSM 80, wall GSM 65, ×1.67', async () => {
    const r: any = await makeService().calcReverse({
      product: 'handlebag', qty: 1000, multiplier: 1.67, handleBagPrintMode: 'multicolor',
      handleBagLength: 12, handleBagHeight: 15, handleBagGusset: 5, handleBagGsm: 80, handleBagWallGsm: 65,
    });
    expect(r.handleBag).toMatchObject({
      flapA: 12.75, flapB: 16, sheetAcross: 12.75, sheetAlong: 32,
      flapsPerSheet: 2, sheetsAcross: 4, sheetsNeeded: 1000,
      wallWidth: 6.5, wallLength: 42.75, wallStripsAcross: 9,
    });
    expect(r.handleBag.flapWastePct).toBeCloseTo(19.05, 2);
    expect(r.handleBag.wallWastePct).toBeCloseTo(7.14, 2);
    expect(amountOf(r, 'Side flaps') / 1000).toBeCloseTo(5.7228, 4);
    expect(amountOf(r, 'Printing')).toBeCloseTo(3200, 6);
    expect(amountOf(r, 'Gazzette') / 1000).toBeCloseTo(2.7608, 4);
    expect(amountOf(r, 'Stitching')).toBeCloseTo(3750, 6);
    expect(amountOf(r, 'Cutting')).toBeCloseTo(500, 6);
    expect(amountOf(r, 'Handle')).toBeCloseTo(1000, 6);
    // Unrounded: 5.722839 + 2.760823 + 3.2 + 3.75 + 0.5 + 1 = 16.933661/bag.
    // (The spec's 16,933.64 / 28,279.18 came from hand-rounded intermediates.)
    expect(r.subtotal).toBeCloseTo(16933.66, 2);
    expect(r.total).toBeCloseTo(28279.21, 2);
    expect(r.perPiece).toBeCloseTo(28.28, 2);
  });

  it('Test 2 — Q 5000, 12×15, no wall, GSM 70', async () => {
    const r: any = await makeService().calcReverse({
      product: 'handlebag', qty: 5000, handleBagLength: 12, handleBagHeight: 15, handleBagGusset: 0, handleBagGsm: 70,
      handleBagPrintMode: 'multicolor',
    });
    expect(r.handleBag.sheetsNeeded).toBe(5000);
    expect(r.handleBag.wallStripsAcross).toBeNull();
    expect(amountOf(r, 'Printing')).toBeCloseTo(8000, 6);
    expect(amountOf(r, 'Gazzette')).toBeUndefined();
    expect(amountOf(r, 'Side flaps') / 5000).toBeCloseTo(5.0075, 4);
    expect(r.subtotal / 5000).toBeCloseTo(10.1075, 4);
  });

  it('printing: 1001 sheets is charged 3200 + 1200 (multicolor)', async () => {
    // 12×15 bag, 2 flaps/sheet → 1001 bags need 1001 sheets.
    const r: any = await makeService().calcReverse({
      product: 'handlebag', qty: 1001, handleBagLength: 12, handleBagHeight: 15, handleBagGsm: 80, handleBagPrintMode: 'multicolor',
    });
    expect(r.handleBag.sheetsNeeded).toBe(1001);
    expect(amountOf(r, 'Printing')).toBeCloseTo(4400, 6);
  });

  it('single color: 1000 sheets = 1500, 5000 sheets = 1500 + 4 x 1200', async () => {
    const one: any = await makeService().calcReverse({
      product: 'handlebag', qty: 1000, handleBagLength: 12, handleBagHeight: 15, handleBagGsm: 80, handleBagPrintMode: 'single',
    });
    expect(amountOf(one, 'Printing')).toBeCloseTo(1500, 6);
    const five: any = await makeService().calcReverse({
      product: 'handlebag', qty: 5000, handleBagLength: 12, handleBagHeight: 15, handleBagGsm: 70, handleBagPrintMode: 'single',
    });
    expect(amountOf(five, 'Printing')).toBeCloseTo(6300, 6);
    // Same layout as multicolor Test 2; only printing differs (1.26 vs 1.60/bag).
    expect(five.subtotal / 5000).toBeCloseTo(10.1075 - 1.6 + 1.26, 4);
  });

  it('rejects a flap bigger than the print sheet', async () => {
    await expect(makeService().calcReverse({
      product: 'handlebag', qty: 100, handleBagLength: 30, handleBagHeight: 30, handleBagGsm: 80,
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('redacted result keeps the cutting layout but no costs', async () => {
    const r: any = await makeService().calcReverseForRole({
      product: 'handlebag', qty: 1000, handleBagLength: 12, handleBagHeight: 15, handleBagGusset: 5, handleBagGsm: 80, handleBagWallGsm: 65,
    }, 'SALES_AGENT');
    expect(r.breakdown).toEqual([]);
    expect(r.subtotal).toBeUndefined();
    expect(r.handleBag.flapsPerSheet).toBe(2);
  });
});
