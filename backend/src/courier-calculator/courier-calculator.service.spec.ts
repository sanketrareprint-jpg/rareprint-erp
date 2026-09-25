// Courier Calculator service: validation, pickup resolution by id, markup on
// real platform responses, and history scoping. Courier APIs and Prisma are
// mocked -- no network or database access.
import { BadRequestException } from '@nestjs/common';
import { CourierCalculatorService } from './courier-calculator.service';

function makeService(opts: { enabled?: string[]; productWeightGrams?: number | null } = {}) {
  const created: any[] = [];
  const prisma = {
    systemConfig: {
      findUnique: jest.fn().mockResolvedValue(opts.enabled ? { value: JSON.stringify({ enabledPlatforms: opts.enabled }) } : null),
      upsert: jest.fn().mockResolvedValue({}),
    },
    product: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'p1', sku: 'ENV-1', name: 'Envelope', weightPerUnitGrams: opts.productWeightGrams === undefined ? 5 : opts.productWeightGrams },
      ]),
    },
    courierRateQuote: {
      create: jest.fn().mockImplementation(({ data }) => { const row = { id: 'q1', createdAt: new Date(), ...data }; created.push(row); return row; }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const bigship = {
    isConfigured: () => true,
    getCachedWarehouses: jest.fn().mockResolvedValue([
      { bigshipWarehouseId: 111, name: 'Nagpur WH', pincode: '440032', city: 'Nagpur', state: 'MH', isActive: true },
      { bigshipWarehouseId: 222, name: 'Chandrapur WH', pincode: '442402', city: 'Chandrapur', state: 'MH', isActive: true },
    ]),
    fetchCourierRates: jest.fn().mockResolvedValue([
      { carrierName: 'Delhivery', amount: 1200, estimatedDays: 4 },
      { carrierName: 'Xpressbees', amount: 400, estimatedDays: 5 },
    ]),
  };
  const fship = {
    isConfigured: () => true,
    fetchRates: jest.fn().mockResolvedValue([{ carrierName: 'Ekart', amount: 600, estimatedDays: 3 }]),
  };
  const carrierConfig = { getConfig: () => ({ fship: { pickupPincode: '440032', pickupAddresses: [{ id: 9, name: 'Chandrapur', pincode: '442402' }] } }) };
  const svc = new CourierCalculatorService(prisma as any, bigship as any, fship as any, carrierConfig as any);
  return { svc, prisma, bigship, fship, created };
}

const user = { id: 'u1', fullName: 'Agent', role: 'SALES_AGENT' };
const base = { platform: 'bigship', pickupId: '222', deliveryPincode: '400001', paymentMode: 'COD', codAmount: 2500, items: [{ productId: 'p1', quantity: 200, weightKg: 1 }] };

describe('CourierCalculatorService.calculate', () => {
  it('uses the selected pickup id, applies markup per rate, sorts and saves history', async () => {
    const { svc, bigship, created } = makeService();
    const res = await svc.calculate(base, user);
    expect(bigship.fetchCourierRates).toHaveBeenCalledWith(expect.objectContaining({
      pickupPostcode: '442402', deliveryPostcode: '400001', weightKg: 1, isCod: true, codAmount: 2500, invoiceAmount: 2500, pickupWarehouseId: 222,
    }));
    expect(res.rates).toEqual([
      { carrierName: 'Xpressbees', estimatedDays: 5, cost: 400, multiplier: 1.35, chargeAmount: 540 },
      { carrierName: 'Delhivery', estimatedDays: 4, cost: 1200, multiplier: 1.25, chargeAmount: 1500 },
    ]);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ platform: 'bigship', pickupName: 'Chandrapur WH', pickupPincode: '442402', paymentMode: 'COD', createdById: 'u1' });
    // 200 x 5 g = 1 kg from the product DB, same as entered -> not edited
    expect(created[0].items[0]).toMatchObject({ productWeightKg: 1, weightKg: 1, weightEdited: false });
  });

  it('prepaid on Fship: declares the default value and uses prepaid multipliers', async () => {
    const { svc, fship } = makeService();
    const res = await svc.calculate({ ...base, platform: 'fship', pickupId: '9', paymentMode: 'PREPAID', codAmount: undefined }, user);
    expect(fship.fetchRates).toHaveBeenCalledWith(expect.objectContaining({ pickupPincode: '442402', isCod: false, amount: 1000, weightKg: 1 }));
    expect(res.rates[0]).toMatchObject({ cost: 600, multiplier: 1.2, chargeAmount: 720, estimatedDays: null });
    expect(res.codAmount).toBeNull();
  });

  it('flags a manually entered weight when the product has no DB weight', async () => {
    const { svc, created } = makeService({ productWeightGrams: null });
    await svc.calculate({ ...base, items: [{ productId: 'p1', quantity: 10, weightKg: 0.75 }] }, user);
    expect(created[0].items[0]).toMatchObject({ productWeightKg: null, weightKg: 0.75, weightEdited: true });
  });

  it.each([
    [{ platform: 'shiprocket' }, 'Select a platform'],
    [{ pickupId: '999' }, 'Select a pickup address'],
    [{ deliveryPincode: '4000' }, 'Delivery pincode must be 6 digits'],
    [{ paymentMode: 'COD', codAmount: 0 }, 'Enter the COD amount'],
    [{ items: [] }, 'Add at least one product'],
    [{ items: [{ productId: 'p1', quantity: 0, weightKg: 1 }] }, 'quantity must be a whole number'],
    [{ items: [{ productId: 'p1', quantity: 1, weightKg: 0 }] }, 'enter the weight'],
    [{ items: [{ productId: 'nope', quantity: 1, weightKg: 1 }] }, 'select a product'],
  ])('rejects %p', async (patch, message) => {
    const { svc, created } = makeService();
    await expect(svc.calculate({ ...base, ...patch } as any, user)).rejects.toThrow(message);
    expect(created).toHaveLength(0);
  });

  it('rejects a platform the admin has hidden', async () => {
    const { svc } = makeService({ enabled: ['fship'] });
    await expect(svc.calculate(base, user)).rejects.toThrow('not enabled');
  });

  it('does not save history when the platform returns no rates', async () => {
    const { svc, bigship, created } = makeService();
    bigship.fetchCourierRates.mockResolvedValueOnce([]);
    await expect(svc.calculate(base, user)).rejects.toBeInstanceOf(BadRequestException);
    expect(created).toHaveLength(0);
  });
});

describe('CourierCalculatorService.listHistory', () => {
  it('admins see everything, others only their own', async () => {
    const { svc, prisma } = makeService();
    await svc.listHistory({ id: 'a1', role: 'ADMIN' });
    expect(prisma.courierRateQuote.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: {} }));
    await svc.listHistory(user);
    expect(prisma.courierRateQuote.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { createdById: 'u1' } }));
  });
});

describe('CourierCalculatorService platform settings', () => {
  it('keeps only known platforms when saving', async () => {
    const { svc, prisma } = makeService();
    await svc.updateEnabledPlatforms(['fship', 'hacker']);
    expect(prisma.systemConfig.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { value: JSON.stringify({ enabledPlatforms: ['fship'] }) } }));
  });
});
