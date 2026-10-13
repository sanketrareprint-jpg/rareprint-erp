// Web Analytics — owner-only gate and the date/easy-win rules the dashboard
// numbers depend on. If the gate tests fail, a non-owner (including an ADMIN)
// can read or trigger the owner's Google Analytics data.
import { BadRequestException } from '@nestjs/common';
import { addDays, parseRange, periodRanges, pickEasyWins, todayIst } from './web-analytics.service';

// Matched by message: jest.resetModules() reloads @nestjs/common, so the
// controller throws a different ForbiddenException class than one imported here.
const OWNER_ONLY = 'Web Analytics is only available to the owner';

describe('WebAnalyticsController owner gate', () => {
  const OWNER = 'boss@printco.in';
  let controller: any;
  let service: { getSummary: jest.Mock; sync: jest.Mock };
  let previous: string | undefined;

  beforeEach(() => {
    previous = process.env.OWNER_EMAIL;
    process.env.OWNER_EMAIL = OWNER;
    jest.resetModules();
    // Re-imported so super-admin.ts picks up OWNER_EMAIL at load time.
    const { WebAnalyticsController } = require('./web-analytics.controller');
    service = { getSummary: jest.fn().mockResolvedValue({ ok: true }), sync: jest.fn().mockResolvedValue({ status: 'SUCCESS' }) };
    controller = new WebAnalyticsController(service);
  });

  afterEach(() => {
    if (previous === undefined) delete process.env.OWNER_EMAIL;
    else process.env.OWNER_EMAIL = previous;
    jest.resetModules();
  });

  const req = (email: string, role = 'ADMIN') => ({ user: { id: 'u1', role, email } }) as any;

  it('lets the owner read the summary and refresh', async () => {
    await expect(controller.getSummary('7', req(OWNER))).resolves.toEqual({ ok: true });
    expect(service.getSummary).toHaveBeenCalledWith(7);
    await expect(controller.refresh(req(OWNER.toUpperCase()))).resolves.toEqual({ status: 'SUCCESS' });
    expect(service.sync).toHaveBeenCalledWith('MANUAL');
    expect(controller.access(req(OWNER))).toEqual({ allowed: true });
  });

  it('blocks an ADMIN who is not the owner from summary and refresh', () => {
    expect(() => controller.getSummary('28', req('admin@printco.in', 'ADMIN'))).toThrow(OWNER_ONLY);
    expect(() => controller.refresh(req('admin@printco.in', 'ADMIN'))).toThrow(OWNER_ONLY);
    expect(controller.access(req('admin@printco.in'))).toEqual({ allowed: false });
    expect(service.getSummary).not.toHaveBeenCalled();
    expect(service.sync).not.toHaveBeenCalled();
  });

  it('blocks other roles and missing users', () => {
    expect(() => controller.getSummary('28', req('agent@printco.in', 'SALES_AGENT'))).toThrow(OWNER_ONLY);
    expect(() => controller.getSummary('28', { user: undefined })).toThrow(OWNER_ONLY);
  });

  it('blocks everyone when OWNER_EMAIL is empty (SaaS customer deployments)', () => {
    process.env.OWNER_EMAIL = '';
    jest.resetModules();
    const { WebAnalyticsController } = require('./web-analytics.controller');
    const saasController = new WebAnalyticsController(service);
    expect(() => saasController.getSummary('28', req('sanket.rareprint@gmail.com'))).toThrow(OWNER_ONLY);
    expect(() => saasController.getSummary('28', req(''))).toThrow(OWNER_ONLY);
  });
});

describe('web analytics date ranges', () => {
  it('uses IST for today', () => {
    // 2026-10-13 20:00 UTC is already 2026-10-14 01:30 in India.
    expect(todayIst(new Date('2026-10-13T20:00:00Z'))).toBe('2026-10-14');
    expect(todayIst(new Date('2026-10-13T10:00:00Z'))).toBe('2026-10-13');
  });

  it('builds an N-day current period ending on endDate and the N days just before it', () => {
    expect(periodRanges('2026-10-12', 7)).toEqual({
      current: { startDate: '2026-10-06', endDate: '2026-10-12' },
      previous: { startDate: '2026-09-29', endDate: '2026-10-05' },
    });
    const r90 = periodRanges('2026-03-01', 90);
    expect(addDays(r90.current.startDate, 89)).toBe('2026-03-01');
    expect(addDays(r90.previous.endDate, 1)).toBe(r90.current.startDate);
    expect(addDays(r90.previous.startDate, 89)).toBe(r90.previous.endDate);
  });

  it('only accepts 7, 28 or 90 days', () => {
    expect(parseRange(undefined)).toBe(28);
    expect(parseRange('90')).toBe(90);
    expect(() => parseRange('30')).toThrow(BadRequestException);
    expect(() => parseRange('abc')).toThrow(BadRequestException);
  });
});

describe('pickEasyWins', () => {
  const row = (key: string, position: number, impressions: number) => ({ key, position, impressions, clicks: 0, ctr: 0 });

  it('keeps positions 5-20 with at least 2 impressions per day, most impressions first', () => {
    const wins = pickEasyWins(
      [
        row('top-ranked', 2, 900), // already top 4
        row('edge-5', 5, 14),
        row('edge-20', 20, 500),
        row('page-3', 21, 900), // beyond position 20
        row('too-few', 8, 13), // 7 days needs >= 14
      ],
      7,
    );
    expect(wins.map((w) => w.key)).toEqual(['edge-20', 'edge-5']);
  });
});
