// backend/src/dialer/dialer.controller.ts
import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { DialerService } from './dialer.service';

interface JwtUser { id: string; role: string; }

@Controller('dialer')
@UseGuards(AuthGuard('jwt'))
export class DialerController {
  constructor(private readonly dialerService: DialerService) {}

  /**
   * Next lead/contact to call for the logged-in agent ({ item: null } when the
   * queue is empty). `skip` = comma-separated phone numbers the agent skipped
   * this session, so Skip moves on instead of returning the same lead.
   */
  @Get('next')
  getNext(@Req() req: Request & { user: JwtUser }, @Query('skip') skip?: string) {
    return this.dialerService.getNext(req.user, skip ? skip.split(',') : []);
  }

  /** Saves a call's outcome and updates the lead/contact. */
  @Post('result')
  saveResult(@Body() body: any, @Req() req: Request & { user: JwtUser }) {
    return this.dialerService.saveResult(req.user, body);
  }

  /** Today's (India time) calls made, connected, and talk time for the logged-in agent. */
  @Get('session-stats')
  getSessionStats(@Req() req: Request & { user: JwtUser }) {
    return this.dialerService.getSessionStats(req.user);
  }
}
