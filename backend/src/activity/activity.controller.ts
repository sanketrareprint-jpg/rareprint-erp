import { Controller, Post, Get, Body, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { ActivityService } from './activity.service';

type JwtUser = { id: string; role: string };

@Controller('activity')
@UseGuards(AuthGuard('jwt'))
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  /** Frontend pings this every 30s when cursor is moving */
  @Post('ping')
  async ping(
    @Req() req: Request & { user: JwtUser },
    @Body('page') page = '/',
  ) {
    return this.activity.ping(req.user.id, page);
  }

  /** Admin report: time per user, session log */
  @Get('report')
  async report(
    @Req() req: Request & { user: JwtUser },
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.activity.report(from, to);
  }
}
