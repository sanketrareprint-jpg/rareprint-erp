import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { ReportsService, type ReportType } from './reports.service';

@Controller('reports')
@UseGuards(AuthGuard('jwt'))
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  async getReport(
    @Query('type') type: ReportType = 'orders',
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.generate(type, from, to);
  }

  @Get('download')
  async downloadReport(
    @Res() res: Response,
    @Query('type') type: ReportType = 'orders',
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const report = await this.reports.generate(type, from, to);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${report.type}-report.csv"`);
    res.send(this.reports.toCsv(report.rows));
  }
}
