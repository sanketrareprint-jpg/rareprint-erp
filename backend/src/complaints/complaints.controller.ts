// backend/src/complaints/complaints.controller.ts
import { Body, Controller, Get, Param, Patch, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { ComplaintsService } from './complaints.service';
import { ComplaintsSlaService } from './complaints.sla.service';
import { ComplaintPriority, ComplaintStatus, SlaTargets } from './complaints.calc';
import { CreateComplaintDto } from './dto/create-complaint.dto';
import { AssignComplaintDto, UpdateStatusDto } from './dto/update-complaint.dto';
import { AddAttachmentDto, AddCommentDto } from './dto/add-comment.dto';
import { CsatDto, ReopenComplaintDto, ResolveComplaintDto } from './dto/resolve-complaint.dto';

type JwtUser = { id: string; role: string };

@Controller('complaints')
@UseGuards(AuthGuard('jwt'))
export class ComplaintsController {
  constructor(
    private readonly complaintsService: ComplaintsService,
    private readonly slaService: ComplaintsSlaService,
  ) {}

  @Get()
  list(
    @Query('status') status?: ComplaintStatus,
    @Query('priority') priority?: ComplaintPriority,
    @Query('category') category?: string,
    @Query('assignedToId') assignedToId?: string,
    @Query('customerId') customerId?: string,
    @Query('orderId') orderId?: string,
    @Query('overdue') overdue?: string,
  ) {
    return this.complaintsService.list({
      status,
      priority,
      category,
      assignedToId,
      customerId,
      orderId,
      overdue: overdue === 'true',
    });
  }

  @Get('stats')
  stats() {
    return this.complaintsService.stats();
  }

  @Get('users')
  users() {
    return this.complaintsService.listAssignableUsers();
  }

  @Get('config/sla')
  getSlaConfig() {
    return this.complaintsService.getSlaConfig();
  }

  @Patch('config/sla')
  updateSlaConfig(@Body() body: Partial<Record<ComplaintPriority, Partial<SlaTargets>>>) {
    return this.complaintsService.updateSlaConfig(body);
  }

  @Get('config/general')
  getGeneralConfig() {
    return this.complaintsService.getGeneralConfig();
  }

  @Patch('config/general')
  updateGeneralConfig(@Body() body: { reopenWindowDays?: number; autoCloseDays?: number }) {
    return this.complaintsService.updateGeneralConfig(body);
  }

  @Post('run-sla-check')
  runSlaCheck() {
    return this.slaService.triggerManualCheck();
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.complaintsService.getById(id);
  }

  @Post()
  create(@Body() body: CreateComplaintDto, @Req() req: Request & { user: JwtUser }) {
    return this.complaintsService.create(body, req.user?.id);
  }

  @Patch(':id/assign')
  assign(@Param('id') id: string, @Body() body: AssignComplaintDto, @Req() req: Request & { user: JwtUser }) {
    return this.complaintsService.assign(id, body, req.user?.id);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() body: UpdateStatusDto, @Req() req: Request & { user: JwtUser }) {
    return this.complaintsService.updateStatus(id, body, req.user?.id);
  }

  @Post(':id/comments')
  addComment(@Param('id') id: string, @Body() body: AddCommentDto, @Req() req: Request & { user: JwtUser }) {
    return this.complaintsService.addComment(id, body, req.user?.id);
  }

  @Post(':id/attachments')
  addAttachment(@Param('id') id: string, @Body() body: AddAttachmentDto, @Req() req: Request & { user: JwtUser }) {
    return this.complaintsService.addAttachment(id, body, req.user?.id);
  }

  // Photo of damage / screenshot upload — stored as a base64 data URI on the
  // ComplaintAttachment row, same "DB is the source of truth" convention as
  // orders.controller.ts's design-file upload (Railway storage isn't durable).
  @Post(':id/attachments/upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  addAttachmentFile(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request & { user: JwtUser },
  ) {
    return this.complaintsService.addAttachmentFile(id, file, req.user?.id);
  }

  @Patch(':id/resolve')
  resolve(@Param('id') id: string, @Body() body: ResolveComplaintDto, @Req() req: Request & { user: JwtUser }) {
    return this.complaintsService.resolve(id, body, req.user?.id);
  }

  @Post(':id/reopen')
  reopen(@Param('id') id: string, @Body() body: ReopenComplaintDto, @Req() req: Request & { user: JwtUser }) {
    return this.complaintsService.reopen(id, body, req.user?.id);
  }

  @Post(':id/csat')
  csat(@Param('id') id: string, @Body() body: CsatDto) {
    return this.complaintsService.csat(id, body);
  }
}
