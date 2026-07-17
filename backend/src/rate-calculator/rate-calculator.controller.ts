import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RateCalculatorService } from './rate-calculator.service';

@Controller('rate-calculator')
@UseGuards(JwtAuthGuard)
export class RateCalculatorController {
  constructor(private readonly svc: RateCalculatorService) {}

  @Get('rates')
  getRates() { return this.svc.getRates(); }

  @Post('rates')
  saveRates(@Body() dto: any) { return this.svc.saveRates(dto); }

  @Post('forward')
  calcForward(@Body() dto: any) { return this.svc.calcForward(dto); }

  @Post('reverse')
  calcReverse(@Body() dto: any) { return this.svc.calcReverse(dto); }

  @Post('sticker')
  calcSticker(@Body() dto: any) { return this.svc.calcSticker(dto); }

  // ── Sequential quotation numbers ────────────────────────────────────────────
  @Get('next-quotation-number')
  async nextQuotationNumber() {
    return { number: await this.svc.nextQuotationNumber() };
  }

  // ── Quote History ──────────────────────────────────────────────────────────
  @Get('history')
  listHistory(@Query('limit') limit?: string) {
    return this.svc.listHistory(limit ? parseInt(limit, 10) : 100);
  }

  @Post('history')
  saveHistory(@Body() dto: any) { return this.svc.saveHistory(dto); }

  @Delete('history/:id')
  deleteHistory(@Param('id') id: string) { return this.svc.deleteHistory(id); }

  // ── Clubbing Vendor Rates ──────────────────────────────────────────────────
  @Get('clubbing-rates')
  getClubbingRates() { return this.svc.getClubbingRates(); }

  @Post('clubbing-rates')
  saveClubbingRates(@Body() dto: any) { return this.svc.saveClubbingRates(dto); }
}
