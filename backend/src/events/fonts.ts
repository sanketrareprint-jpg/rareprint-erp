// backend/src/events/fonts.ts
//
// Selectable fonts for flyer text fields. Reuses the same TTF files already
// shipped for the Billing invoice PDF / Certificate Generator
// (backend/assets/fonts) — see ../certificate-generator/fonts.ts. Loaded
// here via opentype.js instead of pdfkit's registerFont() because the
// output of this module is a raster PNG/JPEG (composited with sharp), not a
// PDF — see render.ts for why text is converted to SVG path data rather
// than drawn as SVG <text> (fontconfig/pango dependency risk, avoided the
// same way certificate-generator/fonts.ts explains).
import { join } from 'path';

export type FontFamily = 'DejaVu Sans' | 'Segoe UI';

const FONTS_DIR = join(process.cwd(), 'assets', 'fonts');

const FONT_FILES: Record<FontFamily, { regular: string; bold: string }> = {
  'DejaVu Sans': {
    regular: join(FONTS_DIR, 'DejaVuSans.ttf'),
    bold: join(FONTS_DIR, 'DejaVuSans-Bold.ttf'),
  },
  'Segoe UI': {
    regular: join(FONTS_DIR, 'SegoeUI.ttf'),
    bold: join(FONTS_DIR, 'SegoeUI-Bold.ttf'),
  },
};

export const FONT_FAMILIES: FontFamily[] = ['DejaVu Sans', 'Segoe UI'];

export function isFontFamily(value: unknown): value is FontFamily {
  return value === 'DejaVu Sans' || value === 'Segoe UI';
}

export function fontFilePath(family: FontFamily, bold: boolean): string {
  const files = FONT_FILES[family];
  return bold ? files.bold : files.regular;
}
