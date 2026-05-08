// File: backend/src/crm/crm.controller.ts
import {
  Controller, Get, Post, Patch, Body, Param, Query, Req, UseGuards,
} from '@nestjs/common';
import { CrmService } from './crm.service';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';

interface JwtUser { id: string; role: string; }

@Controller('crm')
@UseGuards(AuthGuard('jwt'))
export class CrmController {
  constructor(private readonly crmService: CrmService) {}

  @Get('leads')
  getLeads(
    @Req() req: Request & { user: JwtUser },
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.crmService.getLeads(req.user.id, req.user.role, status, search);
  }

  @Get('leads/today-followups')
  getTodayFollowUps(@Req() req: Request & { user: JwtUser }) {
    return this.crmService.getTodayFollowUps(req.user.id, req.user.role);
  }

  @Get('leads/dialer/next')
  getNextDialerLead(
    @Req() req: Request & { user: JwtUser },
    @Query('currentLeadId') currentLeadId?: string,
  ) {
    return this.crmService.getNextDialerLead(req.user.id, currentLeadId);
  }

  @Get('leads/stats')
  getStats(@Req() req: Request & { user: JwtUser }) {
    return this.crmService.getStats(req.user.id, req.user.role);
  }

  @Get('leads/duplicate-check')
  checkDuplicate(@Query('phone') phone: string) {
    return this.crmService.getDuplicateAlert(phone);
  }

  @Get('leads/:id')
  getLeadById(@Param('id') id: string) {
    return this.crmService.getLeadById(id);
  }

  @Post('leads/meta-webhook')
  receiveMetaLead(@Body() body: any) {
    return this.crmService.receiveMetaLead(body);
  }

  @Post('leads/:id/send-to-aisensy')
  sendToAisensy(
    @Param('id') id: string,
    @Req() req: Request & { user: JwtUser },
  ) {
    return this.crmService.sendLeadToAisensy(id, req.user.id);
  }

  @Post('leads')
  createLead(
    @Body() body: any,
    @Req() req: Request & { user: JwtUser },
  ) {
    return this.crmService.createLead(body, req.user.id);
  }

  @Post('leads/bulk-import')
  bulkImport(
    @Body() body: { rows: any[] },
    @Req() req: Request & { user: JwtUser },
  ) {
    return this.crmService.bulkImport(body.rows, req.user.id);
  }

  @Patch('leads/:id/status')
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: any,
    @Req() req: Request & { user: JwtUser },
  ) {
    return this.crmService.updateStatus(id, status, req.user.id);
  }

  @Post('leads/:id/call')
  logCall(
    @Param('id') id: string,
    @Body() body: { outcome: string; note: string },
    @Req() req: Request & { user: JwtUser },
  ) {
    return this.crmService.logCall(id, body.outcome, body.note, req.user.id);
  }

  @Post('leads/:id/note')
  addNote(
    @Param('id') id: string,
    @Body('note') note: string,
    @Req() req: Request & { user: JwtUser },
  ) {
    return this.crmService.addNote(id, note, req.user.id);
  }
}


