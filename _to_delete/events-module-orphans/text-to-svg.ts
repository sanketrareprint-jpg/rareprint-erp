// backend/src/events/text-to-svg.ts
//
// Converts a text string into SVG <path> data using opentype.js, so it can
// be composited by sharp without sharp ever touching an SVG <text> element
// (which would require the server to have fontconfig/pango — a dependency
// certificate-generator/fonts.ts explicitly avoided by embedding TTF bytes
// into pdfkit output instead; opentype.js gives the equivalent "font bytes
// are self-contained, no system font lookup" property for a raster/SVG
// pipeline). Verified end-to-end in a scratch script before this file was
// written: opentype.js loads the same DejaVu Sans/Segoe UI TTFs already
// shipped in backend/assets/fonts, generates path data, and sharp composites
// that path-only SVG cleanly with no font-related errors.
import * as opentype from 'opentype.js';
import { fontFilePath, type FontFamily } from './fonts';

const fontCache = new Map<string, opentype.Font>();

function loadFont(family: FontFamily, bold: boolean): opentype.Font {
  const path = fontFilePath(family, bold);
  const cached = fontCache.get(path);
  if (cached) return cached;
  const font = opentype.loadSync(path);
  fontCache.set(path, font);
  return font;
}

export type TextAlign = 'left' | 'center' | 'right';

export interface TextFieldSpec {
  text: string;
  fontFamily: FontFamily;
  bold: boolean;
  fontSizePx: number;
  color: string; // hex, e.g. '#7a3b12'
  align: TextAlign;
  // Box the text is positioned within, in absolute canvas pixels.
  boxXPx: number;
  boxYPx: number;
  boxWPx: number;
  boxHPx: number;
}

/** One <path> element's data + the fill color to pair it with. */
export interface TextPathResult {
  d: string;
  color: string;
}

/**
 * Lays out one text field (horizontally aligned within its box, vertically
 * centered) and returns SVG path data for it. Returns null for an empty
 * string (nothing to draw — callers should skip it, not emit an empty path).
 */
export function textFieldToPath(field: TextFieldSpec): TextPathResult | null {
  const text = field.text.trim();
  if (!text) return null;

  const font = loadFont(field.fontFamily, field.bold);
  const scale = field.fontSizePx / font.unitsPerEm;
  const ascent = font.ascender * scale;
  const descent = -font.descender * scale; // descender is negative in opentype.js
  const textHeight = ascent + descent;
  const advanceWidth = font.getAdvanceWidth(text, field.fontSizePx);

  let startX = field.boxXPx;
  if (field.align === 'center') startX = field.boxXPx + (field.boxWPx - advanceWidth) / 2;
  else if (field.align === 'right') startX = field.boxXPx + (field.boxWPx - advanceWidth);

  const baselineY = field.boxYPx + Math.max(0, (field.boxHPx - textHeight) / 2) + ascent;

  const path = font.getPath(text, startX, baselineY, field.fontSizePx);
  return { d: path.toPathData(2), color: field.color };
}

/** Builds a single path-only SVG (no <text>) covering the whole canvas, for
 *  one sharp .composite() call carrying every text field at once. */
export function buildTextOverlaySvg(canvasWidthPx: number, canvasHeightPx: number, fields: TextFieldSpec[]): Buffer {
  const paths = fields
    .map((field) => textFieldToPath(field))
    .filter((result): result is TextPathResult => result !== null)
    .map((result) => `<path d="${result.d}" fill="${result.color}"/>`)
    .join('');

  const svg = `<svg width="${canvasWidthPx}" height="${canvasHeightPx}" xmlns="http://www.w3.org/2000/svg">${paths}</svg>`;
  return Buffer.from(svg);
}
