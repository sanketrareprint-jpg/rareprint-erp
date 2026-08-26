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

// 2026-08-26: added four more families (Poppins, Montserrat, Playfair
// Display, Dancing Script) alongside the original two, for flyer variety —
// same self-contained embedding scheme as DejaVu Sans/Segoe UI below, so
// there's still no dependency on what's installed on the Railway container.
// Font files came from the @fontsource/* npm packages (OFL-licensed Google
// Fonts, redistributed as npm packages) — those ship WOFF/WOFF2 only, so
// each was converted to TTF with fonttools to match this file's existing
// "TTF bytes embedded as a base64 @font-face data: URI" approach.
export type FlyerFontFamily = 'DejaVu Sans' | 'Segoe UI' | 'Poppins' | 'Montserrat' | 'Playfair Display' | 'Dancing Script';

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
  'Poppins': {
    regular: join(FONTS_DIR, 'Poppins-Regular.ttf'),
    bold: join(FONTS_DIR, 'Poppins-Bold.ttf'),
    cssName: 'EventsFlyerPoppins',
  },
  'Montserrat': {
    regular: join(FONTS_DIR, 'Montserrat-Regular.ttf'),
    bold: join(FONTS_DIR, 'Montserrat-Bold.ttf'),
    cssName: 'EventsFlyerMontserrat',
  },
  'Playfair Display': {
    regular: join(FONTS_DIR, 'PlayfairDisplay-Regular.ttf'),
    bold: join(FONTS_DIR, 'PlayfairDisplay-Bold.ttf'),
    cssName: 'EventsFlyerPlayfairDisplay',
  },
  'Dancing Script': {
    regular: join(FONTS_DIR, 'DancingScript-Regular.ttf'),
    bold: join(FONTS_DIR, 'DancingScript-Bold.ttf'),
    cssName: 'EventsFlyerDancingScript',
  },
};

export const FLYER_FONT_FAMILIES: FlyerFontFamily[] = ['DejaVu Sans', 'Segoe UI', 'Poppins', 'Montserrat', 'Playfair Display', 'Dancing Script'];

export function isFlyerFontFamily(value: unknown): value is FlyerFontFamily {
  return (FLYER_FONT_FAMILIES as string[]).includes(value as string);
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
