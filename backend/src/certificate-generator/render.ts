// backend/src/certificate-generator/render.ts
//
// Draws one certificate (template background image + dynamic text fields)
// onto an existing pdfkit document at a given sheet position. Used both to
// build the full imposed sheet PDF (one call per imposition slot) and to
// build a single-certificate preview PDF (one call at 0,0 on a cert-sized
// page) — same code path, so the preview always matches the real output.
//
// The 90°-rotation transform below was verified against pdfkit 0.19.1 with
// a standalone bounding-box-extraction test (rotate(90) about the far
// corner, i.e. translate(x + naturalHeightPt, y) then rotate(90)) before
// being used here — an earlier attempt using rotate + a post-translate
// landed the certificate completely outside its target slot.
import { resolveFontName, type FontFamily } from './fonts';

export type FieldAlign = 'left' | 'center' | 'right';
export type FieldVAlign = 'top' | 'middle' | 'bottom';

export interface CertificateField {
  key: string;
  label: string;
  xIn: number;
  yIn: number;
  wIn: number;
  hIn: number;
  fontFamily: FontFamily;
  fontSizePt: number;
  bold: boolean;
  color: string; // hex, e.g. '#111111'
  align: FieldAlign;
  verticalAlign: FieldVAlign;
}

const IN_TO_PT = 72;

/**
 * Draws the template image + every field's value into the rectangle whose
 * top-left corner is (slotXIn, slotYIn) in sheet space. `certWidthIn`/
 * `certHeightIn` are the certificate's NATURAL (unrotated) physical size —
 * when `rotated` is true, the occupied slot on the sheet is
 * certHeightIn(wide) × certWidthIn(tall) (see imposition.ts), and the whole
 * certificate (image + fields, as a rigid unit) is rotated 90° to fill it.
 */
export function drawCertificate(
  doc: PDFKit.PDFDocument,
  slotXIn: number,
  slotYIn: number,
  certWidthIn: number,
  certHeightIn: number,
  rotated: boolean,
  templateImage: Buffer,
  fields: CertificateField[],
  values: Record<string, string>,
): void {
  const slotXPt = slotXIn * IN_TO_PT;
  const slotYPt = slotYIn * IN_TO_PT;
  const wPt = certWidthIn * IN_TO_PT;
  const hPt = certHeightIn * IN_TO_PT;

  doc.save();
  if (rotated) {
    doc.translate(slotXPt + hPt, slotYPt);
    doc.rotate(90, { origin: [0, 0] });
  } else {
    doc.translate(slotXPt, slotYPt);
  }

  // Everything below is drawn in the certificate's own local (0,0)-(wPt,hPt)
  // frame — the save()/translate()/rotate() above places that whole frame
  // (image + text together) at the right spot on the sheet.
  doc.image(templateImage, 0, 0, { width: wPt, height: hPt });

  for (const field of fields) {
    const value = values[field.key] ?? '';
    if (!value) continue;

    const fontName = resolveFontName(field.fontFamily, field.bold);
    doc.font(fontName).fontSize(field.fontSizePt).fillColor(field.color);

    const boxXPt = field.xIn * IN_TO_PT;
    const boxYPt = field.yIn * IN_TO_PT;
    const boxWPt = field.wIn * IN_TO_PT;
    const boxHPt = field.hIn * IN_TO_PT;

    const textOptions = { width: boxWPt, align: field.align, lineBreak: true } as const;
    const textHeight = doc.heightOfString(value, textOptions);
    let textYPt = boxYPt;
    if (field.verticalAlign === 'middle') textYPt = boxYPt + Math.max(0, (boxHPt - textHeight) / 2);
    else if (field.verticalAlign === 'bottom') textYPt = boxYPt + Math.max(0, boxHPt - textHeight);

    doc.text(value, boxXPt, textYPt, textOptions);
  }

  doc.restore();
}
