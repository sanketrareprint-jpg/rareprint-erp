/**
 * Compile + wiring smoke test for LoyaltyService. Not a full integration
 * test (no real DB) — just instantiates the service with mocked
 * dependencies and exercises the parts that don't need $transaction, to
 * catch type errors and obvious wiring mistakes (see accounts.service.ts
 * approveOrder/rejectOrder for how this is actually invoked).
 */
import { LoyaltyService } from './loyalty.service';

function makePrismaMock() {
  return {
    systemConfig: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({}),
    },
    order: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    customerLoyaltyTransaction: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    customerLoyaltyWallet: {
      upsert: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  } as any;
}

function makeCostTableMock() {
  return {
    computeOrderGrossProfit: jest.fn().mockResolvedValue({ costTotal: 100, grossProfit: 50, hasMissingCost: false }),
  } as any;
}

function makeWhatsAppMock() {
  return {
    normalizePhone: jest.fn((raw: string) => `91${raw.replace(/\D/g, '').slice(-10)}`),
    sendLoyaltyPointsEarned: jest.fn().mockResolvedValue(true),
  } as any;
}

describe('LoyaltyService (smoke)', () => {
  it('constructs cleanly with its declared dependencies', () => {
    const service = new LoyaltyService(makePrismaMock(), makeCostTableMock(), makeWhatsAppMock());
    expect(service).toBeInstanceOf(LoyaltyService);
  });

  it('getThresholds falls back to spec defaults when SystemConfig has no rows', async () => {
    const service = new LoyaltyService(makePrismaMock(), makeCostTableMock(), makeWhatsAppMock());
    const thresholds = await service.getThresholds();
    expect(thresholds).toEqual({
      earnRatePct: 5,
      gpRatePct: 10,
      pointCap: 2000,
      redemptionCapPct: 50,
    });
  });

  it('getThresholds reads configured overrides from SystemConfig', async () => {
    const prisma = makePrismaMock();
    prisma.systemConfig.findMany.mockResolvedValue([
      { key: 'loyalty_earn_rate_pct', value: '8' },
      { key: 'loyalty_point_cap', value: '5000' },
    ]);
    const service = new LoyaltyService(prisma, makeCostTableMock(), makeWhatsAppMock());
    const thresholds = await service.getThresholds();
    expect(thresholds.earnRatePct).toBe(8);
    expect(thresholds.pointCap).toBe(5000);
    expect(thresholds.gpRatePct).toBe(10); // untouched, still default
  });

  it('earnForOrder skips isTest orders without touching the database further', async () => {
    const prisma = makePrismaMock();
    prisma.order.findUnique.mockResolvedValue({
      id: 'order_1',
      isTest: true,
      isSample: false,
      customer: { phone: '9876543210' },
    });
    const service = new LoyaltyService(prisma, makeCostTableMock(), makeWhatsAppMock());
    const result = await service.earnForOrder('order_1');
    expect(result).toEqual({ skipped: true, reason: 'TEST_OR_SAMPLE' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('earnForOrder skips orders with no usable customer phone', async () => {
    const prisma = makePrismaMock();
    prisma.order.findUnique
      .mockResolvedValueOnce({ id: 'order_2', isTest: false, isSample: false, customer: { phone: null } });
    const whatsapp = makeWhatsAppMock();
    whatsapp.normalizePhone.mockReturnValue(null);
    const service = new LoyaltyService(prisma, makeCostTableMock(), whatsapp);
    const result = await service.earnForOrder('order_2');
    expect(result).toEqual({ skipped: true, reason: 'NO_PHONE' });
  });
});
