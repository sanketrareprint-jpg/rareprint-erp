import { Controller, Get, Post, Delete, Body, Param, Query, Req, UseGuards, ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RateCalculatorService, canSeeRateCosts } from './rate-calculator.service';

// Only roles that may see costs (ADMIN/INHOUSE/ACCOUNTS — the roles that see
// the Rates and Clubbing tabs) may read raw cost data or change rate config.
function assertCostRole(req: any): void {
  if (!canSeeRateCosts(req.user?.role)) throw new ForbiddenException('Only admin roles can access this');
}

@Controller('rate-calculator')
@UseGuards(JwtAuthGuard)
export class RateCalculatorController {
  constructor(private readonly svc: RateCalculatorService) {}

  @Get('rates')
  getRates(@Req() req: any) { return this.svc.getRatesForRole(req.user?.role); }

  @Post('rates')
  saveRates(@Body() dto: any, @Req() req: any) {
    assertCostRole(req);
    return this.svc.saveRates(dto);
  }

  @Post('forward')
  calcForward(@Body() dto: any, @Req() req: any) { return this.svc.calcForwardForRole(dto, req.user?.role); }

  @Post('reverse')
  calcReverse(@Body() dto: any, @Req() req: any) { return this.svc.calcReverseForRole(dto, req.user?.role); }

  // Raw cost calculator with client-supplied rates (not used by the UI).
  @Post('sticker')
  calcSticker(@Body() dto: any, @Req() req: any) {
    assertCostRole(req);
    return this.svc.calcSticker(dto);
  }

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
  deleteHistory(@Param('id') id: string, @Req() req: any) {
    assertCostRole(req);
    return this.svc.deleteHistory(id);
  }

  // ── Clubbing Vendor Rates ──────────────────────────────────────────────────
  @Get('clubbing-rates')
  getClubbingRates(@Req() req: any) {
    assertCostRole(req);
    return this.svc.getClubbingRates();
  }

  @Post('clubbing-rates')
  saveClubbingRates(@Body() dto: any, @Req() req: any) {
    assertCostRole(req);
    return this.svc.saveClubbingRates(dto);
  }
}
