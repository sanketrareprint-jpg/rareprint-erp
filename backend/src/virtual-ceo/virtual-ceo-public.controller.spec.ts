// The unauthenticated envelope-list trigger. If these fail, anyone who has
// read the repo can fire the daily WhatsApp list on a live deployment.
import { UnauthorizedException } from '@nestjs/common';
import { VirtualCeoPublicController } from './virtual-ceo-public.controller';

describe('GET /virtual-ceo-public/trigger-envelope-list', () => {
  const saved = process.env.CRON_SECRET;
  const make = () => {
    const svc = { sendDailyEnvelopeList: jest.fn().mockResolvedValue({ sent: 1 }) };
    return { controller: new VirtualCeoPublicController(svc as any), svc };
  };
  afterEach(() => {
    if (saved === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = saved;
  });

  it('stays locked when CRON_SECRET is unset or empty — even for the old public key', async () => {
    for (const value of [undefined, '', '   ']) {
      if (value === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = value;
      const { controller, svc } = make();
      await expect(controller.triggerEnvelopeList('rareprint-cron')).rejects.toThrow(UnauthorizedException);
      await expect(controller.triggerEnvelopeList('')).rejects.toThrow(UnauthorizedException);
      expect(svc.sendDailyEnvelopeList).not.toHaveBeenCalled();
    }
  });

  it('runs only with the configured secret', async () => {
    process.env.CRON_SECRET = 'a-real-secret';
    const { controller, svc } = make();
    await expect(controller.triggerEnvelopeList('wrong')).rejects.toThrow(UnauthorizedException);
    await expect(controller.triggerEnvelopeList('a-real-secret')).resolves.toEqual({ ok: true, sent: 1 });
    expect(svc.sendDailyEnvelopeList).toHaveBeenCalledTimes(1);
  });
});
