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

  /** GET /api/sheet-layout/patterns?sheetSize=18x23 */
  @Get('patterns')
  getPatterns(@Query('sheetSize') sheetSize?: string) {
    return this.svc.getPatterns(sheetSize as SheetSize | undefined);
  }

  /** GET /api/sheet-layout/patterns/:id */
  @Get('patterns/:id')
  getPattern(@Param('id') id: string) {
    const p = this.svc.getPattern(id);
    if (!p) throw new BadRequestException(`Pattern ${id} not found`);
    return p;
  }

  /**
   * POST /api/sheet-layout/assemble
   * Body: multipart/form-data
   *   patternId: string
   *   slot_0 … slot_N: image files (one per slot, positional order matches pattern)
   * Returns: CMYK TIFF file
   */
  @Post('assemble')
  @UseInterceptors(FilesInterceptor('slots', 20, { limits: { fileSize: 40 * 1024 * 1024 } }))
  async assembleSheet(
    @Query('patternId') patternId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Res() res: Response,
  ) {
    if (!patternId) throw new BadRequestException('patternId is required');

    // Map slot index → buffer from the uploaded files array
    // Files are named slot_0, slot_1, … slot_N OR just uploaded in order
    const pattern = this.svc.getPattern(patternId);
    if (!pattern) throw new BadRequestException(`Unknown pattern: ${patternId}`);

    const slotImages = new Map<number, Buffer>();
    if (files && files.length > 0) {
      for (const file of files) {
        // Try to extract index from fieldname (slot_0, slot_1, …)
        const match = file.fieldname.match(/slot[_-]?(\d+)/i);
        const idx = match ? parseInt(match[1], 10) : files.indexOf(file);
        slotImages.set(idx, file.buffer);
      }
    }

    const tiffBuffer = await this.svc.assembleSheet(patternId, slotImages);

    res.set({
      'Content-Type': 'image/tiff',
      'Content-Disposition': `attachment; filename="sheet-${patternId}-600dpi-cmyk.tiff"`,
      'Content-Length': String(tiffBuffer.length),
    });
    res.end(tiffBuffer);
  }
}
