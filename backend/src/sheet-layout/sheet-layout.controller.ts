import {
  Controller,
  Get,
  Post,
  Query,
  Param,
  Body,
  Res,
  UploadedFiles,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  SheetLayoutService,
  SheetSize,
  SHEET_DEFS,
} from './sheet-layout.service';

/** Most designs one free-layout sheet can hold. */
const MAX_FREE_LAYERS = 60;

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
   * Returns: JPEG (600 DPI, no cut lines)
   */
  @Post('assemble')
  @UseInterceptors(
    FilesInterceptor('slots', 20, { limits: { fileSize: 40 * 1024 * 1024 } }),
  )
  async assembleSheet(
    @Query('patternId') patternId: string,
    @Query('gapMm') gapMmStr: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Res() res: Response,
  ) {
    if (!patternId) throw new BadRequestException('patternId is required');
    const pattern = this.svc.getPattern(patternId);
    if (!pattern)
      throw new BadRequestException(`Unknown pattern: ${patternId}`);

    const gapMm = Math.max(0, Math.min(20, parseFloat(gapMmStr ?? '0') || 0));

    // Map upload order → slot index
    const slotImages = new Map<number, Buffer>();
    if (files?.length) {
      files.forEach((file, idx) => {
        const match = `${file.fieldname} ${file.originalname}`.match(
          /slot[_-]?(\d+)/i,
        );
        slotImages.set(match ? parseInt(match[1], 10) : idx, file.buffer);
      });
    }

    const jpegBuffer = await this.svc.assembleSheet(
      patternId,
      slotImages,
      gapMm,
    );

    res.set({
      'Content-Type': 'image/jpeg',
      'Content-Disposition': `attachment; filename="sheet-${patternId}-600dpi.jpg"`,
      'Content-Length': String(jpegBuffer.length),
    });
    res.end(jpegBuffer);
  }

  /**
   * POST /api/sheet-layout/assemble-free?sheetSize=18x23
   * Body: multipart/form-data — "layers" files named layer_<i>, plus a
   * "placements" JSON field: [{ xIn, yIn, wIn, hIn }, …] indexed by <i>,
   * bottom layer first. Returns: JPEG (600 DPI).
   */
  @Post('assemble-free')
  @UseInterceptors(
    FilesInterceptor('layers', MAX_FREE_LAYERS, {
      limits: { fileSize: 40 * 1024 * 1024 },
    }),
  )
  async assembleFreeSheet(
    @Query('sheetSize') sheetSize: string,
    @Body('placements') placementsRaw: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Res() res: Response,
  ) {
    if (!sheetSize || !(sheetSize in SHEET_DEFS))
      throw new BadRequestException(`Unknown sheet size: ${sheetSize}`);
    const sheet = SHEET_DEFS[sheetSize as SheetSize];
    if (!files?.length)
      throw new BadRequestException('Add at least one design');

    let placements: unknown;
    try {
      placements = JSON.parse(placementsRaw ?? '');
    } catch {
      throw new BadRequestException('placements must be JSON');
    }
    if (!Array.isArray(placements) || placements.length > MAX_FREE_LAYERS)
      throw new BadRequestException(
        'placements must be an array of layer positions',
      );

    const limitW = sheet.widthIn * 2;
    const limitH = sheet.heightIn * 2;
    const layers = files.map((file) => {
      const m = file.originalname.match(/layer[_-]?(\d+)/i);
      const index = m ? parseInt(m[1], 10) : -1;
      const p = placements[index] as Record<string, unknown> | undefined;
      const nums = p ? [p.xIn, p.yIn, p.wIn, p.hIn] : [];
      if (
        nums.length !== 4 ||
        !nums.every((n) => typeof n === 'number' && Number.isFinite(n))
      )
        throw new BadRequestException(
          `Missing or invalid placement for ${file.originalname}`,
        );
      const [xIn, yIn, wIn, hIn] = nums as number[];
      if (
        wIn <= 0 ||
        hIn <= 0 ||
        wIn > limitW ||
        hIn > limitH ||
        Math.abs(xIn) > limitW ||
        Math.abs(yIn) > limitH
      )
        throw new BadRequestException(
          `Layer ${index + 1} is outside the allowed size/position`,
        );
      return { index, image: file.buffer, xIn, yIn, wIn, hIn };
    });
    layers.sort((a, b) => a.index - b.index); // stacking order: bottom first

    const jpegBuffer = await this.svc.assembleFreeSheet(
      sheetSize as SheetSize,
      layers,
    );
    res.set({
      'Content-Type': 'image/jpeg',
      'Content-Disposition': `attachment; filename="sheet-free-${sheetSize}-600dpi.jpg"`,
      'Content-Length': String(jpegBuffer.length),
    });
    res.end(jpegBuffer);
  }
}
