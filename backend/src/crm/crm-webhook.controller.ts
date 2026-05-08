import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { CrmService } from './crm.service';

@Controller('crm')
export class CrmWebhookController {
  constructor(private readonly crmService: CrmService) {}

  @Get('leads/meta-webhook')
  verifyMetaWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    const VERIFY_TOKEN = 'rareprint2024';
    if (mode === 'subscribe' && token === VERIFY_TOKEN) return parseInt(challenge);
    return 'Verification failed';
  }

  @Post('leads/meta-webhook')
  receiveMetaLead(@Body() body: any) {
    return this.crmService.receiveMetaLead(body);
  }
}
