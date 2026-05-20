import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { RewardsService } from './rewards.service';

type JwtUser = { id: string; role: string };

@Controller('rewards')
@UseGuards(AuthGuard('jwt'))
export class RewardsController {
  constructor(private readonly svc: RewardsService) {}

  /** GET /rewards/wallet — returns the caller's reward wallet + last 30 transactions */
  @Get('wallet')
  getWallet(@Req() req: Request & { user: JwtUser }) {
    return this.svc.getWallet(req.user.id);
  }
}
