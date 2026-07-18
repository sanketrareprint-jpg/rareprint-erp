// backend/src/loyalty/loyalty.controller.ts
import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { LoyaltyService, LoyaltyThresholds } from './loyalty.service';

@UseGuards(AuthGuard('jwt'))
@Controller('loyalty')
export class LoyaltyController {
  constructor(private readonly loyaltyService: LoyaltyService) {}

  // ── Support/finance lookup: wallet + transaction ledger by phone ─────────
  @Get('wallet/:phone')
  getWalletByPhone(@Param('phone') phone: string) {
    return this.loyaltyService.getWalletByPhone(phone);
  }

  // ── Redeem points against an order at billing time ───────────────────────
  @Post('orders/:orderId/redeem')
  redeem(@Param('orderId') orderId: string, @Body() body: { points?: number }) {
    return this.loyaltyService.redeemForOrder(orderId, body?.points);
  }

  // ── Manual reversal (cancellation/refund handled outside the normal
  // order-approval flow) ────────────────────────────────────────────────────
  @Post('orders/:orderId/reverse')
  reverse(@Param('orderId') orderId: string, @Body() body: { reason?: string }) {
    return this.loyaltyService.reverseForOrder(orderId, body?.reason || 'Manual reversal');
  }

  // ── Configurable thresholds (earn rate, GP rate, point cap, redemption cap) ─
  @Get('config')
  getConfig() {
    return this.loyaltyService.getThresholds();
  }

  @Patch('config')
  updateConfig(@Body() body: Partial<LoyaltyThresholds>) {
    return this.loyaltyService.updateThresholds(body);
  }
}
