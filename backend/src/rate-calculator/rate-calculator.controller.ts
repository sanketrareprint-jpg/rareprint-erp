import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
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
}