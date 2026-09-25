import { Body, Controller, ForbiddenException, Get, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CourierCalculatorService, type CourierCalculateInput } from './courier-calculator.service';

type AuthedRequest = { user: { id: string; fullName?: string | null; email?: string | null; role?: string } };

// Courier Calculator -- open to every logged-in role. Only changing which
// platforms appear in the dropdown is admin-only.
@Controller('courier-calculator')
@UseGuards(AuthGuard('jwt'))
export class CourierCalculatorController {
  constructor(private readonly svc: CourierCalculatorService) {}

  @Get('platforms')
  getPlatforms() {
    return this.svc.getPlatforms();
  }

  @Put('platforms')
  updatePlatforms(@Body() body: { enabledPlatforms?: unknown }, @Req() req: AuthedRequest) {
    if (req.user?.role !== 'ADMIN') throw new ForbiddenException('Admin only');
    return this.svc.updateEnabledPlatforms(body?.enabledPlatforms);
  }

  @Get('pickup-addresses')
  getPickupAddresses(@Query('platform') platform: string) {
    return this.svc.getPickupAddresses(platform);
  }

  @Post('calculate')
  calculate(@Body() body: CourierCalculateInput, @Req() req: AuthedRequest) {
    return this.svc.calculate(body ?? ({} as CourierCalculateInput), req.user);
  }

  @Get('history')
  getHistory(@Query('limit') limitStr: string | undefined, @Req() req: AuthedRequest) {
    const limit = limitStr ? parseInt(limitStr, 10) || 100 : 100;
    return this.svc.listHistory(req.user, limit);
  }
}
