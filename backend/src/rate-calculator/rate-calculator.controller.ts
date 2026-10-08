import { Controller, Get, Post, Delete, Body, Param, Query, Req, UseGuards, ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RateCalculatorService, canSeeRateCosts } from './rate-calculator.service';

@Controller('rate-calculator')
@UseGuards(JwtAuthGuard)
export class RateCalculatorController {
  constructor(private readonly svc: RateCalculatorService) {}

  @Get('rates')
  getRates(@Req() req: any) { return this.svc.getRatesForRole(req.user?.role); }

  // Only roles that see the Rates tab (ADMIN/INHOUSE/ACCOUNTS) may change master rates.
  @Post('rates')
  saveRates(@Body() dto: any, @Req() req: any) {
    if (!canSeeRateCosts(req.user?.role)) throw new ForbiddenException('Only admin roles can change master rates');
    return this.svc.saveRates(dto);
  }

  @Post('forward')
  calcForward(@Body() dto: any) { return this.svc.calcForward(dto); }

  @Post('reverse')
  calcReverse(@Body() dto: any) { return this.svc.calcReverse(dto); }

  @Post('sticker')
  calcSticker(@Body() dto: any) { return this.svc.calcSticker(dto); }

  @Get('calendar/options')
  getCalendarOptions() { return this.svc.getCalendarOptions(); }

  @Post('calendar')
  calcCalendar(@Body() dto: any, @Req() req: any) { return this.svc.calcCalendar(dto, req.user?.role); }

  // ── Sequential quotation numbers ────────────────────────────────────────────
  @Get('next-quotation-number')
  async nextQuotationNumber() {
    return { number: await this.svc.nextQuotationNumber() };
  }

  // ── Quote History ──────────────────────────────────────────────────────────
  @Get('history')
  listHistory(@Query('limit') limit: string | undefined, @Req() req: any) {
    return this.svc.listHistory(limit ? parseInt(limit, 10) : 100, req.user?.role);
  }

  @Post('history')
  saveHistory(@Body() dto: any, @Req() req: any) { return this.svc.saveHistory(dto, req.user?.role); }

  @Delete('history/:id')
  deleteHistory(@Param('id') id: string) { return this.svc.deleteHistory(id); }

  // ── Clubbing Vendor Rates ──────────────────────────────────────────────────
  @Get('clubbing-rates')
  getClubbingRates() { return this.svc.getClubbingRates(); }

  @Post('clubbing-rates')
  saveClubbingRates(@Body() dto: any) { return this.svc.saveClubbingRates(dto); }
}
