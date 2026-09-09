// backend/src/events/render.ts
//
// Composites one flyer image: template background + (optional) contact
// photo masked into a circle/square + name text + (optional) sub-text —
// e.g. "Turns 32 today!" or "Happy Diwali!" — entirely via sharp raster
// operations and path-only SVG (see text-to-svg.ts for why). Output is a
// single JPEG buffer sized to the template's canvas dimensions, ready to
// store as a base64 data URI (same convention as
// Order.dispatchProductPhoto / CertificateTemplate.imageDataUrl) and to be
// served publicly for AiSensy to fetch as a WhatsApp media image.
import sharp from 'sharp';
import { BadRequestException } from '@nestjs/common';
import { buildTextOverlaySvg, type TextAlign, type TextFieldSpec } from './text-to-svg';
import { isFontFamily, type FontFamily } from './fonts';

export type PlaceholderShape = 'circle' | 'square';

export interface TextPlaceholder {
  xPct: number; // 0-100, left edge of box as % of canvas width
  yPct: number;
  wPct: number;
  hPct: number;
  fontFamily: FontFamily;
  fontSizePx: number;
  bold: boolean;
  color: string;
  align: TextAlign;
}

export interface PhotoPlaceholder {
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  shape: PlaceholderShape;
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  const comma = dataUrl.indexOf(',');
  return Buffer.from(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl, 'base64');
}

export function normalizeTextPlaceholder(input: unknown, fallback: Partial<TextPlaceholder> = {}): TextPlaceholder {
  const raw = (input ?? {}) as Record<string, unknown>;
  const fontFamily = isFontFamily(raw.fontFamily) ? (raw.fontFamily as FontFamily) : (fallback.fontFamily ?? 'DejaVu Sans');
  const align: TextAlign = raw.align === 'center' || raw.align === 'right' ? raw.align : (fallback.align ?? 'center');
  return {
    xPct: clampPct(raw.xPct, fallback.xPct ?? 10),
    yPct: clampPct(raw.yPct, fallback.yPct ?? 70),
    wPct: clampPct(raw.wPct, fallback.wPct ?? 80),
    hPct: clampPct(raw.hPct, fallback.hPct ?? 10),
    fontFamily,
    fontSizePx: Math.min(300, Math.max(8, Number(raw.fontSizePx) || fallback.fontSizePx || 48)),
    bold: raw.bold === undefined ? (fallback.bold ?? true) : Boolean(raw.bold),
    color: typeof raw.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(raw.color) ? raw.color : (fallback.color ?? '#000000'),
    align,
  };
}

export function normalizePhotoPlaceholder(input: unknown): PhotoPlaceholder | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  return {
    xPct: clampPct(raw.xPct, 35),
    yPct: clampPct(raw.yPct, 10),
    wPct: clampPct(raw.wPct, 30),
    hPct: clampPct(raw.hPct, 30),
    shape: raw.shape === 'square' ? 'square' : 'circle',
  };
}

function clampPct(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, n));
}

export interface RenderFlyerInput {
  backgroundDataUrl: string;
  canvasWidthPx: number;
  canvasHeightPx: number;
  namePlaceholder: TextPlaceholder;
  nameText: string;
  subPlaceholder?: TextPlaceholder | null;
  subText?: string | null;
  photoPlaceholder?: PhotoPlaceholder | null;
  photoDataUrl?: string | null;
}

function pctBoxToPx(p: { xPct: number; yPct: number; wPct: number; hPct: number }, canvasW: number, canvasH: number) {
  return {
    xPx: Math.round((p.xPct / 100) * canvasW),
    yPx: Math.round((p.yPct / 100) * canvasH),
    wPx: Math.round((p.wPct / 100) * canvasW),
    hPx: Math.round((p.hPct / 100) * canvasH),
  };
}

export async function renderFlyer(input: RenderFlyerInput): Promise<Buffer> {
  const { canvasWidthPx: W, canvasHeightPx: H } = input;
  if (!W || !H || W > 4000 || H > 4000) {
    throw new BadRequestException('Template canvas dimensions must be set and no larger than 4000px');
  }

  const backgroundRaw = dataUrlToBuffer(input.backgroundDataUrl);
  const background = await sharp(backgroundRaw).resize(W, H, { fit: 'cover' }).png().toBuffer();

  const composites: sharp.OverlayOptions[] = [];

  // ── Photo (masked into circle/square) ──────────────────────────────────
  if (input.photoPlaceholder && input.photoDataUrl) {
    const box = pctBoxToPx(input.photoPlaceholder, W, H);
    const size = Math.max(1, Math.min(box.wPx, box.hPx));
    const photoRaw = dataUrlToBuffer(input.photoDataUrl);
    const resizedPhoto = await sharp(photoRaw).resize(size, size, { fit: 'cover' }).toBuffer();

    const maskSvg =
      input.photoPlaceholder.shape === 'circle'
        ? `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`
        : `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="#fff"/></svg>`;

    const maskedPhoto = await sharp(resizedPhoto)
      .composite([{ input: Buffer.from(maskSvg), blend: 'dest-in' }])
      .png()
      .toBuffer();

    composites.push({
      input: maskedPhoto,
      left: box.xPx + Math.round((box.wPx - size) / 2),
      top: box.yPx + Math.round((box.hPx - size) / 2),
    });
  }

  // ── Text (name + optional sub-text) ────────────────────────────────────
  const textFields: TextFieldSpec[] = [];
  const nameBox = pctBoxToPx(input.namePlaceholder, W, H);
  textFields.push({
    text: input.nameText,
    fontFamily: input.namePlaceholder.fontFamily,
    bold: input.namePlaceholder.bold,
    fontSizePx: input.namePlaceholder.fontSizePx,
    color: input.namePlaceholder.color,
    align: input.namePlaceholder.align,
    boxXPx: nameBox.xPx,
    boxYPx: nameBox.yPx,
    boxWPx: nameBox.wPx,
    boxHPx: nameBox.hPx,
  });

  if (input.subPlaceholder && input.subText) {
    const subBox = pctBoxToPx(input.subPlaceholder, W, H);
    textFields.push({
      text: input.subText,
      fontFamily: input.subPlaceholder.fontFamily,
      bold: input.subPlaceholder.bold,
      fontSizePx: input.subPlaceholder.fontSizePx,
      color: input.subPlaceholder.color,
      align: input.subPlaceholder.align,
      boxXPx: subBox.xPx,
      boxYPx: subBox.yPx,
      boxWPx: subBox.wPx,
      boxHPx: subBox.hPx,
    });
  }

  const textSvg = buildTextOverlaySvg(W, H, textFields);
  composites.push({ input: textSvg, left: 0, top: 0 });

  return sharp(background)
    .composite(composites)
    .jpeg({ quality: 90, chromaSubsampling: '4:2:0' })
    .toBuffer();
}

/** Fills {{name}}/{{age}}/{{years}}/{{date}}/{{festival}} tokens in a
 *  template's sub-text string. Any token not applicable to the current
 *  occasion (e.g. {{years}} on a birthday) is left as literal text if
 *  present, since that would be a template authoring mistake worth noticing
 *  rather than silently blanking. */
export function fillSubTextTemplate(
  template: string,
  values: { name: string; age?: number; years?: number; date?: string; festival?: string },
): string {
  return template
    .replace(/\{\{\s*name\s*\}\}/gi, values.name)
    .replace(/\{\{\s*age\s*\}\}/gi, values.age !== undefined ? String(values.age) : '{{age}}')
    .replace(/\{\{\s*years\s*\}\}/gi, values.years !== undefined ? String(values.years) : '{{years}}')
    .replace(/\{\{\s*date\s*\}\}/gi, values.date ?? '{{date}}')
    .replace(/\{\{\s*festival\s*\}\}/gi, values.festival ?? '{{festival}}');
}
