// Protects the Courier Calculator markup formula (courier-markup.ts).
// If these tests fail after a code change, the courier charge quoted to
// customers has changed.
import { applyCourierMarkup, courierMarkupPct } from './courier-markup';

describe('courier markup tiers', () => {
  it.each([
    // cost, mode, expected pct
    [0, 'COD', 135], [0, 'PREPAID', 125],
    [499.99, 'COD', 135], [499.99, 'PREPAID', 125],
    [500, 'COD', 130], [500, 'PREPAID', 120],
    [999.99, 'COD', 130], [999.99, 'PREPAID', 120],
    [1000, 'COD', 125], [1000, 'PREPAID', 115],
    [1500, 'COD', 125], [1500, 'PREPAID', 115],
    [1500.01, 'COD', 120], [1500.01, 'PREPAID', 115],
    [5000, 'COD', 120], [5000, 'PREPAID', 115],
  ] as const)('cost %p %s -> %p%%', (cost, mode, pct) => {
    expect(courierMarkupPct(cost, mode)).toBe(pct);
  });
});

describe('applyCourierMarkup', () => {
  it('multiplies and rounds to the paisa', () => {
    expect(applyCourierMarkup(100, 'COD')).toEqual({ multiplier: 1.35, chargeAmount: 135 });
    expect(applyCourierMarkup(100, 'PREPAID')).toEqual({ multiplier: 1.25, chargeAmount: 125 });
    expect(applyCourierMarkup(750, 'COD')).toEqual({ multiplier: 1.3, chargeAmount: 975 });
    expect(applyCourierMarkup(750, 'PREPAID')).toEqual({ multiplier: 1.2, chargeAmount: 900 });
    expect(applyCourierMarkup(1200, 'COD')).toEqual({ multiplier: 1.25, chargeAmount: 1500 });
    expect(applyCourierMarkup(1200, 'PREPAID')).toEqual({ multiplier: 1.15, chargeAmount: 1380 });
    expect(applyCourierMarkup(2000, 'COD')).toEqual({ multiplier: 1.2, chargeAmount: 2400 });
    expect(applyCourierMarkup(2000, 'PREPAID')).toEqual({ multiplier: 1.15, chargeAmount: 2300 });
  });

  it('rounds half-paisa up exactly (no float drift)', () => {
    // 12.30 x 1.25 = 15.375 -> 15.38
    expect(applyCourierMarkup(12.3, 'PREPAID').chargeAmount).toBe(15.38);
    // 87.65 x 1.35 = 118.3275 -> 118.33
    expect(applyCourierMarkup(87.65, 'COD').chargeAmount).toBe(118.33);
  });
});
