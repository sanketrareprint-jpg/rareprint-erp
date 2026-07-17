// backend/src/attendance/attendance.controller.ts
import {
  Body, Controller, ForbiddenException, Get, Param, Post, Put,
  Query, Req, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AttendanceService } from './attendance.service';

@Controller('attendance')
@UseGuards(JwtAuthGuard)
export class AttendanceController {
  constructor(private readonly svc: AttendanceService) {}

  private assertHrAccess(req: any) {
    if (!['ADMIN', 'ACCOUNTS'].includes(req.user?.role)) {
      throw new ForbiddenException('Attendance management is restricted to admin/accounts');
    }
  }

  /** POST /attendance/import  (multipart field: "file", the machine's exported .xls) */
  @Post('import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  importReport(@UploadedFile() file: Express.Multer.File, @Req() req: any) {
    this.assertHrAccess(req);
    if (!file) throw new ForbiddenException('file is required (field: file)');
    return this.svc.importFromMachineReport(file.buffer, file.originalname, req.user.id);
  }

  @Get('import-sessions')
  listSessions(@Req() req: any) {
    this.assertHrAccess(req);
    return this.svc.listImportSessions();
  }

  @Get('employees/:id/month')
  async getMonthGrid(
    @Param('id') id: string,
    @Query('year') year: string | undefined,
    @Query('month') month: string | undefined,
    @Req() req: any,
  ) {
    this.assertHrAccess(req);
    const now = new Date();
    return this.svc.getMonthGrid(id, year ? Number(year) : now.getFullYear(), month ? Number(month) : now.getMonth() + 1);
  }

  @Put('employees/:id/day/:date')
  upsertDay(
    @Param('id') id: string,
    @Param('date') date: string,
    @Body() dto: any,
    @Req() req: any,
  ) {
    this.assertHrAccess(req);
    return this.svc.upsertDay(id, date, dto, req.user.id);
  }
}
