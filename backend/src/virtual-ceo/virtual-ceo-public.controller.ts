// backend/src/virtual-ceo/virtual-ceo-public.controller.ts
// Unguarded endpoints — protected by CRON_SECRET query param instead of JWT

import { Controller, Get, Query, UnauthorizedException } from '@nestjs/common';
import { VirtualCeoService } from './virtual-ceo.service';

@Controller('virtual-ceo-public')
export class VirtualCeoPublicController {
  constructor(private readonly svc: VirtualCeoService) {}

  /**
   * GET /virtual-ceo-public/trigger-envelope-list?key=<CRON_SECRET>
   * Manual trigger for the Raza Envelope daily pending list.
   * No JWT required — protected by CRON_SECRET env var.
   */
  @Get('trigger-envelope-list')
  async triggerEnvelopeList(@Query('key') key: string) {
    // No default: the old fallback ('rareprint-cron') was public in the repo.
    // With CRON_SECRET unset this stays locked; signed-in users have
    // GET /virtual-ceo/trigger-envelope-list.
    const secret = process.env.CRON_SECRET?.trim();
    if (!secret || key !== secret) throw new UnauthorizedException('Invalid key');
    const result = await this.svc.sendDailyEnvelopeList();
    return { ok: true, ...result };
  }
}
