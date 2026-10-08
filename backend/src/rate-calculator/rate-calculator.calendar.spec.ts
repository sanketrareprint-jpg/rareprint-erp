/**
 * BUSINESS RULES: Calendar Cost Calculator (rate-calculator.service.ts → calcCalendar)
 *
 * RULE 1 — Cost = Paper + Plate + Printing + Tinning only. No wastage (0%).
 * RULE 2 — 1 printed sheet side = 1 plate set (4 colours × master plate rate),
 *          regardless of how many calendar designs are imposed on that side.
 * RULE 3 — Printing uses the existing 4-colour slab, once per printed side of each run.
 * RULE 4 — Tinning is charged per finished calendar, never per sheet.
 * RULE 5 — 11×17 is imposed 2-up on 18×23 (6-page: 3 sheets/calendar, 6 sides;
 *          3-page: 1.5 sheets/calendar, 4 sides; 1-page: ½ sheet, 1 side).
 * RULE 6 — Every rate comes from master rates; a missing rate is an error, never ₹0.
 *
 * If these tests fail after a code change, a calendar costing rule has been broken.
 */
import { BadRequestException } from '@nestjs/common';
import { RateCalculatorService } from './rate-calculator.service';

const BASE_RATES = {
  paper: { '1823-map100': 1260, '1520-map70': 600, '1823-ART90': 1150, '1823-bond70': 850 },
  plate: 250,
  printing: { '4color': { first1k: 900, nextK: 300 } },
  calendarTinning: { top: 2, topBottom: 3.5 },
  multiplier: 1.67,
};

function makeRawService(rates: any = BASE_RATES, extraPrisma: any = {}) {
  const prisma: any = { $queryRawUnsafe: jest.fn().mockResolvedValue([{ value: JSON.stringify(rates) }]), ...extraPrisma };
  return new RateCalculatorService(prisma);
}

// Cost-rule tests run as ADMIN (a role allowed to see costs).
function makeService(rates: any = BASE_RATES) {
  const svc = makeRawService(rates);
  return { calcCalendar: (dto: any) => svc.calcCalendar(dto, 'ADMIN') as Promise<any> };
}

const base = { qty: 1000, size: '11x17', paper: 'map100', pages: '6', tinning: 'top' };

describe('Calendar cost calculator', () => {
  it('Test case 1 — 1,000 × 11×17, 100 GSM Maplitho, 6 pages', async () => {
    const r: any = await makeService().calcCalendar(base);
    const c = r.calendar;
    expect(c.totalSheets).toBe(3000);
    expect(c.printedSides).toBe(6);
    expect(c.plateSets).toBe(6);
    expect(c.designs).toBe(12);
    expect(c.totalImpressions).toBe(6000);
    expect(c.paperCost).toBeCloseTo(3000 * 2.52, 6);   // 7,560
    expect(c.plateCost).toBe(6 * 4 * 250);              // 6,000
    expect(c.printingCost).toBe(6 * 900);               // each side runs 1,000 sheets
    expect(c.tinningCost).toBe(1000 * 2);               // per calendar, not per sheet
    expect(r.subtotal).toBeCloseTo(20960, 6);
    expect(c.costPerCalendar).toBeCloseTo(20.96, 6);
    expect(r.total).toBeCloseTo(20960 * 1.67, 6);
    expect(c.wastagePct).toBe(0);
  });

  it('Test case 2 — 2,000 × 15×20, 3 pages', async () => {
    const r: any = await makeService().calcCalendar({ ...base, qty: 2000, size: '15x20', paper: 'map70', pages: '3' });
    const c = r.calendar;
    expect(c.totalSheets).toBe(6000);
    expect(c.printedSides).toBe(6);
    expect(c.designs).toBe(6);
    expect(c.paperCost).toBeCloseTo(6000 * 1.2, 6);
    expect(c.plateCost).toBe(6000);
    expect(c.printingCost).toBe(6 * (900 + 300));       // 2,000-sheet run per side
    expect(c.tinningCost).toBe(4000);
    expect(r.subtotal).toBeCloseTo(7200 + 6000 + 7200 + 4000, 6);
  });

  it('Test case 3 — 1,000 × 11×17, 3 pages (1.5 sheets/calendar, 4 sides)', async () => {
    const c: any = (await makeService().calcCalendar({ ...base, pages: '3' })).calendar;
    expect(c.totalSheets).toBe(1500);
    expect(c.printedSides).toBe(4);
    expect(c.plateCost).toBe(4000);
    expect(c.totalImpressions).toBe(3000);
    expect(c.printingCost).toBe(4 * 900);
  });

  it('1-page 11×17 is 2-up, single side; odd qty rounds sheets up', async () => {
    const c: any = (await makeService().calcCalendar({ ...base, qty: 1001, pages: '1' })).calendar;
    expect(c.totalSheets).toBe(501);
    expect(c.printedSides).toBe(1);
    expect(c.designs).toBe(1);
  });

  it('18×23 6-page: 6 sheets/calendar, 12 sides; Top+Bottom tinning', async () => {
    const c: any = (await makeService().calcCalendar({ ...base, size: '18x23', tinning: 'topBottom' })).calendar;
    expect(c.totalSheets).toBe(6000);
    expect(c.printedSides).toBe(12);
    expect(c.tinningCost).toBe(3500);
  });

  it('matches paper keys case-insensitively (1823-ART90)', async () => {
    const c: any = (await makeService().calcCalendar({ ...base, paper: 'art90' })).calendar;
    expect(c.paperReamRate).toBe(1150);
    expect(c.paperLabel).toBe('90 GSM Art Paper');
  });

  it('errors instead of ₹0 when a rate is missing', async () => {
    const svc = makeService();
    await expect(svc.calcCalendar({ ...base, size: '15x20' })).rejects.toThrow(
      'Paper rate not configured for 15×20 / 100 GSM Maplitho. Please update the Rates module.',
    );
    await expect(makeService({ ...BASE_RATES, calendarTinning: undefined }).calcCalendar(base)).rejects.toThrow(
      'Tinning rate not configured. Please update the Tinning Rates in the Rates module.',
    );
    await expect(makeService({ ...BASE_RATES, plate: 0 }).calcCalendar(base)).rejects.toThrow('Plate rate not configured');
    await expect(
      makeService({ ...BASE_RATES, printing: { '4color': { first1k: 0, nextK: 300 } } }).calcCalendar(base),
    ).rejects.toThrow('Printing rate not configured');
  });

  it('admin may override the multiplier', async () => {
    const r: any = await makeService().calcCalendar({ ...base, multiplier: 2 });
    expect(r.multiplier).toBe(2);
    expect(r.costsVisible).toBe(true);
  });

  it('roles without cost access get production + price only, and cannot override the multiplier', async () => {
    const svc = makeRawService();
    for (const role of ['SALES_AGENT', 'PRODUCTION', 'DISPATCH', 'DESIGNER', undefined]) {
      const r: any = await svc.calcCalendar({ ...base, multiplier: 1 }, role);
      expect(r.costsVisible).toBe(false);
      expect(r.breakdown).toEqual([]);
      expect(r.subtotal).toBeUndefined();
      expect(r.multiplier).toBeUndefined();
      expect(r.total).toBeCloseTo(20960 * 1.67, 6);   // master multiplier, override ignored
      expect(r.calendar.totalSheets).toBe(3000);
      expect(r.calendar.printedSides).toBe(6);
      const json = JSON.stringify(r);
      for (const leak of ['paperCost', 'plateCost', 'printingCost', 'tinningCost', 'totalCost', 'costPerCalendar', 'paperReamRate', 'plateRate', 'tinningRate', 'printCost', 'printFirst1k']) {
        expect(json).not.toContain(leak);
      }
    }
  });

  it('GET /rates hides tinning rates from non-cost roles only', async () => {
    const svc = makeRawService();
    expect((await svc.getRatesForRole('SALES_AGENT')).calendarTinning).toBeUndefined();
    expect((await svc.getRatesForRole('ADMIN')).calendarTinning).toEqual({ top: 2, topBottom: 3.5 });
  });

  it('options come from master rates (names only, no rates)', async () => {
    const opts: any = await makeRawService().getCalendarOptions();
    const s1117 = opts.sizes.find((s: any) => s.value === '11x17');
    expect(s1117.printingPaper).toBe('18×23 inch');
    // map90 comes from DEFAULT_RATES, which getRates() merges in.
    expect(s1117.papers).toEqual([{ value: 'ART90', label: '90 GSM Art Paper' }, { value: 'map90', label: '90 GSM Maplitho' }, { value: 'map100', label: '100 GSM Maplitho' }]);
    expect(opts.sizes.find((s: any) => s.value === '15x20').papers).toEqual([{ value: 'map70', label: '70 GSM Maplitho' }]);
    expect(JSON.stringify(opts)).not.toMatch(/1260|1150|600/);
  });

  it('history: calendar amounts are recomputed server-side and redacted for non-cost roles', async () => {
    const create = jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'q1', ...data }));
    const svc = makeRawService(BASE_RATES, { quoteHistory: { create } });
    const inputParams = { product: 'calendar', qty: 1000, calendarSize: '11x17', paper: 'map100', calendarPages: '6', calendarTinning: 'top', multiplier: 1 };
    await svc.saveHistory({ calcType: 'calendar', subtotal: 1, total: 1, inputParams }, 'SALES_AGENT');
    expect(create.mock.calls[0][0].data.subtotal).toBeCloseTo(20960, 6);
    expect(create.mock.calls[0][0].data.total).toBeCloseTo(20960 * 1.67, 6);   // client amounts + ×1 ignored
    await svc.saveHistory({ calcType: 'calendar', inputParams }, 'ADMIN');
    expect(create.mock.calls[1][0].data.total).toBeCloseTo(20960, 6);          // admin override honoured

    const rows = [
      { calcType: 'calendar', subtotal: 20960, multiplier: 1.67, breakdown: [{ label: 'x', amount: 1 }], inputParams },
      { calcType: 'reverse', subtotal: 500, multiplier: 1.67, breakdown: [{ label: 'y', amount: 1 }], inputParams: {} },
    ];
    const listSvc = makeRawService(BASE_RATES, { quoteHistory: { findMany: jest.fn().mockResolvedValue(rows) } });
    const sales: any[] = await listSvc.listHistory(100, 'SALES_AGENT');
    expect(sales[0]).toMatchObject({ subtotal: null, multiplier: null, breakdown: [] });
    expect(sales[0].inputParams.multiplier).toBeUndefined();
    expect(sales[1]).toEqual(rows[1]);                                          // other products unchanged
    expect(await listSvc.listHistory(100, 'ADMIN')).toEqual(rows);
  });

  it('rejects invalid input', async () => {
    const svc = makeService();
    for (const bad of [{ qty: 0 }, { qty: -5 }, { qty: 1.5 }, { size: '12x18' }, { pages: '4' }, { paper: 'bond70' }, { tinning: 'side' }]) {
      await expect(svc.calcCalendar({ ...base, ...bad })).rejects.toBeInstanceOf(BadRequestException);
    }
  });
});
