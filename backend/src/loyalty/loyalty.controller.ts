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

  // ── Test mode — simulate earn/redeem/reverse against a throwaway phone
  // number. Never touches a real Order/Customer/Invoice; safe to use
  // repeatedly and to wipe with /test/clear when done. ─────────────────────
  @Post('test/earn')
  simulateEarn(@Body() body: {
    phone: string;
    subtotal: number;
    discount: number;
    grossProfit?: number;
    hasMissingCost?: boolean;
  }) {
    return this.loyaltyService.simulateEarn(body);
  }

  @Post('test/redeem')
  simulateRedeem(@Body() body: { phone: string; billValue: number; requestedPoints?: number }) {
    return this.loyaltyService.simulateRedeem(body.phone, body.billValue, body.requestedPoints);
  }

  @Post('test/reverse')
  simulateReverse(@Body() body: { phone: string }) {
    return this.loyaltyService.simulateReverse(body.phone);
  }

  @Post('test/clear')
  clearTestData(@Body() body: { phone: string }) {
    return this.loyaltyService.clearTestData(body.phone);
  }
}
