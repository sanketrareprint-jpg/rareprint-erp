// backend/src/web-analytics/web-analytics.controller.ts
import { Controller, ForbiddenException, Get, HttpCode, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { isOwnerEmail } from '../common/super-admin';
import { WebAnalyticsService, parseRange } from './web-analytics.service';

type JwtUser = { id: string; role: string; email: string };

// Owner-only (OWNER_EMAIL), enforced here — ADMINs who aren't the owner get
// 403 on both data endpoints. The nav only uses /access to decide whether to
// show the menu item.
@Controller('web-analytics')
@UseGuards(AuthGuard('jwt'))
export class WebAnalyticsController {
  constructor(private readonly service: WebAnalyticsService) {}

  private assertOwner(req: Request & { user: JwtUser }) {
    if (!isOwnerEmail(req.user?.email)) {
      throw new ForbiddenException('Web Analytics is only available to the owner');
    }
  }

  @Get('access')
  access(@Req() req: Request & { user: JwtUser }) {
    return { allowed: isOwnerEmail(req.user?.email) };
  }

  @Get('summary')
  getSummary(@Query('range') range: string | undefined, @Req() req: Request & { user: JwtUser }) {
    this.assertOwner(req);
    return this.service.getSummary(parseRange(range));
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Req() req: Request & { user: JwtUser }) {
    this.assertOwner(req);
    return this.service.sync('MANUAL');
  }
}
