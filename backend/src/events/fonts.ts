// backend/src/events/fonts.ts
//
// Selectable fonts for event flyer text fields. Reuses the exact same TTF
// files already shipped for the Certificate Generator / Billing invoice PDF
// (backend/assets/fonts) — see ../certificate-generator/fonts.ts. Unlike
// pdfkit's registerFont() (which embeds TTF bytes directly, no OS fontconfig
// involved), the flyer renderer rasterizes an SVG via sharp/librsvg, which
// resolves @font-face by family name through Pango/fontconfig and does NOT
// automatically know about these TTF files. To get the exact same
// self-contained behaviour as pdfkit (not dependent on whatever fonts happen
// to be installed on the Railway container), flyer-render.ts embeds each
// font's bytes directly into the SVG as a base64 @font-face data: URI —
// readFontFaceCss() below builds that CSS once per render.
import { readFileSync } from 'fs';
import { join } from 'path';

const FONTS_DIR = join(process.cwd(), 'assets', 'fonts');

export type FlyerFontFamily = 'DejaVu Sans' | 'Segoe UI';

const FONT_FILES: Record<FlyerFontFamily, { regular: string; bold: string; cssName: string }> = {
  'DejaVu Sans': {
    regular: join(FONTS_DIR, 'DejaVuSans.ttf'),
    bold: join(FONTS_DIR, 'DejaVuSans-Bold.ttf'),
    cssName: 'EventsFlyerDejaVuSans',
  },
  'Segoe UI': {
    regular: join(FONTS_DIR, 'SegoeUI.ttf'),
    bold: join(FONTS_DIR, 'SegoeUI-Bold.ttf'),
    cssName: 'EventsFlyerSegoeUI',
  },
};

export const FLYER_FONT_FAMILIES: FlyerFontFamily[] = ['DejaVu Sans', 'Segoe UI'];

export function isFlyerFontFamily(value: unknown): value is FlyerFontFamily {
  return value === 'DejaVu Sans' || value === 'Segoe UI';
}

/** SVG font-family name to use in a <text> element for this family+weight. */
export function resolveFlyerFontFamilyName(family: FlyerFontFamily, bold: boolean): string {
  return `${FONT_FILES[family].cssName}${bold ? '-Bold' : ''}`;
}

let cachedFontFaceCss: string | null = null;

/** Builds (and caches) one <style> block's worth of @font-face rules with
 *  every selectable family/weight embedded as base64 — safe to call once per
 *  process and reuse across every flyer render. */
export function buildFontFaceCss(): string {
  if (cachedFontFaceCss) return cachedFontFaceCss;
  const rules: string[] = [];
  for (const family of FLYER_FONT_FAMILIES) {
    const files = FONT_FILES[family];
    const regularB64 = readFileSync(files.regular).toString('base64');
    const boldB64 = readFileSync(files.bold).toString('base64');
    rules.push(`
      @font-face {
        font-family: '${files.cssName}';
        src: url(data:font/truetype;base64,${regularB64}) format('truetype');
      }
      @font-face {
        font-family: '${files.cssName}-Bold';
        src: url(data:font/truetype;base64,${boldB64}) format('truetype');
      }
    `);
  }
  cachedFontFaceCss = rules.join('\n');
  return cachedFontFaceCss;
}
