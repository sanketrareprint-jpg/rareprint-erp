import {
  Controller, Get, Post, Query, Param, Res,
  UploadedFiles, UseInterceptors, BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { SheetLayoutService, SheetSize } from './sheet-layout.service';

@Controller('sheet-layout')
export class SheetLayoutController {
  constructor(private readonly svc: SheetLayoutService) {}

  @Get('patterns')
  getPatterns(@Query('sheetSize') sheetSize?: string) {
    return this.svc.getPatterns(sheetSize as SheetSize | undefined);
  }

  @Get('patterns/:id')
  getPattern(@Param('id') id: string) {
    const p = this.svc.getPattern(id);
    if (!p) throw new BadRequestException(`Pattern ${id} not found`);
    return p;
  }

  /**
   * POST /api/sheet-layout/assemble?patternId=18x23_4L&gapMm=2
   * Body: multipart/form-data — field name "slots", one file per slot in order
   * Returns: JPEG (300 DPI, no cut lines)
   */
  @Post('assemble')
  @UseInterceptors(FilesInterceptor('slots', 20, { limits: { fileSize: 40 * 1024 * 1024 } }))
  async assembleSheet(
    @Query('patternId') patternId: string,
    @Query('gapMm') gapMmStr: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Res() res: Response,
  ) {
    if (!patternId) throw new BadRequestException('patternId is required');
    const pattern = this.svc.getPattern(patternId);
    if (!pattern) throw new BadRequestException(`Unknown pattern: ${patternId}`);

    const gapMm = Math.max(0, Math.min(20, parseFloat(gapMmStr ?? '0') || 0));

    // Map upload order → slot index
    const slotImages = new Map<number, Buffer>();
    if (files?.length) {
      files.forEach((file, idx) => {
        const match = file.fieldname.match(/slot[_-]?(\d+)/i);
        slotImages.set(match ? parseInt(match[1], 10) : idx, file.buffer);
      });
    }

    const jpegBuffer = await this.svc.assembleSheet(patternId, slotImages, gapMm);

    res.set({
      'Content-Type': 'image/jpeg',
      'Content-Disposition': `attachment; filename="sheet-${patternId}-300dpi.jpg"`,
      'Content-Length': String(jpegBuffer.length),
    });
    res.end(jpegBuffer);
  }
}
