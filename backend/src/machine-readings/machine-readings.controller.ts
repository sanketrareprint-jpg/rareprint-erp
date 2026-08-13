// backend/src/machine-readings/machine-readings.controller.ts
import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { MachineReadingsService } from './machine-readings.service';

type JwtUser = { id: string; role: string; email: string };

@Controller('machine-readings')
@UseGuards(AuthGuard('jwt'))
export class MachineReadingsController {
  constructor(private readonly service: MachineReadingsService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Get('pending-summary')
  getPendingSummary() {
    return this.service.getPendingSummary();
  }

  @Get('monthly')
  getMonthlyReadings() {
    return this.service.getMonthlyReadings();
  }

  @Post()
  create(
    @Body() dto: { readingDate: string; readingValue: number; wasReset?: boolean; notes?: string },
    @Req() req: Request & { user: JwtUser },
  ) {
    return this.service.create(dto, req.user?.id);
  }

  @Post(':id/mark-paid')
  markPaid(
    @Param('id') id: string,
    @Body() dto: { paidAmount?: number; paidNote?: string },
    @Req() req: Request & { user: JwtUser },
  ) {
    return this.service.markPaid(id, dto, req.user?.id);
  }

  @Post(':id/unmark-paid')
  unmarkPaid(@Param('id') id: string) {
    return this.service.unmarkPaid(id);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
