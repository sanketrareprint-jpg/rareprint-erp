// backend/src/hr/hr-agreement.controller.ts
//
// Public, unauthenticated endpoints for the digital HR agreement acceptance
// page. Deliberately a separate controller (no JwtAuthGuard) from
// HrController — the employee opening this link has no login account.
// Access is gated purely by possession of the random token, not a session.
import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { HrService } from './hr.service';

@Controller('hr/agreement')
export class HrAgreementController {
  constructor(private readonly svc: HrService) {}

  @Get(':token')
  getAgreement(@Param('token') token: string) {
    return this.svc.getAgreementByToken(token);
  }

  @Post(':token/accept')
  acceptAgreement(@Param('token') token: string, @Body() dto: { signatureName: string }, @Req() req: Request) {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
    return this.svc.acceptAgreement(token, { signatureName: dto?.signatureName, ip });
  }
}
