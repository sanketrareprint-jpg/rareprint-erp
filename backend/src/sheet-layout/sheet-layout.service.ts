import { Injectable, BadRequestException } from '@nestjs/common';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require('sharp') as typeof import('sharp');

const DPI = 600;   // 600 DPI — high-resolution print quality

export const SHEET_DEFS = {
  '18x23': { label: '18×23 Inch', widthIn: 23, heightIn: 18, marginIn: 0.5, usableW: 22, usableH: 17 },
  '19x25': { label: '19×25 Inch', widthIn: 25, heightIn: 19, marginIn: 0.5, usableW: 24, usableH: 18 },
} as const;
export type SheetSize = keyof typeof SHEET_DEFS;

export const SLOT_TYPES = {
  SMALL_5_5x8_5:  { label: '5.5×8.5"',  wIn: 5.5,    hIn: 8.5  },
  MEDIUM_7_5x8_5: { label: '7.5×8.5"',  wIn: 7.3333, hIn: 8.5  },
  LARGE_8_5x11:   { label: '8.5×11"',   wIn: 11.0,   hIn: 8.5  },
  XL_11x17:       { label: '11×17"',    wIn: 11.0,   hIn: 17.0 },
} as const;
export type SlotType = keyof typeof SLOT_TYPES;

export interface SlotPattern {
  id: string; label: string; sheetSize: SheetSize;
  rows: SlotType[][]; totalSlots: number;
  slotCounts: Partial<Record<SlotType, number>>;
}

function buildPattern(id: string, label: string, sheetSize: SheetSize, rows: SlotType[][]): SlotPattern {
  const counts: Partial<Record<SlotType, number>> = {};
  let total = 0;
  for (const row of rows) for (const slot of row) { counts[slot] = (counts[slot] ?? 0) + 1; total++; }
  return { id, label, sheetSize, rows, totalSlots: total, slotCounts: counts };
}

export const PATTERNS: SlotPattern[] = [
  buildPattern('18x23_8S',      '8× Small (5.5×8.5)',      '18x23', [['SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5'],['SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5']]),
  buildPattern('18x23_6M',      '6× Medium (7.5×8.5)',     '18x23', [['MEDIUM_7_5x8_5','MEDIUM_7_5x8_5','MEDIUM_7_5x8_5'],['MEDIUM_7_5x8_5','MEDIUM_7_5x8_5','MEDIUM_7_5x8_5']]),
  buildPattern('18x23_4L',      '4× Large (8.5×11)',       '18x23', [['LARGE_8_5x11','LARGE_8_5x11'],['LARGE_8_5x11','LARGE_8_5x11']]),
  buildPattern('18x23_2XL',     '2× XL (11×17)',           '18x23', [['XL_11x17','XL_11x17']]),
  buildPattern('18x23_2L_4S',   '2× Large + 4× Small',    '18x23', [['LARGE_8_5x11','LARGE_8_5x11'],['SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5']]),
  buildPattern('18x23_4S_2L',   '4× Small + 2× Large',    '18x23', [['SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5'],['LARGE_8_5x11','LARGE_8_5x11']]),
  buildPattern('18x23_3M_4S',   '3× Medium + 4× Small',   '18x23', [['MEDIUM_7_5x8_5','MEDIUM_7_5x8_5','MEDIUM_7_5x8_5'],['SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5']]),
  buildPattern('18x23_4S_3M',   '4× Small + 3× Medium',   '18x23', [['SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5'],['MEDIUM_7_5x8_5','MEDIUM_7_5x8_5','MEDIUM_7_5x8_5']]),
  buildPattern('18x23_3M_2L',   '3× Medium + 2× Large',   '18x23', [['MEDIUM_7_5x8_5','MEDIUM_7_5x8_5','MEDIUM_7_5x8_5'],['LARGE_8_5x11','LARGE_8_5x11']]),
  buildPattern('18x23_2L_3M',   '2× Large + 3× Medium',   '18x23', [['LARGE_8_5x11','LARGE_8_5x11'],['MEDIUM_7_5x8_5','MEDIUM_7_5x8_5','MEDIUM_7_5x8_5']]),
  buildPattern('18x23_1L2S_x2', '2× (1 Large + 2 Small)', '18x23', [['LARGE_8_5x11','SMALL_5_5x8_5','SMALL_5_5x8_5'],['LARGE_8_5x11','SMALL_5_5x8_5','SMALL_5_5x8_5']]),
  buildPattern('19x25_8S',  '8× Small',       '19x25', [['SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5'],['SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5']]),
  buildPattern('19x25_6M',  '6× Medium',      '19x25', [['MEDIUM_7_5x8_5','MEDIUM_7_5x8_5','MEDIUM_7_5x8_5'],['MEDIUM_7_5x8_5','MEDIUM_7_5x8_5','MEDIUM_7_5x8_5']]),
  buildPattern('19x25_4L',  '4× Large',       '19x25', [['LARGE_8_5x11','LARGE_8_5x11'],['LARGE_8_5x11','LARGE_8_5x11']]),
  buildPattern('19x25_2XL', '2× XL (11×18")', '19x25', [['XL_11x17','XL_11x17']]),
];

export interface SlotGeometry {
  row: number; col: number; slotType: SlotType;
  xPx: number; yPx: number; wPx: number; hPx: number;
}

/** gapMm = gap between designs in millimetres (default 0) */
export function computeSlotGeometry(pattern: SlotPattern, gapMm = 0): SlotGeometry[] {
  const sheet = SHEET_DEFS[pattern.sheetSize];
  const marginPx = Math.round(sheet.marginIn * DPI);
  const gapPx    = Math.round(gapMm * (DPI / 25.4));
  const result: SlotGeometry[] = [];
  let curY = marginPx;

  for (let r = 0; r < pattern.rows.length; r++) {
    const row = pattern.rows[r];
    let rowHeightIn: number;
    if (row[0] === 'XL_11x17') rowHeightIn = sheet.usableH;
    else rowHeightIn = sheet.usableH / 2;

    // Shrink row height to account for vertical gaps between rows
    const numRows = pattern.rows.length;
    const totalRowGapPx = (numRows - 1) * gapPx;
    const rowHeightPx = Math.round((rowHeightIn * DPI) - totalRowGapPx / numRows);

    const numCols = row.length;
    const totalColGapPx = (numCols - 1) * gapPx;
    const slotWPx = Math.round((sheet.usableW / numCols) * DPI - totalColGapPx / numCols);

    let curX = marginPx;
    for (let c = 0; c < numCols; c++) {
      result.push({ row: r, col: c, slotType: row[c], xPx: curX, yPx: curY, wPx: slotWPx, hPx: rowHeightPx });
      curX += slotWPx + gapPx;
    }
    curY += rowHeightPx + gapPx;
  }
  return result;
}

@Injectable()
export class SheetLayoutService {

  getPatterns(sheetSize?: SheetSize) {
    if (sheetSize) return PATTERNS.filter(p => p.sheetSize === sheetSize);
    return PATTERNS;
  }

  getPattern(patternId: string) {
    return PATTERNS.find(p => p.id === patternId);
  }

  /** gapMm — gap between designs in mm (0 = butted, 2 = 2mm white gap) */
  async assembleSheet(patternId: string, slotImages: Map<number, Buffer>, gapMm = 0): Promise<Buffer> {
    const pattern = this.getPattern(patternId);
    if (!pattern) throw new BadRequestException(`Unknown pattern: ${patternId}`);

    const sheet = SHEET_DEFS[pattern.sheetSize];
    const sheetWPx = Math.round(sheet.widthIn  * DPI);
    const sheetHPx = Math.round(sheet.heightIn * DPI);
    const geometries = computeSlotGeometry(pattern, gapMm);

    // White base
    const baseBuffer = await sharp({
      create: { width: sheetWPx, height: sheetHPx, channels: 3, background: { r: 255, g: 255, b: 255 } },
    }).png().toBuffer();

    // Composite slot images — NO cut lines
    const compositeInputs: Array<{ input: Buffer; left: number; top: number }> = [];
    for (let i = 0; i < geometries.length; i++) {
      const geo = geometries[i];
      const imgBuf = slotImages.get(i);
      if (!imgBuf) continue;
      const resized = await sharp(imgBuf)
        .resize(geo.wPx, geo.hPx, { fit: 'fill' })
        .png()
        .toBuffer();
      compositeInputs.push({ input: resized, left: geo.xPx, top: geo.yPx });
    }

    // Compose → JPEG at 600 DPI with maximum compression flags for smallest file
    return sharp(baseBuffer)
      .composite(compositeInputs)
      .jpeg({
        quality: 72,                  // sweet spot: sharp detail, low file size
        chromaSubsampling: '4:2:0',   // halve chroma data (invisible to eye for print)
        progressive: true,            // progressive scan shaves ~10% off file size
        optimiseCoding: true,         // optimise Huffman coding table
        trellisQuantisation: true,    // trellis quant: ~10-15% smaller, same visual quality
        overshootDeringing: true,     // reduce ringing at sharp edges
        optimiseScans: true,          // optimise each progressive scan
      })
      .toBuffer();
  }
}
