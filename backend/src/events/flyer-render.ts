// backend/src/events/flyer-render.ts
//
// Composites one event flyer: a saved template background image + this
// person's variable field values (name/date/etc. text, and their photo) —
// rendered as a single flat JPEG suitable for a WhatsApp media message.
//
// Unlike the Certificate Generator (backend/src/certificate-generator/),
// which draws onto a pdfkit PDF at physical inch/DPI positions because its
// output gets printed, a flyer is never printed — it only ever needs to
// exist as a raster image. So field positions here are fractions (0..1) of
// the template image's own pixel dimensions, not inches, and the renderer is
// sharp (raster compositing) instead of pdfkit (vector PDF drawing).
//
// Six kinds of layer are composited on top of the base template, in this
// order: PHOTO/BRAND_LOGO/CLIENT_LOGO fields first, then TEXT/BRAND_TEXT/
// CLIENT_TEXT fields on top — fields are expected to occupy separate,
// non-overlapping boxes on the template, so the order mainly matters if a
// template designer places them overlapping on purpose (then text wins,
// which is the safer default for legibility).
//
// BRAND_LOGO/BRAND_TEXT (added 2026-08-27) are the firm-identity counterparts
// to PHOTO/TEXT: same rendering code path, but the value comes from
// EventBrandProfile (set once, reused across every template) instead of from
// the per-person `values`/`photoBuffer` — see brandLogoBuffer/brandValues
// below and EventsService.buildBrandValues.
//
// CLIENT_LOGO/CLIENT_TEXT (added 2026-08-28, "client wish cards" feature) are
// a THIRD source, same rendering code path again, but the value comes from
// one EventClientBusiness row — a different one per render, since a single
// CLIENT_FESTIVAL template gets rendered once per active client business
// (see EventsService.renderAndSendClientWish). Do not confuse this with
// BRAND_LOGO/BRAND_TEXT: those are RarePrint's OWN singleton identity, this
// is one of potentially many client businesses' own identity.
import sharp from 'sharp';
import { buildFontFaceCss, isFlyerFontFamily, resolveFlyerFontFamilyName, type FlyerFontFamily } from './fonts';

export type FlyerFieldType = 'TEXT' | 'PHOTO' | 'BRAND_LOGO' | 'BRAND_TEXT' | 'CLIENT_LOGO' | 'CLIENT_TEXT';
export type FlyerFieldAlign = 'left' | 'center' | 'right';
export type FlyerFieldVAlign = 'top' | 'middle' | 'bottom';
export type BrandKey = 'firmName' | 'address' | 'phone' | 'email' | 'website' | 'products';
export type ClientKey = 'businessName' | 'phone' | 'address' | 'tagline';

export interface FlyerField {
  key: string;
  label: string;
  type: FlyerFieldType;
  // Fractions of the template image's width/height, 0..1.
  x: number;
  y: number;
  w: number;
  h: number;
  // TEXT/BRAND_TEXT/CLIENT_TEXT:
  fontFamily?: FlyerFontFamily;
  fontSizePt?: number;
  bold?: boolean;
  color?: string; // hex, e.g. '#111111'
  align?: FlyerFieldAlign;
  verticalAlign?: FlyerFieldVAlign;
  // PHOTO/BRAND_LOGO/CLIENT_LOGO:
  circle?: boolean; // crop the photo/logo to an ellipse filling its box instead of a plain rectangle
  // BRAND_TEXT-only: which EventBrandProfile column this field pulls its value from.
  brandKey?: BrandKey;
  // CLIENT_TEXT-only: which EventClientBusiness column this field pulls its value from.
  clientKey?: ClientKey;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Builds one standalone SVG (with the font embedded) containing just this
 *  field's text, sized exactly to the field's pixel box, so it can be
 *  composited directly at (leftPx, topPx). Single-line — flyer text values
 *  (a name, a date) are short and don't need word-wrap. */
function renderTextFieldSvg(field: FlyerField, value: string, boxWPx: number, boxHPx: number): Buffer {
  const family: FlyerFontFamily = isFlyerFontFamily(field.fontFamily) ? field.fontFamily : 'DejaVu Sans';
  const fontFamilyName = resolveFlyerFontFamilyName(family, Boolean(field.bold));
  const fontSizePx = Math.min(200, Math.max(6, Number(field.fontSizePt) || 24));
  const color = typeof field.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(field.color) ? field.color : '#111111';
  const align = field.align ?? 'left';
  const vAlign = field.verticalAlign ?? 'top';

  const textAnchor = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start';
  const x = align === 'center' ? boxWPx / 2 : align === 'right' ? boxWPx : 0;

  // Baseline approximation (no real text-shaping/measurement available here,
  // same tradeoff certificate-generator avoids by using pdfkit's own text
  // metrics — this is deliberately simple since flyer fields hold short
  // single-line values, not paragraphs): a font's cap-height/ascent is
  // roughly 0.75 of its size, so nudge the baseline down by that much from
  // the box's top/middle/bottom to keep the glyphs visually inside the box.
  const ascent = fontSizePx * 0.75;
  let y: number;
  if (vAlign === 'middle') y = boxHPx / 2 + ascent / 2;
  else if (vAlign === 'bottom') y = boxHPx - fontSizePx * 0.25;
  else y = ascent;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${boxWPx}" height="${boxHPx}">
      <style>${buildFontFaceCss()}</style>
      <text x="${x}" y="${y}" font-family="${fontFamilyName}" font-size="${fontSizePx}"
            fill="${color}" text-anchor="${textAnchor}">${escapeXml(value)}</text>
    </svg>
  `;
  return Buffer.from(svg);
}

function ellipseMaskSvg(wPx: number, hPx: number): Buffer {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${wPx}" height="${hPx}">
      <ellipse cx="${wPx / 2}" cy="${hPx / 2}" rx="${wPx / 2}" ry="${hPx / 2}" fill="#fff"/>
    </svg>
  `;
  return Buffer.from(svg);
}

async function renderPhotoFieldBuffer(field: FlyerField, photoBuffer: Buffer, boxWPx: number, boxHPx: number): Promise<Buffer> {
  // rotate() with no args auto-orients from EXIF — user-uploaded phone photos
  // are very often stored sideways/upside-down without this.
  let photo = sharp(photoBuffer).rotate().resize(boxWPx, boxHPx, { fit: 'cover', position: 'attention' });
  if (field.circle) {
    const resized = await photo.png().toBuffer();
    return sharp(resized)
      .composite([{ input: ellipseMaskSvg(boxWPx, boxHPx), blend: 'dest-in' }])
      .png()
      .toBuffer();
  }
  return photo.png().toBuffer();
}

export interface RenderFlyerParams {
  templateImageBuffer: Buffer;
  fields: FlyerField[];
  values: Record<string, string>; // fieldKey -> text value, for TEXT fields
  photoBuffer?: Buffer | null; // used for every PHOTO field (one photo per person, per project decision)
  brandValues?: Partial<Record<BrandKey, string>> | null; // used for every BRAND_TEXT field, keyed by field.brandKey (not field.key)
  brandLogoBuffer?: Buffer | null; // used for every BRAND_LOGO field
  clientValues?: Partial<Record<ClientKey, string>> | null; // used for every CLIENT_TEXT field, keyed by field.clientKey — one specific EventClientBusiness's data
  clientLogoBuffer?: Buffer | null; // used for every CLIENT_LOGO field — that same client business's logo
}

/** Renders the final flyer as a JPEG buffer. */
export async function renderFlyer(params: RenderFlyerParams): Promise<Buffer> {
  const base = sharp(params.templateImageBuffer);
  const metadata = await base.metadata();
  const widthPx = metadata.width;
  const heightPx = metadata.height;
  if (!widthPx || !heightPx) {
    throw new Error('Could not read the template image dimensions');
  }

  const photoFields = params.fields.filter((f) => f.type === 'PHOTO' || f.type === 'BRAND_LOGO' || f.type === 'CLIENT_LOGO');
  const textFields = params.fields.filter((f) => f.type === 'TEXT' || f.type === 'BRAND_TEXT' || f.type === 'CLIENT_TEXT');

  const composites: sharp.OverlayOptions[] = [];

  for (const field of photoFields) {
    const sourceBuffer =
      field.type === 'BRAND_LOGO' ? params.brandLogoBuffer : field.type === 'CLIENT_LOGO' ? params.clientLogoBuffer : params.photoBuffer;
    if (!sourceBuffer) continue; // no photo/logo on file — leave the template's own artwork showing through
    const boxWPx = Math.max(1, Math.round(field.w * widthPx));
    const boxHPx = Math.max(1, Math.round(field.h * heightPx));
    const layer = await renderPhotoFieldBuffer(field, sourceBuffer, boxWPx, boxHPx);
    composites.push({ input: layer, left: Math.round(field.x * widthPx), top: Math.round(field.y * heightPx) });
  }

  for (const field of textFields) {
    const value = (
      field.type === 'BRAND_TEXT'
        ? params.brandValues?.[field.brandKey as BrandKey] ?? ''
        : field.type === 'CLIENT_TEXT'
          ? params.clientValues?.[field.clientKey as ClientKey] ?? ''
          : params.values[field.key] ?? ''
    ).trim();
    if (!value) continue;
    const boxWPx = Math.max(1, Math.round(field.w * widthPx));
    const boxHPx = Math.max(1, Math.round(field.h * heightPx));
    const layer = renderTextFieldSvg(field, value, boxWPx, boxHPx);
    composites.push({ input: layer, left: Math.round(field.x * widthPx), top: Math.round(field.y * heightPx) });
  }

  return base.composite(composites).jpeg({ quality: 90 }).toBuffer();
}
