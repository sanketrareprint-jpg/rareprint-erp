// backend/src/marketing-roi/marketing-roi.controller.ts
import {
  Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query,
  Req, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { MarketingRoiService } from './marketing-roi.service';

type JwtUser = { id: string; role: string };

@Controller('marketing/roi')
@UseGuards(AuthGuard('jwt'))
export class MarketingRoiController {
  constructor(private readonly service: MarketingRoiService) {}

  private assertAdmin(req: Request & { user: JwtUser }) {
    if (req.user?.role !== 'ADMIN') {
      throw new ForbiddenException('Only admins can manage Marketing ROI data');
    }
  }

  @Get('months')
  listMonths(@Query('count') count: string | undefined) {
    return this.service.listMonths(count ? Number(count) : 12);
  }

  @Get('months/:monthKey')
  getMonth(@Param('monthKey') monthKey: string) {
    return this.service.getMonthRoi(monthKey);
  }

  @Patch('months/:monthKey/spend')
  upsertSpend(
    @Param('monthKey') monthKey: string,
    @Body() body: { metaAdSpend?: number; aisensySpend?: number; notes?: string },
    @Req() req: Request & { user: JwtUser },
  ) {
    this.assertAdmin(req);
    return this.service.upsertSpend(monthKey, body, req.user.id);
  }

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
}
