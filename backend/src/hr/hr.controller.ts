// backend/src/hr/hr.controller.ts
import {
  Body, Controller, Delete, ForbiddenException, Get, Param, Post, Put, Query, Req, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HrService, EmployeeUpsertDto, SUPERADMIN_EMAIL } from './hr.service';

@Controller('hr')
@UseGuards(JwtAuthGuard)
export class HrController {
  constructor(
    private readonly svc: HrService,
    private readonly config: ConfigService,
  ) {}

  // Employee master is HR/payroll data — admin (and accounts, who run payroll) only.
  private assertHrAccess(req: any) {
    if (!['ADMIN', 'ACCOUNTS'].includes(req.user?.role)) {
      throw new ForbiddenException('HR access is restricted to admin/accounts');
    }
  }

  // Approving a master record for payroll (and managing company Terms &
  // Conditions) is restricted to Sanket specifically, not any admin.
  private assertSuperAdmin(req: any) {
    if (req.user?.email !== SUPERADMIN_EMAIL) {
      throw new ForbiddenException('Only Sanket can approve employee records for payroll');
    }
  }

  // ── Employees ──────────────────────────────────────────────────────────

  @Get('employees')
  listEmployees(@Query('status') status: string | undefined, @Req() req: any) {
    this.assertHrAccess(req);
    return this.svc.listEmployees(status);
  }

  @Get('employees/next-code')
  nextCode(@Req() req: any) {
    this.assertHrAccess(req);
    return this.svc.nextEmployeeCode();
  }

  @Get('employees/:id')
  getEmployee(@Param('id') id: string, @Req() req: any) {
    this.assertHrAccess(req);
    return this.svc.getEmployee(id);
  }

  @Post('employees')
  createEmployee(@Body() dto: EmployeeUpsertDto, @Req() req: any) {
    this.assertHrAccess(req);
    return this.svc.createEmployee(dto);
  }

  @Put('employees/:id')
  updateEmployee(@Param('id') id: string, @Body() dto: EmployeeUpsertDto, @Req() req: any) {
    this.assertHrAccess(req);
    return this.svc.updateEmployee(id, dto);
  }

  @Put('employees/:id/status')
  setStatus(
    @Param('id') id: string,
    @Body() dto: { status: 'ACTIVE' | 'ON_LEAVE' | 'RESIGNED' | 'TERMINATED' },
    @Req() req: any,
  ) {
    this.assertHrAccess(req);
    return this.svc.setEmployeeStatus(id, dto.status);
  }

  // Sanket-only: approve/unapprove a master record for payroll.
  @Put('employees/:id/approve')
  approveEmployee(@Param('id') id: string, @Req() req: any) {
    this.assertSuperAdmin(req);
    return this.svc.approveEmployee(id, req.user.id);
  }

  @Put('employees/:id/unapprove')
  unapproveEmployee(@Param('id') id: string, @Req() req: any) {
    this.assertSuperAdmin(req);
    return this.svc.unapproveEmployee(id);
  }

  // Photo upload — stored as a base64 data URI directly in photoUrl (matches
  // this repo's existing convention for uploads on hosts with an ephemeral
  // filesystem, see orders.controller.ts's design-files DB fallback).
  @Post('employees/:id/photo')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 3 * 1024 * 1024 } }))
  async uploadPhoto(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @Req() req: any) {
    this.assertHrAccess(req);
    if (!file) throw new ForbiddenException('file is required (field: file)');
    if (!file.mimetype?.startsWith('image/')) throw new ForbiddenException('Only image files are allowed');
    const dataUri = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    return this.svc.updateEmployee(id, { photoUrl: dataUri });
  }

  // ── Company Terms & Conditions ────────────────────────────────────────

  @Get('terms')
  listTerms(@Req() req: any) {
    this.assertHrAccess(req);
    return this.svc.listTerms();
  }

  @Get('terms/active')
  activeTerms(@Req() req: any) {
    this.assertHrAccess(req);
    return this.svc.getActiveTerms();
  }

  @Post('terms')
  createTerms(@Body() dto: { title: string; content: string }, @Req() req: any) {
    this.assertHrAccess(req);
    return this.svc.createTerms(dto, req.user.id);
  }

  // ── Digital HR agreement (send only — accept/view is on HrAgreementController, unguarded) ──

  @Post('employees/:id/send-agreement')
  sendAgreement(@Param('id') id: string, @Req() req: any) {
    this.assertHrAccess(req);
    const origin = this.config.get<string>('FRONTEND_ORIGIN') ?? 'https://rareprint-erp.vercel.app';
    return this.svc.sendAgreement(id, req.user.id, origin);
  }

  // ── KRA / Responsibilities ────────────────────────────────────────────

  @Get('employees/:id/kras')
  listKras(@Param('id') id: string, @Req() req: any) {
    this.assertHrAccess(req);
    return this.svc.listKras(id);
  }

  @Post('employees/:id/kras')
  addKra(@Param('id') id: string, @Body() dto: any, @Req() req: any) {
    this.assertHrAccess(req);
    return this.svc.addKra(id, dto);
  }

  @Put('kras/:kraId')
  updateKra(@Param('kraId') kraId: string, @Body() dto: any, @Req() req: any) {
    this.assertHrAccess(req);
    return this.svc.updateKra(kraId, dto);
  }

  @Delete('kras/:kraId')
  deleteKra(@Param('kraId') kraId: string, @Req() req: any) {
    this.assertHrAccess(req);
    return this.svc.deleteKra(kraId);
  }

  // ── Leave ledger ──────────────────────────────────────────────────────

  @Get('employees/:id/leaves')
  listLeaves(@Param('id') id: string, @Query('year') year: string | undefined, @Req() req: any) {
    this.assertHrAccess(req);
    return this.svc.listLeaveEntries(id, year ? Number(year) : undefined);
  }

  @Get('employees/:id/leave-balance')
  leaveBalance(@Param('id') id: string, @Query('year') year: string | undefined, @Req() req: any) {
    this.assertHrAccess(req);
    const now = new Date();
    return this.svc.leaveBalance(id, year ? Number(year) : now.getFullYear());
  }

  @Post('employees/:id/leaves')
  addLeave(@Param('id') id: string, @Body() dto: any, @Req() req: any) {
    this.assertHrAccess(req);
    return this.svc.addLeaveEntry(id, dto, req.user.id);
  }

  @Delete('leaves/:entryId')
  deleteLeave(@Param('entryId') entryId: string, @Req() req: any) {
    this.assertHrAccess(req);
    return this.svc.deleteLeaveEntry(entryId);
  }

  // Self-serve lookup: any logged-in user may check whether they have a linked
  // Employee record (needed by Salary & Commission to find their salary calc).
  @Get('employees/by-user/:userId')
  findByUser(@Param('userId') userId: string, @Req() req: any) {
    if (!['ADMIN', 'ACCOUNTS'].includes(req.user?.role) && req.user?.id !== userId) {
      throw new ForbiddenException('You can only look up your own employee record');
    }
    return this.svc.findByUserId(userId);
  }

  // ── Salary (attendance-driven) ────────────────────────────────────────

  @Get('employees/:id/salary')
  async salaryForMonth(
    @Param('id') id: string,
    @Query('year') year: string | undefined,
    @Query('month') month: string | undefined,
    @Req() req: any,
  ) {
    // Employees may view their own attendance-based salary breakdown
    // (self-serve, mirrors cost-table's assertSelfOrAdmin pattern); admin/accounts see anyone's.
    if (!['ADMIN', 'ACCOUNTS'].includes(req.user?.role)) {
      const ownerUserId = await this.svc.getEmployeeOwnerUserId(id);
      if (ownerUserId !== req.user?.id) {
        throw new ForbiddenException('You can only view your own salary breakdown');
      }
    }
    const now = new Date();
    return this.svc.salaryForMonth(id, year ? Number(year) : now.getFullYear(), month ? Number(month) : now.getMonth() + 1);
  }

  @Get('salary/summary')
  salarySummary(
    @Query('year') year: string | undefined,
    @Query('month') month: string | undefined,
    @Query('status') status: string | undefined,
    @Req() req: any,
  ) {
    this.assertHrAccess(req);
    const now = new Date();
    return this.svc.salarySummary(
      year ? Number(year) : now.getFullYear(),
      month ? Number(month) : now.getMonth() + 1,
      status,
    );
  }
}
