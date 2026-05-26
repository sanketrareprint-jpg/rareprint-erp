import { Injectable, BadRequestException } from '@nestjs/common';

// Sharp is CJS; import via require to avoid TS callable issues
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require('sharp') as typeof import('sharp');

// ─── Constants ────────────────────────────────────────────────────────────────
const DPI = 600;

// ─── Sheet definitions ────────────────────────────────────────────────────────
// Sheets are landscape-oriented (wider than tall)
export const SHEET_DEFS = {
  '18x23': { label: '18×23 Inch', widthIn: 23, heightIn: 18, marginIn: 0.5, usableW: 22, usableH: 17 },
  '19x25': { label: '19×25 Inch', widthIn: 25, heightIn: 19, marginIn: 0.5, usableW: 24, usableH: 18 },
} as const;

export type SheetSize = keyof typeof SHEET_DEFS;

// ─── Slot type definitions ────────────────────────────────────────────────────
export const SLOT_TYPES = {
  SMALL_5_5x8_5:  { label: '5.5×8.5"',  wIn: 5.5,    hIn: 8.5,  desc: 'A8 Letterpad / 4×5 Envelope' },
  MEDIUM_7_5x8_5: { label: '7.5×8.5"',  wIn: 7.3333, hIn: 8.5,  desc: '4×7 Envelope (7.3" slot width)' },
  LARGE_8_5x11:   { label: '8.5×11"',   wIn: 11.0,   hIn: 8.5,  desc: 'A4 Letterpad / 5.5×8 Envelope (landscape on sheet)' },
  XL_11x17:       { label: '11×17"',    wIn: 11.0,   hIn: 17.0, desc: 'A3 / File / Folder' },
} as const;

export type SlotType = keyof typeof SLOT_TYPES;

// ─── Pattern definitions ──────────────────────────────────────────────────────
export interface SlotPattern {
  id: string;
  label: string;
  sheetSize: SheetSize;
  rows: SlotType[][];
  totalSlots: number;
  slotCounts: Partial<Record<SlotType, number>>;
}

function buildPattern(id: string, label: string, sheetSize: SheetSize, rows: SlotType[][]): SlotPattern {
  const counts: Partial<Record<SlotType, number>> = {};
  let total = 0;
  for (const row of rows) {
    for (const slot of row) {
      counts[slot] = (counts[slot] ?? 0) + 1;
      total++;
    }
  }
  return { id, label, sheetSize, rows, totalSlots: total, slotCounts: counts };
}

export const PATTERNS: SlotPattern[] = [
  // ── 18×23 patterns (usable 22"W × 17"H, 2 rows of 8.5" each) ──
  buildPattern('18x23_8S',      '8× Small (5.5×8.5)',           '18x23', [['SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5'], ['SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5']]),
  buildPattern('18x23_6M',      '6× Medium (7.5×8.5)',          '18x23', [['MEDIUM_7_5x8_5','MEDIUM_7_5x8_5','MEDIUM_7_5x8_5'], ['MEDIUM_7_5x8_5','MEDIUM_7_5x8_5','MEDIUM_7_5x8_5']]),
  buildPattern('18x23_4L',      '4× Large (8.5×11)',            '18x23', [['LARGE_8_5x11','LARGE_8_5x11'], ['LARGE_8_5x11','LARGE_8_5x11']]),
  buildPattern('18x23_2XL',     '2× XL (11×17)',                '18x23', [['XL_11x17','XL_11x17']]),
  buildPattern('18x23_2L_4S',   '2× Large + 4× Small',         '18x23', [['LARGE_8_5x11','LARGE_8_5x11'], ['SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5']]),
  buildPattern('18x23_4S_2L',   '4× Small + 2× Large',         '18x23', [['SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5'], ['LARGE_8_5x11','LARGE_8_5x11']]),
  buildPattern('18x23_3M_4S',   '3× Medium + 4× Small',        '18x23', [['MEDIUM_7_5x8_5','MEDIUM_7_5x8_5','MEDIUM_7_5x8_5'], ['SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5']]),
  buildPattern('18x23_4S_3M',   '4× Small + 3× Medium',        '18x23', [['SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5'], ['MEDIUM_7_5x8_5','MEDIUM_7_5x8_5','MEDIUM_7_5x8_5']]),
  buildPattern('18x23_3M_2L',   '3× Medium + 2× Large',        '18x23', [['MEDIUM_7_5x8_5','MEDIUM_7_5x8_5','MEDIUM_7_5x8_5'], ['LARGE_8_5x11','LARGE_8_5x11']]),
  buildPattern('18x23_2L_3M',   '2× Large + 3× Medium',        '18x23', [['LARGE_8_5x11','LARGE_8_5x11'], ['MEDIUM_7_5x8_5','MEDIUM_7_5x8_5','MEDIUM_7_5x8_5']]),
  buildPattern('18x23_1L2S_x2', '2× (1 Large + 2 Small)',      '18x23', [['LARGE_8_5x11','SMALL_5_5x8_5','SMALL_5_5x8_5'], ['LARGE_8_5x11','SMALL_5_5x8_5','SMALL_5_5x8_5']]),
  // ── 19×25 patterns (usable 24"W × 18"H) ──
  buildPattern('19x25_8S',      '8× Small (5.5×9" rows)',       '19x25', [['SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5'], ['SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5']]),
  buildPattern('19x25_6M',      '6× Medium (8×9" rows)',        '19x25', [['MEDIUM_7_5x8_5','MEDIUM_7_5x8_5','MEDIUM_7_5x8_5'], ['MEDIUM_7_5x8_5','MEDIUM_7_5x8_5','MEDIUM_7_5x8_5']]),
  buildPattern('19x25_4L',      '4× Large (12×9" rows)',        '19x25', [['LARGE_8_5x11','LARGE_8_5x11'], ['LARGE_8_5x11','LARGE_8_5x11']]),
  buildPattern('19x25_2XL',     '2× XL (11×18" full height)',   '19x25', [['XL_11x17','XL_11x17']]),
];

// ─── Slot geometry ────────────────────────────────────────────────────────────
export interface SlotGeometry {
  row: number; col: number; slotType: SlotType;
  xPx: number; yPx: number; wPx: number; hPx: number;
}

export function computeSlotGeometry(pattern: SlotPattern): SlotGeometry[] {
  const sheet = SHEET_DEFS[pattern.sheetSize];
  const marginPx = Math.round(sheet.marginIn * DPI);
  const result: SlotGeometry[] = [];
  let curY = marginPx;

  for (let r = 0; r < pattern.rows.length; r++) {
    const row = pattern.rows[r];

    // Row height: for XL use full usable height, else divide usable height by non-XL rows
    let rowHeightIn: number;
    if (row[0] === 'XL_11x17') {
      rowHeightIn = sheet.usableH;          // full height for XL
    } else if (pattern.sheetSize === '19x25') {
      rowHeightIn = sheet.usableH / 2;      // split 18" into 2 rows of 9"
    } else {
      rowHeightIn = sheet.usableH / 2;      // 18×23: 17" / 2 = 8.5"
    }
    const rowHeightPx = Math.round(rowHeightIn * DPI);

    // Slot width: divide usable width equally among columns in this row
    const slotWIn = sheet.usableW / row.length;
    const slotWPx = Math.round(slotWIn * DPI);

    let curX = marginPx;
    for (let c = 0; c < row.length; c++) {
      result.push({ row: r, col: c, slotType: row[c], xPx: curX, yPx: curY, wPx: slotWPx, hPx: rowHeightPx });
      curX += slotWPx;
    }
    curY += rowHeightPx;
  }
  return result;
}

// ─── Service ──────────────────────────────────────────────────────────────────
@Injectable()
export class SheetLayoutService {

  getPatterns(sheetSize?: SheetSize): SlotPattern[] {
    if (sheetSize) return PATTERNS.filter(p => p.sheetSize === sheetSize);
    return PATTERNS;
  }

  getPattern(patternId: string): SlotPattern | undefined {
    return PATTERNS.find(p => p.id === patternId);
  }

  async assembleSheet(patternId: string, slotImages: Map<number, Buffer>): Promise<Buffer> {
    const pattern = this.getPattern(patternId);
    if (!pattern) throw new BadRequestException(`Unknown pattern: ${patternId}`);

    const sheet = SHEET_DEFS[pattern.sheetSize];
    const sheetWPx = Math.round(sheet.widthIn * DPI);
    const sheetHPx = Math.round(sheet.heightIn * DPI);
    const geometries = computeSlotGeometry(pattern);

    // Create white RGB base canvas
    const baseBuffer = await sharp({
      create: { width: sheetWPx, height: sheetHPx, channels: 3, background: { r: 255, g: 255, b: 255 } },
    }).png().toBuffer();

    // Build composite layers
    const compositeInputs: Array<{ input: Buffer; left: number; top: number }> = [];

    for (let i = 0; i < geometries.length; i++) {
      const geo = geometries[i];
      const imgBuf = slotImages.get(i);
      if (!imgBuf) continue;
      // Scale design to fill slot exactly
      const resized = await sharp(imgBuf)
        .resize(geo.wPx, geo.hPx, { fit: 'fill' })
        .png()
        .toBuffer();
      compositeInputs.push({ input: resized, left: geo.xPx, top: geo.yPx });
    }

    // Add cut-line SVG overlay (red lines between slots)
    const cutSvg = this.buildCutLinesSvg(sheetWPx, sheetHPx, geometries);
    const cutBuf = await sharp(Buffer.from(cutSvg)).png().toBuffer();
    compositeInputs.push({ input: cutBuf, left: 0, top: 0 });

    // Compose all layers on base, then convert to CMYK TIFF @ 600 DPI
    const result = await sharp(baseBuffer)
      .composite(compositeInputs)
      .toColourspace('cmyk')
      .tiff({ compression: 'lzw', xres: DPI, yres: DPI, resolutionUnit: 'inch' })
      .toBuffer();

    return result;
  }

  private buildCutLinesSvg(w: number, h: number, geometries: SlotGeometry[]): string {
    const sw = Math.max(1, Math.round(DPI * 0.004)); // ~2-3px at 600 DPI
    const lines: string[] = [];
    for (const geo of geometries) {
      const rx = geo.xPx + geo.wPx;
      const by = geo.yPx + geo.hPx;
      lines.push(
        `<line x1="${rx}" y1="${geo.yPx}" x2="${rx}" y2="${by}" stroke="rgba(220,0,0,0.6)" stroke-width="${sw}"/>`,
        `<line x1="${geo.xPx}" y1="${by}" x2="${rx}" y2="${by}" stroke="rgba(220,0,0,0.6)" stroke-width="${sw}"/>`,
      );
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${lines.join('')}</svg>`;
  }
}
