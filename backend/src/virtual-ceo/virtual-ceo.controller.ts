// backend/src/virtual-ceo/virtual-ceo.controller.ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { VirtualCeoService } from './virtual-ceo.service';

@Controller('virtual-ceo')
@UseGuards(JwtAuthGuard)
export class VirtualCeoController {
  constructor(private readonly svc: VirtualCeoService) {}

  /** GET /virtual-ceo/report — full action report */
  @Get('report')
  async getReport() {
    return this.svc.generateReport();
  }

  /** GET /virtual-ceo/trigger-whatsapp — manual trigger of the WhatsApp report */
  @Get('trigger-whatsapp')
  async triggerWhatsApp() {
    await this.svc.sendDailyWhatsAppReport();
    return { ok: true, message: 'WhatsApp report triggered' };
  }
}
