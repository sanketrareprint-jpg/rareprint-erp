// backend/src/virtual-ceo/virtual-ceo.controller.ts
import {
  Controller, Get, Post, Put, Param, Body, UseGuards, Request, ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { VirtualCeoService } from './virtual-ceo.service';

@Controller('virtual-ceo')
@UseGuards(JwtAuthGuard)
export class VirtualCeoController {
  constructor(private readonly svc: VirtualCeoService) {}

  /** GET /virtual-ceo/report — full action report */
  @Get('report')
  async getReport() {
    return this.svc.generateReport();
  }

  /** GET /virtual-ceo/trigger-whatsapp — manual trigger of the WhatsApp report */
  @Get('trigger-whatsapp')
  async triggerWhatsApp() {
    await this.svc.sendDailyWhatsAppReport();
    return { ok: true, message: 'WhatsApp report triggered' };
  }

  /** GET /virtual-ceo/trigger-envelope-list — manual trigger of the daily Raza Envelope pending list */
  @Get('trigger-envelope-list')
  async triggerEnvelopeList() {
    const result = await this.svc.sendDailyEnvelopeList();
    return { ok: true, ...result };
  }

  // ─── Review Tracking ──────────────────────────────────────────────────────

  /** GET /virtual-ceo/review-status — get today's review status + task actions */
  @Get('review-status')
  async reviewStatus(@Request() req: { user: { id: string } }) {
    const userId = req.user.id;
    const [status, actions] = await Promise.all([
      this.svc.getReviewStatus(userId),
      this.svc.getTodayActions(userId),
    ]);
    return { ...status, ...actions };
  }

  /** POST /virtual-ceo/popup-shown — start 2-hour countdown */
  @Post('popup-shown')
  async popupShown(@Request() req: { user: { id: string } }) {
    return this.svc.markPopupShown(req.user.id);
  }

  /** POST /virtual-ceo/task-action — save Updated/FollowUp action for a task */
  @Post('task-action')
  async taskAction(
    @Request() req: { user: { id: string } },
    @Body() body: { itemId: string; action: string | null },
  ) {
    return this.svc.saveTaskAction(req.user.id, body.itemId, body.action);
  }

  /** POST /virtual-ceo/complete-review — mark daily review as done */
  @Post('complete-review')
  async completeReview(@Request() req: { user: { id: string } }) {
    return this.svc.completeReview(req.user.id);
  }

  // ─── Admin Endpoints ──────────────────────────────────────────────────────

  /** GET /virtual-ceo/admin/lock-status — view locked/pending users */
  @Get('admin/lock-status')
  async adminLockStatus(@Request() req: { user: { role: string } }) {
    if (req.user.role !== 'ADMIN') throw new ForbiddenException('Admin only');
    return this.svc.adminGetLockStatus();
  }

  /** POST /virtual-ceo/admin/unlock/:userId — unlock a user account */
  @Post('admin/unlock/:userId')
  async adminUnlock(
    @Request() req: { user: { role: string } },
    @Param('userId') userId: string,
  ) {
    if (req.user.role !== 'ADMIN') throw new ForbiddenException('Admin only');
    return this.svc.adminUnlockUser(userId);
  }

  /** GET /virtual-ceo/admin/review-history — all users review history */
  @Get('admin/review-history')
  async allReviewHistory(@Request() req: { user: { role: string } }) {
    if (req.user.role !== 'ADMIN') throw new ForbiddenException('Admin only');
    return this.svc.adminGetAllReviewHistory();
  }

  /** GET /virtual-ceo/admin/review-history/:userId — single user history */
  @Get('admin/review-history/:userId')
  async userReviewHistory(
    @Request() req: { user: { role: string } },
    @Param('userId') userId: string,
  ) {
    if (req.user.role !== 'ADMIN') throw new ForbiddenException('Admin only');
    return this.svc.adminGetReviewHistory(userId);
  }

  /** PUT /virtual-ceo/admin/required-reviewers — set who must review daily */
  @Put('admin/required-reviewers')
  async setRequiredReviewers(
    @Request() req: { user: { role: string } },
    @Body() body: { userIds: string[] },
  ) {
    if (req.user.role !== 'ADMIN') throw new ForbiddenException('Admin only');
    return this.svc.setRequiredReviewers(body.userIds);
  }
}
