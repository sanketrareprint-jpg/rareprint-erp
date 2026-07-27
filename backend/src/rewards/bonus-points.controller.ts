// backend/src/rewards/bonus-points.controller.ts
import {
  Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query,
  Req, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { BonusPointsService } from './bonus-points.service';

type JwtUser = { id: string; role: string };

@Controller('rewards/bonus')
@UseGuards(AuthGuard('jwt'))
export class BonusPointsController {
  constructor(private readonly svc: BonusPointsService) {}

  private assertAdmin(req: Request & { user: JwtUser }) {
    if (req.user?.role !== 'ADMIN') {
      throw new ForbiddenException('Only admins can manage Bonus Points activities and claims');
    }
  }

  // ── Activity catalog ──────────────────────────────────────────────────
  @Get('activities')
  listActivities(@Query('all') all: string | undefined, @Req() req: Request & { user: JwtUser }) {
    const includeInactive = all === 'true' && req.user?.role === 'ADMIN';
    return this.svc.listActivities(includeInactive);
  }

  @Post('activities')
  createActivity(
    @Body() body: { name?: string; description?: string; points?: number; claimType?: 'MANUAL' | 'AUTOMATIC' },
    @Req() req: Request & { user: JwtUser },
  ) {
    this.assertAdmin(req);
    return this.svc.createActivity(body, req.user.id);
  }

  @Patch('activities/:id')
  updateActivity(
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string; points?: number; claimType?: 'MANUAL' | 'AUTOMATIC'; isActive?: boolean },
    @Req() req: Request & { user: JwtUser },
  ) {
    this.assertAdmin(req);
    return this.svc.updateActivity(id, body);
  }

  // ── Claims ─────────────────────────────────────────────────────────────
  @Post('claims')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  submitClaim(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { activityId?: string; details?: string },
    @Req() req: Request & { user: JwtUser },
  ) {
    return this.svc.submitClaim(req.user.id, body.activityId ?? '', body.details ?? '', file);
  }

  @Get('claims/mine')
  myClaims(@Req() req: Request & { user: JwtUser }) {
    return this.svc.listClaims({ userId: req.user.id });
  }

  @Get('claims')
  listClaims(@Query('status') status: string | undefined, @Req() req: Request & { user: JwtUser }) {
    this.assertAdmin(req);
    return this.svc.listClaims({ status });
  }

  @Patch('claims/:id/approve')
  approveClaim(@Param('id') id: string, @Body() body: { note?: string }, @Req() req: Request & { user: JwtUser }) {
    this.assertAdmin(req);
    return this.svc.approveClaim(id, req.user.id, body?.note);
  }

  @Patch('claims/:id/reject')
  rejectClaim(@Param('id') id: string, @Body() body: { note?: string }, @Req() req: Request & { user: JwtUser }) {
    this.assertAdmin(req);
    return this.svc.rejectClaim(id, req.user.id, body?.note);
  }

  // ── Direct credit — AUTOMATIC activities only, admin-triggered ──────────
  @Post('claims/direct-credit')
  directCredit(
    @Body() body: { activityId?: string; userId?: string; note?: string },
    @Req() req: Request & { user: JwtUser },
  ) {
    this.assertAdmin(req);
    return this.svc.directCredit(body.activityId ?? '', body.userId ?? '', req.user.id, body.note);
  }

  // ── Leaderboard — every staff member's current balance ──────────────────
  @Get('leaderboard')
  leaderboard() {
    return this.svc.leaderboard();
  }
}
