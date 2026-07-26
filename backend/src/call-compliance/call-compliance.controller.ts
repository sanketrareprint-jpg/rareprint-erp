// backend/src/call-compliance/call-compliance.controller.ts
import {
  Body, Controller, Delete, ForbiddenException, Get, Param, Post, Put, Query,
  Req, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { CallComplianceService } from './call-compliance.service';

type JwtUser = { id: string; role: string; fullName?: string };

@Controller('call-compliance')
@UseGuards(AuthGuard('jwt'))
export class CallComplianceController {
  constructor(private readonly service: CallComplianceService) {}

  private assertAdmin(req: Request & { user: JwtUser }) {
    if (req.user?.role !== 'ADMIN') {
      throw new ForbiddenException('Only admins can manage call-compliance imports and agent mapping');
    }
  }

  // ── Call log (PDF) import ────────────────────────────────────────────
  @Post('call-logs/import')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    fileFilter: (_req, file, cb) => {
      if (/\.pdf$/i.test(file.originalname)) cb(null, true);
      else cb(new Error('Only PDF statement files are supported'), false);
    },
    limits: { fileSize: 25 * 1024 * 1024 },
  }))
  importCallLog(
    @UploadedFile() file: Express.Multer.File,
    @Body('agentId') agentId: string | undefined,
    @Req() req: Request & { user: JwtUser },
  ) {
    this.assertAdmin(req);
    return this.service.importCallLogPdf(file, req.user.id, agentId || undefined);
  }

  @Get('call-logs/imports')
  listCallLogImports(@Req() req: Request & { user: JwtUser }) {
    this.assertAdmin(req);
    return this.service.listCallLogImports();
  }

  @Put('call-logs/imports/:id/assign')
  assignCallLogImport(
    @Param('id') id: string,
    @Body('agentId') agentId: string,
    @Req() req: Request & { user: JwtUser },
  ) {
    this.assertAdmin(req);
    return this.service.assignCallLogImport(id, agentId);
  }

  @Delete('call-logs/imports/:id')
  deleteCallLogImport(@Param('id') id: string, @Req() req: Request & { user: JwtUser }) {
    this.assertAdmin(req);
    return this.service.deleteCallLogImport(id);
  }

  // ── AiSensy contacts (CSV) import ────────────────────────────────────
  @Post('contacts/import')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    fileFilter: (_req, file, cb) => {
      if (/\.csv$/i.test(file.originalname)) cb(null, true);
      else cb(new Error('Only CSV files are supported'), false);
    },
    limits: { fileSize: 25 * 1024 * 1024 },
  }))
  importContacts(@UploadedFile() file: Express.Multer.File, @Req() req: Request & { user: JwtUser }) {
    this.assertAdmin(req);
    return this.service.importContactsCsv(file, req.user.id);
  }

  @Get('contacts/imports')
  listContactImports(@Req() req: Request & { user: JwtUser }) {
    this.assertAdmin(req);
    return this.service.listContactImports();
  }

  // ── Agent <-> AiSensy tag mapping ────────────────────────────────────
  @Get('agents')
  listAgents(@Req() req: Request & { user: JwtUser }) {
    this.assertAdmin(req);
    return this.service.listAgents();
  }

  @Put('agents/:id/tag')
  setAgentTag(
    @Param('id') id: string,
    @Body('aisensyTag') aisensyTag: string | null,
    @Req() req: Request & { user: JwtUser },
  ) {
    this.assertAdmin(req);
    return this.service.setAgentTag(id, aisensyTag);
  }

  // ── Compliance stats ─────────────────────────────────────────────────
  // All of these take an optional ?month=YYYY-MM to scope the report to one
  // month's tagged contacts / call activity — omit it for the all-time view.

  @Get('months')
  listAvailableMonths() {
    return this.service.listAvailableMonths();
  }

  @Get('dashboard')
  getDashboard(@Query('month') month?: string) {
    // Visible to everyone (namewise not-contacted + tags-applied summary).
    return this.service.getComplianceDashboard(month || undefined);
  }

  @Get('my-stats')
  getMyStats(@Req() req: Request & { user: JwtUser }, @Query('month') month?: string) {
    return this.service.getAgentComplianceStats(req.user.id, month || undefined);
  }

  @Get('not-contacted')
  getNotContactedLeads(@Req() req: Request & { user: JwtUser }, @Query('month') month?: string) {
    // Admins see every agent's not-contacted leads; agents see only their own.
    return this.service.getNotContactedLeads(req.user, month || undefined);
  }

  @Get('agents/:id/stats')
  getAgentStats(@Param('id') id: string, @Req() req: Request & { user: JwtUser }, @Query('month') month?: string) {
    if (req.user.role !== 'ADMIN' && req.user.id !== id) {
      throw new ForbiddenException('You can only view your own compliance stats');
    }
    return this.service.getAgentComplianceStats(id, month || undefined);
  }
}
