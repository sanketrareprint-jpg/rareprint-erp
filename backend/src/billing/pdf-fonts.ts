// backend/src/billing/pdf-fonts.ts
//
// PDFKit's built-in standard-14 fonts (Helvetica, Helvetica-Bold, etc.) do
// NOT include the Indian Rupee glyph (₹, U+20B9) — any "₹" drawn with them
// renders as a broken/missing character (confirmed while matching the
// reference invoice layout, 2026-08-18).
//
// Segoe UI is used here because it's the exact font RarePrint's original
// invoice tool used (confirmed via `pdffonts` on the reference PDF) and it
// includes the ₹ glyph. Sanket supplied SEGOEUI.TTF/SEGOEUIB.TTF from his
// own licensed Windows install, 2026-08-20 (an earlier pass used the
// open-source DejaVu Sans as a stand-in — see git history — since Segoe UI
// itself can't be freely redistributed).
//
// IMPORTANT — licensing: Segoe UI is Microsoft's proprietary font, not
// freely redistributable. It's checked into this repo on the basis that
// it's used only to render RarePrint's own documents on infrastructure
// Sanket controls. If this repo is ever made public, or reused as a base
// for the multi-tenant SaaS conversion (see docs/SaaS_Conversion_Roadmap_v2.md)
// where the codebase might be shared outside RarePrint, these two font
// files should be pulled back out first and replaced with an open
// alternative (DejaVu Sans, previously used here, also has full ₹ support).
import { join } from 'path';

const FONTS_DIR = join(process.cwd(), 'assets', 'fonts');
export const FONT_REGULAR_PATH = join(FONTS_DIR, 'SegoeUI.ttf');
export const FONT_BOLD_PATH = join(FONTS_DIR, 'SegoeUI-Bold.ttf');

// Registers the two weights under the names 'Body' / 'Body-Bold' — call once
// per PDFDocument right after creating it, then use doc.font('Body') /
// doc.font('Body-Bold') exactly like the Helvetica pair they replace.
export function registerInvoiceFonts(doc: PDFKit.PDFDocument): void {
  doc.registerFont('Body', FONT_REGULAR_PATH);
  doc.registerFont('Body-Bold', FONT_BOLD_PATH);
}
