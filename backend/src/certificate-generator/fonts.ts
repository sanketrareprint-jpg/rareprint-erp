// backend/src/certificate-generator/fonts.ts
//
// Selectable fonts for certificate fields. Reuses the same TTF files already
// shipped for the Billing invoice PDF (backend/assets/fonts) — see
// ../billing/pdf-fonts.ts. pdfkit's registerFont() embeds the TTF bytes
// directly into the PDF, so this doesn't depend on the server having these
// families registered with the system font stack (fontconfig) — the font is
// self-contained in the generated file either way.
import { join } from 'path';

const FONTS_DIR = join(process.cwd(), 'assets', 'fonts');

export type FontFamily = 'DejaVu Sans' | 'Segoe UI';

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

/** Registers both weights of every selectable family on a fresh
 *  PDFDocument, under names like 'DejaVu Sans' / 'DejaVu Sans-Bold' — call
 *  once per doc, before drawing any certificate text. */
export function registerCertificateFonts(doc: PDFKit.PDFDocument): void {
  for (const family of FONT_FAMILIES) {
    const files = FONT_FILES[family];
    doc.registerFont(family, files.regular);
    doc.registerFont(`${family}-Bold`, files.bold);
  }
}

export function resolveFontName(family: FontFamily, bold: boolean): string {
  return bold ? `${family}-Bold` : family;
}
