// backend/src/dialer/dialer.controller.ts
import { Body, Controller, Get, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
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
   * `asAgentId` (admins only) = dial that seller's queue instead of your own.
   * `list` = which numbers to dial (DIALER_LISTS in dialer.rules.ts; default ALL).
   */
  @Get('next')
  getNext(
    @Req() req: Request & { user: JwtUser },
    @Query('skip') skip?: string,
    @Query('asAgentId') asAgentId?: string,
    @Query('list') list?: string,
  ) {
    return this.dialerService.getNext(req.user, skip ? skip.split(',') : [], asAgentId, list);
  }

  /** The number your phone is dialing right now, for the PC popup ({ item: null } when none). */
  @Get('live')
  getLive(@Req() req: Request & { user: JwtUser }) {
    return this.dialerService.getLive(req.user);
  }

  /** PC popup: the customer's response for the number your phone is on. The phone saves it when the call ends. */
  @Post('desk-response')
  saveDeskResponse(@Body() body: any, @Req() req: Request & { user: JwtUser }) {
    return this.dialerService.saveDeskResponse(req.user, body);
  }

  /** PC popup "End call": your phone hangs up the call to this number (needs the app with end-call support). */
  @Post('end-call')
  requestEndCall(@Body() body: any, @Req() req: Request & { user: JwtUser }) {
    return this.dialerService.requestEndCall(req.user, body);
  }

  /** Phone: has the PC answered for this number yet ({ response: null } when not), and was End call pressed there? */
  @Get('desk-response')
  getDeskResponse(@Req() req: Request & { user: JwtUser }, @Query('phone') phone?: string) {
    return this.dialerService.getDeskResponse(req.user, phone);
  }

  /** Rate lists (WhatsApp messages) + WhatsApp campaign per call outcome. */
  @Get('settings')
  getSettings(@Req() req: Request & { user: JwtUser }) {
    return this.dialerService.getSettings(req.user);
  }

  /** Admins only. */
  @Put('settings')
  updateSettings(@Body() body: any, @Req() req: Request & { user: JwtUser }) {
    return this.dialerService.updateSettings(req.user, body);
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

  /**
   * Per-agent calls, reply outcomes, new leads, pipeline and follow-ups due.
   * `period` = today (default) | 7d | month. Admins see every agent, others only themselves.
   */
  @Get('agent-stats')
  getAgentStats(@Req() req: Request & { user: JwtUser }, @Query('period') period?: string) {
    return this.dialerService.getAgentStats(req.user, period);
  }
}
