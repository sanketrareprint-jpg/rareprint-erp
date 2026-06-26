// backend/src/virtual-ceo/virtual-ceo-public.controller.ts
// Unguarded endpoints — protected by CRON_SECRET query param instead of JWT

import { Controller, Get, Query, UnauthorizedException } from '@nestjs/common';
import { VirtualCeoService } from './virtual-ceo.service';

@Controller('virtual-ceo-public')
export class VirtualCeoPublicController {
  constructor(private readonly svc: VirtualCeoService) {}

  /**
   * GET /virtual-ceo-public/trigger-envelope-list?key=rareprint-cron
   * Manual trigger for the Raza Envelope daily pending list.
   * No JWT required — protected by CRON_SECRET env var.
   */
  @Get('trigger-envelope-list')
  async triggerEnvelopeList(@Query('key') key: string) {
    const secret = process.env.CRON_SECRET ?? 'rareprint-cron';
    if (key !== secret) throw new UnauthorizedException('Invalid key');
    const result = await this.svc.sendDailyEnvelopeList();
    return { ok: true, ...result };
  }
}
