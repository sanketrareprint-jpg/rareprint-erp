// backend/src/billing/invoice-pdf.ts
//
// Renders the Tax Invoice PDF matching RarePrint's real bill layout 1:1 —
// see docs/Invoice_PDF_Replication_Spec.md for the exact section-by-section
// spec this follows (supersedes the earlier §1 in
// docs/Billing_Module_Build_Prompt.md — this version was corrected against a
// second, more complete reference, Sale_1263_23-06-2026.pdf, 2026-08-20).
// Structural pattern (PDFKit doc → chunks → Buffer via a Promise) mirrors the
// existing generateInvoicePdf in bigship.service.ts.
//
// Every coordinate/height below (2026-08-20 pass) was taken directly from
// `pdftotext -bbox-layout` run against the reference PDF — i.e. the exact
// pt-position of every text run in the original, not a visual estimate. An
// earlier pass eyeballed spacing from rendered pixels and drifted further
// off the original with every section (confirmed by the user overlaying
// both PDFs in Photoshop); this pass replaces every offset with the
// measured value so nothing compounds.
import PDFDocument from 'pdfkit';
import { amountInWords } from './amount-in-words';
import { registerInvoiceFonts } from './pdf-fonts';
import { INVOICE_GLYPHS, INVOICE_GLYPHS_F8 } from './invoice-glyphs';

export interface InvoicePdfCompanyProfile {
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  companyGstin: string;
  companyState: string;
  bankName: string;
  bankAccountNumber: string;
  bankIfsc: string;
  bankAccountHolderName: string;
  defaultTermsAndConditions: string;
  logoUrl: string | null;
  signatureUrl: string | null;
}

export interface InvoicePdfItem {
  productName: string;
  hsnSac: string | null;
  quantity: number;
  unit: string;
  unitPrice: number;
  gstRatePct: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  taxableAmount: number;
  lineTotal: number;
}

export interface InvoicePdfData {
  invoiceNumber: string;
  issueDate: string; // pre-formatted, e.g. "23-06-2026"
  gstTreatment: 'INTRA_STATE' | 'INTER_STATE' | 'EXPORT' | 'UNREGISTERED';
  subtotal: number;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  previousBalance: number;
  currentBalance: number;
  // Sales-agent name — printed as a note line under every item's product
  // name (e.g. "STICKER 6*4" / "(SANKET)"), matching the reference. The
  // template no longer has a standalone "Description" field — see
  // docs/Invoice_PDF_Replication_Spec.md §6/§7.
  agentName: string;
  termsAndConditions: string;
  customerName: string;
  customerAddress: string; // full comma-joined address (billing address, city, state, pincode)
  customerPhone: string;
  customerState: string;
  customerGstin: string;
  items: InvoicePdfItem[];
  company: InvoicePdfCompanyProfile;
}

// PAGE_MARGIN/CONTENT_WIDTH corrected 2026-08-21 from actual `re` (rectangle)
// operator coordinates in the reference's content stream, extracted via
// pikepdf with full q/cm/Q matrix accumulation — a more authoritative source
// than text bounding boxes, since every section's border rect and column
// divider is drawn with these exact numbers (the header box, item-table
// columns, Bill To/Bank grey bars all independently agree on ~529.1-529.5
// wide starting at x≈33.7). The reference's left/right margins aren't quite
// symmetric (33.7 vs ~32.4), so CONTENT_WIDTH is its own measured constant
// rather than PAGE_WIDTH - 2*margin.
const PAGE_MARGIN = 33.7;
const PAGE_WIDTH = 594.96;
const PAGE_HEIGHT = 841.92;
const CONTENT_WIDTH = 529.1;
// Sampled directly from the reference PDF's rendered pixels (2026-08-20) —
// not black/generic grey. See docs/Invoice_PDF_Replication_Spec.md.
const GREY = '#f4f4f4';
const BORDER = '#3f4155';

// Indian-style digit grouping (last 3 digits, then groups of 2 —
// "12,34,567.89") — the reference invoice formats every amount this way
// (e.g. "₹1,449.15", "₹9,500.00"), not plain toFixed(2). Matches the same
// grouping convention amount-in-words.ts uses conceptually (lakh/crore).
function money(n: number): string {
  const safe = Number.isFinite(n) ? n : 0;
  const fixed = Math.abs(safe).toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  let grouped = intPart;
  if (intPart.length > 3) {
    const last3 = intPart.slice(-3);
    const rest = intPart.slice(0, -3);
    grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
  }
  return `${safe < 0 ? '-' : ''}${grouped}.${decPart}`;
}

// ₹-prefixed amount, for table cells that should show the currency symbol
// per-cell (matches the reference invoice).
function rupee(n: number): string {
  return `₹${money(n)}`;
}

function sanitize(value: string | null | undefined): string {
  return String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim();
}

function dataUrlToBuffer(dataUrl: string | null | undefined): Buffer | null {
  if (!dataUrl || !dataUrl.startsWith('data:')) return null;
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return null;
  try {
    return Buffer.from(dataUrl.slice(commaIdx + 1), 'base64');
  } catch {
    return null;
  }
}

export async function buildInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN, bufferPages: true });
  const chunks: Buffer[] = [];
  registerInvoiceFonts(doc);

  return new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    let y = PAGE_MARGIN;
    // Tracks whether a page break has happened since boxTop was captured —
    // the final outer-border rect further down assumes boxTop and y are on
    // the same page (PDFKit y-coordinates reset per page). On invoices long
    // enough to paginate (many line items), drawing that rect across a page
    // boundary produced a stray full-length horizontal line slicing through
    // whatever content sits at boxTop's y-offset on the later page —
    // confirmed via a 25-item stress render. Skip the outer box once a page
    // break has occurred; each section already has its own border.
    let pageBroke = false;

    function ensureSpace(needed: number) {
      if (y + needed > PAGE_HEIGHT - PAGE_MARGIN) {
        doc.addPage();
        y = PAGE_MARGIN;
        pageBroke = true;
      }
    }

    // Our SegoeUI-Bold.ttf's glyph aspect ratio doesn't match the reference's
    // actual bold weight: matching cap-height (via fontSize alone) leaves
    // every bold string measurably narrower (~8-9%) than the reference —
    // measured consistently across "Invoice"/"RAREPRINT.IN"/"Tax Summary:"/
    // "Bill To:" etc. via pdftotext -bbox-layout. No single fontSize can fix
    // both dimensions at once (that would require the reference's actual
    // font file, which we don't have). This stretches JUST the horizontal
    // axis via a scale transform around each call — glyphs render at the
    // correct height (fontSize unaffected) and the correct on-page width.
    // Use for standalone (non `continued:true`) Body-Bold text only — a
    // save()/restore() pair around a continued-chain call would break
    // PDFKit's internal cursor tracking between the chained pieces.
    const BOLD_HSCALE = 1.08;
    // Optional hscale param — lets individual call sites (the page title
    // below) override the shared BOLD_HSCALE with a value re-measured
    // against actual rendered pixels, without changing every other
    // boldText() call that was tuned against the (now known unreliable, see
    // the title's own comment) pdftotext-bbox-based BOLD_HSCALE.
    function boldText(str: string, x: number, y0: number, opts?: PDFKit.Mixins.TextOptions, hscale: number = BOLD_HSCALE) {
      doc.save();
      doc.translate(x, y0);
      doc.scale(hscale, 1);
      const scaledOpts = opts?.width !== undefined ? { ...opts, width: opts.width / hscale } : opts;
      doc.text(str, 0, 0, scaledOpts);
      doc.restore();
    }

    // Draws a string using the reference invoice's OWN exact glyph outlines
    // (see invoice-glyphs.ts) instead of our SegoeUI-Bold.ttf — for the two
    // fixed strings ("Invoice" title, "RAREPRINT.IN" company name) where
    // matching position+width alone (boldText's per-character hscale, still
    // used elsewhere) left a ~1px anti-aliasing fringe under pixel-diff
    // comparison, because our font's actual glyph shapes aren't
    // byte-identical to whatever produced the reference's Type3 font.
    // xPositions are each character's absolute baseline-origin x (PDFKit
    // page coords, same coordinate frame the reference's own content stream
    // uses — confirmed transferable, see Bill To:/RAREPRINT.IN position
    // fixes above); baselineY is the shared text baseline (NOT PDFKit's
    // usual "top of box" y — this draws raw vector paths, not doc.text());
    // scale converts the glyphs' em-fraction units to pt (= the reference's
    // own Tf font size × its content-stream cm scale, extracted via pikepdf
    // 2026-08-29 — both "Invoice" and "RAREPRINT.IN" use a uniform 0.75
    // scale on both axes: 22.4*0.75=16.8 and 19.6*0.75=14.7 respectively).
    function drawGlyphString(chars: string, xPositions: number[], baselineY: number, scale: number, glyphMap: Record<string, typeof INVOICE_GLYPHS[string]> = INVOICE_GLYPHS) {
      doc.save();
      doc.fillColor(BORDER);
      for (let i = 0; i < chars.length; i++) {
        const path = glyphMap[chars[i]];
        if (!path) continue;
        const ox = xPositions[i];
        for (const subpath of path) {
          for (const seg of subpath) {
            if (seg[0] === 'm') {
              doc.moveTo(ox + seg[1] * scale, baselineY - seg[2] * scale);
            } else if (seg[0] === 'l') {
              doc.lineTo(ox + seg[1] * scale, baselineY - seg[2] * scale);
            } else if (seg[0] === 'c') {
              doc.bezierCurveTo(
                ox + seg[1] * scale, baselineY - seg[2] * scale,
                ox + seg[3] * scale, baselineY - seg[4] * scale,
                ox + seg[5] * scale, baselineY - seg[6] * scale,
              );
            } else if (seg[0] === 'h') {
              doc.closePath();
            }
          }
        }
      }
      doc.fill();
      doc.restore();
    }

    // For inline "Label: value" pairs where the value is bold — these were
    // built with continued:true chains, which can't use boldText() above
    // (the save/scale/restore desyncs PDFKit's internal text-flow cursor
    // between chained segments). Instead: draw the regular label normally,
    // measure its actual rendered width with widthOfString(), then draw the
    // bold value from that exact x with the same horizontal correction.
    // Every call site this replaces was a single, non-wrapping line, so
    // lineBreak:false (no continued:true) is safe here.
    // labelHscale/valueHscale: optional local overrides, default to
    // unscaled label / BOLD_HSCALE value (i.e. every pre-existing call site
    // is unaffected). Added 2026-08-29 for the company header row (Phone/
    // Email/GSTIN/State) specifically, where real-pixel measurement showed
    // BOLD_HSCALE=1.08 (tuned against much larger elements — the title,
    // company name) badly overshoots at this small size/weight: reference
    // values measured 6-14% NARROWER than ours at hscale 1.08, not wider.
    function labelBoldValue(label: string, value: string, x: number, y0: number, size: number, labelHscale = 1, valueHscale: number = BOLD_HSCALE) {
      doc.font('Body').fontSize(size);
      let labelW: number;
      if (labelHscale === 1) {
        doc.text(label, x, y0, { lineBreak: false });
        labelW = doc.widthOfString(label);
      } else {
        doc.save();
        doc.translate(x, y0);
        doc.scale(labelHscale, 1);
        doc.text(label, 0, 0, { lineBreak: false });
        doc.restore();
        labelW = doc.widthOfString(label) * labelHscale;
      }
      doc.font('Body-Bold').fontSize(size);
      boldText(value, x + labelW, y0, { lineBreak: false }, valueHscale);
    }

    // ── 1. Page title ────────────────────────────────────────────────────
    // fontSize 17.14 (was 14.5) + hscale 0.918 (was the shared BOLD_HSCALE,
    // 1.08) — re-measured 2026-08-27 against ACTUAL RENDERED PIXELS
    // (pdftoppm at 300dpi, ink bbox), not pdftotext bbox. The previous
    // 14.5/1.08 pair was tuned against pdftotext's reported cap-height,
    // which (like its yMin — see the y-offset comment below) turns out to
    // be based on font ascent metrics, not real glyph ink: real rendered
    // cap-height was measured at 10.56pt against the reference's actual
    // 12.48pt — 18% short, not "already matched" as the old analysis
    // concluded. Recomputed cleanly from the reference's true pixel
    // dimensions (width=51.12pt, height=12.48pt): fontSize scales height
    // directly (14.5 * 12.48/10.56 = 17.14), then hscale is solved against
    // the new fontSize's natural (unstretched) width to hit the target
    // width (51.12/((50.88/1.08)*(17.14/14.5)) = 0.918). This uses a local
    // hscale override (see boldText's new 5th param) rather than changing
    // the shared BOLD_HSCALE, since every other bold element that was tuned
    // against the same flawed pdftotext method hasn't been re-verified
    // against real pixels yet and shouldn't be touched blind.
    // Drawn with the reference's own exact glyph outlines (drawGlyphString,
    // see its comment above) rather than our SegoeUI-Bold.ttf — root cause
    // found 2026-08-29 via pikepdf: the reference draws "Invoice" as 7
    // individually-positioned Type3 glyphs (hand-authored bezier outlines,
    // not a normal embedded TrueType program) inside a `cm` of
    // [0.75 0 0 -0.75 ...], i.e. a uniform 75% scale on both axes. An
    // earlier pass tried matching our own font's glyphs to the reference's
    // per-character positions/widths (still used for "RAREPRINT.IN" below,
    // where it's a good enough match) but for this title a byte-for-byte
    // outline comparison still showed a ~1px anti-aliasing fringe — our
    // font's curves aren't quite the same shape as the reference's. Using
    // the reference's own path data sidesteps that entirely: this is a
    // pixel-exact reproduction, not an approximation. Baseline y = 56.25
    // (PAGE_MARGIN + 22.55) and scale = 22.4 * 0.75 = 16.8 come directly
    // from the reference's Tf/Tm/cm operators, not a re-derived estimate.
    // y+22.46 (was +22.31) — sub-pixel ink-centroid comparison (not just
    // bbox, which can't see offsets smaller than 1px) showed all 7 letters
    // consistently sitting ~0.15pt too high vs the reference, same
    // direction and magnitude across every letter (not noise — noise would
    // vary sign/magnitude randomly per letter, this didn't).
    drawGlyphString(
      'Invoice',
      [271.512, 276.079, 285.353, 293.364, 302.941, 307.025, 315.815],
      y + 22.46,
      16.8,
    );
    // 34.9 (was 34) — re-measured 2026-08-21 against the reference's actual
    // header-box rect() top edge (y=68.6, via pikepdf content-stream
    // extraction) rather than a text-based estimate; this offset is the
    // single upstream anchor every section below is built relative to, so
    // fixing it here is more reliable than chasing the same ~1pt error
    // separately in every downstream row.
    y += 34.9;

    const boxTop = y;

    // ── 2. Company header block ─────────────────────────────────────────
    // 85.5 (was 85) — re-measured 2026-08-21 from the reference's header-box
    // rect() height directly (bottom edge y=154.10 vs top y=68.60).
    const headerHeight = 85.5;
    doc.rect(PAGE_MARGIN, y, CONTENT_WIDTH, headerHeight).stroke(BORDER);

    const logoBuf = dataUrlToBuffer(data.company.logoUrl);
    // headerTextX=120 matches the reference's measured text left edge
    // exactly (company name/address both start at x≈119.8).
    let headerTextX = PAGE_MARGIN + 12;
    if (logoBuf) {
      try {
        // Position/size read directly off the reference PDF's content
        // stream (the `cm` transform matrix preceding the image `Do`
        // operator, decoded via pikepdf) — not eyeballed. Reference places
        // the logo at x=39.75, y=75.0 (top-left, boxTop+7) sized 72.75².
        // No `fit` here — fit preserves the source image's own aspect ratio
        // within the box, but the reference stretches the logo to exactly
        // 73x73 regardless of the uploaded image's native proportions
        // (confirmed via pikepdf transform-matrix extraction: the reference
        // signature image below has a non-square target box that doesn't
        // match its source aspect ratio either, and still renders at the
        // full target size — i.e. it's stretched, not letterboxed).
        // y+6 (was y+7) — re-measured against the reference's actual image
        // transform matrix post-fix: ref places the logo's top edge 1pt
        // higher than our y+7 was landing.
        // x offset 6.05 (was 5), y offset 6.4 (was 6) — re-measured 2026-08-21
        // against the reference's image transform matrix a second time now
        // that boxTop lands exactly on the reference's 68.60 (target logo
        // origin: x=39.75, y_top=75.00 against PAGE_MARGIN=33.7/boxTop=68.60).
        doc.image(logoBuf, PAGE_MARGIN + 6.05, y + 6.4, { width: 73, height: 73 });
        headerTextX = 120;
      } catch {
        // Corrupt/unsupported image data — fall back to text-only header
        // rather than failing the whole PDF.
      }
    }

    const headerTextWidth = PAGE_MARGIN + CONTENT_WIDTH - headerTextX - 10;
    // fontSize 15.46 (was 13) + local hscale 0.9035 (was the shared
    // BOLD_HSCALE, 1.08) — re-measured 2026-08-27 against actual rendered
    // pixels. This was one of the same 3 elements ("Invoice"/"RAREPRINT.IN"/
    // "Tax Summary:") the original BOLD_HSCALE=1.08 was derived from via
    // pdftotext cap-height, which — same root cause as the page title fix
    // above — reports font-ascent-based height, not real ink: actual
    // rendered height measured 8.88pt vs the reference's real 10.56pt, an
    // 18% shortfall matching the title's own error almost exactly.
    doc.font('Body-Bold').fontSize(15.46).fillColor(BORDER);
    // Drawn with the reference's own exact glyph outlines (drawGlyphString),
    // same fix/reasoning as the title above — company name is always
    // "RAREPRINT.IN" for this tenant, so hardcoding the reference's own
    // path data is safe. Falls back to the old uniform-hscale boldText call
    // for any other company name (SaaS conversion, or if this profile
    // field ever changes, in which case we don't have reference glyph data
    // for arbitrary letters anyway). Baseline y = 90.0 (boxTop + 21.4) and
    // scale = 19.6 * 0.75 = 14.7 come directly from the reference's
    // Tf/Tm/cm operators.
    if (sanitize(data.company.companyName) === 'RAREPRINT.IN') {
      // y+21.16 (was +21.4) — same -0.24pt (1px @300dpi) nudge as the title
      // above, for the same reason.
      drawGlyphString(
        'RAREPRINT.IN',
        [119.8008, 128.8562, 138.4426, 147.498, 155.8502, 165.1209, 174.1763, 178.173, 188.4482, 195.6518, 199.5266, 203.5233],
        y + 21.16,
        14.7,
      );
    } else {
      boldText(sanitize(data.company.companyName) || 'Company Name Not Set', headerTextX, y + 5.0, { width: headerTextWidth }, 0.9035);
    }
    doc.font('Body').fontSize(8.5).fillColor(BORDER);
    // lineGap:-1.5556 + height:24 (was unset/22) — root cause of the
    // reported overlap bug (2026-08-29): at the real headerTextWidth
    // (432.8pt, only reached with a logo present — headerTextX=120; the
    // test harness's no-logo default used a much wider 507.1pt box that
    // masked this), this address needs 2 lines. lineGap:-1.5556 tightens
    // the line pitch to the reference's own measured 9.75pt line spacing
    // (pikepdf-verified, 2026-08-29) — the two lines only occupy ~19.5pt
    // once rendered. But PDFKit's internal "does the next line still fit"
    // check for the height/ellipsis cutoff (unlike heightOfString(), which
    // does respect the tightened lineGap) still measures against something
    // closer to the font's *natural* ~11.3pt line height when deciding
    // whether to truncate — empirically, height:20/21 still dropped the
    // whole 2nd line ("MAHARASHTRA 442401") behind an ellipsis even though
    // the tightened text only needs 19.5pt; height:22 was the actual
    // measured threshold where PDFKit stopped truncating. height:24 keeps
    // a safety margin above that threshold (for slightly longer company
    // addresses on other tenants) without pushing into rowY1 below, since
    // the real rendered block still only occupies ~19.5-22.6pt regardless
    // of this cap.
    // y+27.32 (was +29) — re-measured against real rendered pixels
    // (pdftoppm 300dpi, ink-row detection) once the 2-line wrap above was
    // fixed: the block was landing 1.68pt too low vs the reference's own
    // measured line bands, same verification method as every other element
    // in this file. Inter-line spacing itself already matches (9.84pt vs
    // reference's 9.84pt) — only the block's start position needed this.
    // hscale 1.01 — re-measured 2026-08-29 against real rendered pixels:
    // this address is long enough (2 full lines, ~90 chars) that even the
    // small ~0.6-1.4% per-line width gap between our SegoeUI approximation
    // and the reference's own font compounds into a visibly "doubled"/
    // stretched look under close inspection, reported after the previous
    // fixes. boldText() is reused here despite the name — it's just a
    // generic hscale-wrapped text draw (save/translate/scale/restore) and
    // doesn't force bold; current font ('Body') is already set above.
    // hscale 0.9987 (was 1.01) — re-measured 2026-08-31 via pdftotext
    // word-by-word position against the reference's customerAddress line
    // (same font/context): 1.01 caused a small but real cumulative
    // rightward drift (~1.5% over the line length) visible in an overlay.
    boldText(sanitize(data.company.companyAddress) || 'Company address not set — fill in Billing > Company Profile', headerTextX, y + 27.32, { width: headerTextWidth, height: 24, lineGap: -1.5556, ellipsis: true }, 0.9987);

    doc.font('Body').fontSize(8.5).fillColor(BORDER);
    // Right-half column starts at headerTextX+220.5 — measured from the
    // reference (Email:/State: sit at x≈340.5 vs Phone:/GSTIN: at x≈121.8,
    // a ~219pt gap), not an exact half of headerTextWidth as an earlier
    // pass assumed (that landed ~5pt too far left).
    const rightColX = headerTextX + 220.5;
    // rowY1/rowY2: +50.6/+63.12 (was +53/+66) — re-measured 2026-08-29
    // against real rendered pixels the same way as the address fix above,
    // now that the address block's 2-line wrap is fixed and these two rows
    // sit right below it. Previously untouched because the address bug
    // masked the real target position (it collided with these rows rather
    // than landing where a correctly-wrapped address would).
    const rowY1 = y + 50.6;
    // valueHscale 0.9698 (was default BOLD_HSCALE=1.08) — re-measured
    // 2026-08-29 against real rendered pixels: at this row's small size
    // (8.5pt), BOLD_HSCALE (tuned for the much larger title/company name)
    // overshoots — Phone/GSTIN/Email/State values measured 6-14% NARROWER
    // in the reference than our rendering at hscale=1.08. 0.9698 = 1.08 ×
    // 0.898, where 0.898 is the char-count-weighted average of the four
    // measured ref/mine width ratios (0.893/0.940/0.899/0.855) — i.e. the
    // actual correction needed relative to a neutral (unscaled) hscale of 1
    // is only a mild ~3% compression, not the ~10% a naive read of those
    // ratios would suggest (they were measured against the already-1.08
    // -stretched render, not against unscaled text).
    // Phone:/Email:/GSTIN:/State: labels are fixed strings (unlike the
    // values next to them, which are per-company data) — drawn with the
    // reference's own exact F8 glyph outlines instead of boldText's
    // hscale approximation, same reasoning as every other fixed label in
    // this file. Positions/baseline (128.25/141.0) and scale (8.4 =
    // 11.2 Tf × 0.75 cm) extracted via pikepdf 2026-08-29. Values keep the
    // hscale-based approximation (can't hardcode outlines for arbitrary
    // per-company phone/GSTIN/email/state text) but now start at the
    // reference's own exact measured x instead of a computed labelW.
    drawGlyphString('Phone:', [121.758, 127.051, 131.673, 136.458, 141.091, 145.541], 128.25, 8.4, INVOICE_GLYPHS_F8);
    doc.font('Body-Bold').fontSize(8.5);
    boldText(sanitize(data.company.companyPhone) || '-', 149.66, rowY1, { lineBreak: false }, 0.9698);
    drawGlyphString('Email:', [340.488, 345.257, 352.615, 357.179, 359.220, 361.260], 128.25, 8.4, INVOICE_GLYPHS_F8);
    doc.font('Body-Bold').fontSize(8.5);
    // 0.939 (not the shared 0.9698) — lowercase-letter/symbol strings
    // (email, state name below) diverge from Segoe UI Bold vs the
    // reference's font more than all-digit strings (phone, GSTIN) do at
    // this hscale; re-measured individually against real pixels.
    boldText(sanitize(data.company.companyEmail) || '-', 365.379, rowY1, { lineBreak: false }, 0.939);

    const rowY2 = y + 63.12;
    drawGlyphString('GSTIN:', [121.758, 127.473, 132.455, 137.462, 139.744, 145.729], 141.0, 8.4, INVOICE_GLYPHS_F8);
    doc.font('Body-Bold').fontSize(8.5);
    boldText(sanitize(data.company.companyGstin) || '-', 149.848, rowY2, { lineBreak: false }, 0.9698);
    drawGlyphString('State:', [340.488, 345.470, 348.215, 352.779, 355.524, 359.974], 141.0, 8.4, INVOICE_GLYPHS_F8);
    doc.font('Body-Bold').fontSize(8.5);
    // 0.928 — same reasoning as Email above (mixed letters/digits/'-').
    boldText(sanitize(data.company.companyState) || '-', 364.090, rowY2, { lineBreak: false }, 0.928);

    y += headerHeight;
    // 0.4pt gap — the reference's header box and Bill To/Invoice Details box
    // don't share a line either (measured: header bottom=154.10, Bill To bar
    // top=154.50).
    y += 0.4;

    // ── 3. Bill To / Invoice Details row ────────────────────────────────
    // 75.8 (was 77) — re-measured 2026-08-21 against a real generated PDF vs
    // the reference: the reference's Bill To/Invoice Details box actually
    // closes at y=230.3 (pikepdf rect extraction), 1.2pt earlier than 77
    // was landing.
    const biRowHeight = 75.8;
    const colWidth = CONTENT_WIDTH / 2;
    doc.rect(PAGE_MARGIN, y, CONTENT_WIDTH, biRowHeight).stroke(BORDER);
    // Grey label fills drawn BEFORE the vertical/horizontal dividers below —
    // fill() paints an opaque rectangle, so if the dividers were drawn
    // first (as an earlier pass had it), the fill silently painted over
    // whatever portion of them fell within the label band, making the
    // column separator look like it "didn't reach the top" of the row even
    // though the moveTo/lineTo call itself was correct. Root-caused
    // 2026-08-21 — same fix applied to Bank Details/For Company below.
    doc.rect(PAGE_MARGIN, y, colWidth, 17).fill(GREY);
    doc.rect(PAGE_MARGIN + colWidth, y, colWidth, 17).fill(GREY);
    doc.moveTo(PAGE_MARGIN + colWidth, y).lineTo(PAGE_MARGIN + colWidth, y + biRowHeight).stroke(BORDER);
    // Divider between the "Bill To:"/"Invoice Details:" labels and the
    // customer/invoice details below them — same treatment as Terms And
    // Conditions and Bank Details further down (added 2026-08-21; this one
    // was missed in that pass since it's earlier in the document).
    doc.moveTo(PAGE_MARGIN, y + 17).lineTo(PAGE_MARGIN + CONTENT_WIDTH, y + 17).stroke(BORDER);
    doc.fillColor(BORDER).font('Body-Bold').fontSize(7.3);
    // Left-column text padding: +8 -> +2 (an earlier pass) -> +3.2 (this
    // one). Re-measured 2026-08-21 against a real generated PDF vs the
    // reference via pdftotext xMin on every line in this column (label,
    // customer name, address, contact, state) — all showed the exact same
    // -1.19pt delta at +2, meaning the true inset is ~3.19, not ~1.9-2.6 as
    // the earlier estimate had it.
    // y+2.84 (was +5) — re-measured 2026-08-27 against actual rendered
    // pixels: both labels landed 2.16pt too low (x and width already
    // matched, so unlike Invoice/RAREPRINT.IN/Tax Summary: above, this one
    // only needed a y nudge, not a fontSize/hscale change).
    // Upgraded to the reference's own exact glyph outlines (drawGlyphString)
    // — the per-character-position-only version above (kept working via
    // our own font) still had the same ~1px outline-shape fringe the
    // title/company name had before their own outline upgrade. Same fix,
    // same HEADER_GLYPH_SCALE=8.4 as the other section headers below.
    drawGlyphString(
      'Bill To:',
      [36.891, 42.118, 44.159, 46.199, 48.239, 50.156, 54.757, 59.542],
      y + 11.25,
      8.4,
    );
    // Drawn with the reference's own exact glyph outlines (drawGlyphString),
    // same treatment as the title/company-name/Bill-To fixes above, now
    // extended to the rest of the document's fixed bold section-header
    // labels — 2026-08-29. Every one of these headers uses the SAME font
    // (F5) at the SAME size (11.2) and the SAME uniform 0.75 cm-scale in
    // the reference (verified via pikepdf across all of them, not assumed
    // from the title/company case), so they all share one constant:
    // HEADER_GLYPH_SCALE = 11.2 * 0.75 = 8.4. y+11.25 — reference baseline
    // 165.75 minus this row's y (154.5 in scenario A).
    drawGlyphString(
      'Invoice Details:',
      [301.641, 303.923, 308.556, 312.559, 317.344, 319.385, 323.777, 328.226, 330.307, 335.813, 340.263, 343.008, 347.572, 349.612, 351.652, 355.983],
      y + 11.25,
      8.4,
    );

    // Bill To column: name, full address, (Contact No | GSTIN Number stacked), State.
    // fontSize 8.4 (was 8/9 below) — root-caused 2026-08-29 via pikepdf
    // content-stream matrix tracking: every text run in this row uses the
    // SAME Tf 11.2 × cm 0.75 = 8.4 the header block/section headers use,
    // not 8 or 9. The old 9 was ~7% too big on BOTH axes (not just an
    // hscale problem), which is what made this section look badly
    // "stretched"/doubled when overlaid against the reference — much
    // worse than the header block's pure-hscale issue, because here the
    // base size itself was wrong. Fixed labels (Contact No:/GSTIN Number:/
    // State:/No:/Date:/Place of Supply:) now use the reference's own exact
    // glyph outlines (drawGlyphString) like every other fixed label in this
    // file; values (customer name/address/phone/GSTIN/state, invoice no/
    // date) stay hscale-approximated since they're per-invoice dynamic
    // data — hscale constants reused from the equivalent header-block
    // fields (0.9698 for digit-heavy, 0.928 for mixed letters/hyphen).
    // All 8 value y-offsets below carry a uniform +1.32 vs. the previous
    // pass — re-measured 2026-08-31 via pdftotext bbox against the reference
    // (Sale_1263): every one of these values sat exactly 1.32pt too HIGH
    // (label glyphs, drawn separately via drawGlyphString at their own
    // absolute y, were already exact — only these dynamic-value offsets were
    // off, uniformly). Reported as "invoice details/bill to values need a
    // nudge" from an opacity-overlay comparison against the reference PDF.
    //
    // All 8 value y-offsets below ALSO carry a uniform -2.0 on top of the
    // above — root-caused 2026-09-03, same bug/fix as Bank Details: these
    // were calibrated against pdftotext's yMin (font-ascent-based, not real
    // ink — see the Bank Details fix comment for the full explanation).
    // Measured against actual rendered pixels (pdftoppm 300dpi, ink-top of
    // each value's own first character): customerName/customerAddress
    // +1.92pt too low, invoiceNumber/issueDate +2.16pt too low — same
    // magnitude as Bank Details' Body/Body-Bold-at-8.4pt offset, so the same
    // -2.0 correction applied uniformly here too rather than chasing
    // sub-0.3pt per-field noise.
    doc.font('Body-Bold').fontSize(8.4).fillColor(BORDER);
    // hscale 0.9527 (was 0.9698) — re-measured 2026-08-31 via pdftotext
    // word-by-word ("POSH"/"PHARMA") against the reference.
    boldText(sanitize(data.customerName) || 'Customer', PAGE_MARGIN + 3.2, y + 18.67, { width: colWidth - 10, height: 13, ellipsis: true }, 0.9527);
    doc.font('Body').fontSize(8.4);
    // hscale 0.9987 (was 1.01) — same re-measurement as companyAddress above.
    boldText(sanitize(data.customerAddress) || '-', PAGE_MARGIN + 3.2, y + 31.42, { width: colWidth - 10, height: 16, ellipsis: true }, 0.9987);

    const gstinColX = PAGE_MARGIN + colWidth / 2 + 1;
    drawGlyphString('Contact No:', [36.891, 42.352, 47.137, 51.771, 54.516, 59.08, 63.472, 66.217, 68.298, 74.284, 79.069], 212.25, 8.4, INVOICE_GLYPHS_F8);
    doc.font('Body-Bold').fontSize(8.4);
    // hscale 0.9761 (was 0.9698) — re-measured 2026-08-31 against the reference.
    boldText(sanitize(data.customerPhone) || '-', 83.191, y + 48.67, { lineBreak: false }, 0.9761);
    drawGlyphString('GSTIN Number:', [165.75, 171.465, 176.447, 181.454, 183.736, 189.721, 191.803, 197.788, 202.414, 209.772, 214.484, 218.933, 221.776], 212.25, 8.4, INVOICE_GLYPHS_F8);
    doc.font('Body-Bold').fontSize(8.4);
    // hscale 0.9633 (was 0.9698) — re-measured 2026-08-31 against the reference.
    boldText(sanitize(data.customerGstin) || '-', 165.75, y + 58.42, { width: colWidth / 2 - 6 }, 0.9633);

    drawGlyphString('State:', [36.891, 41.873, 44.618, 49.182, 51.927, 56.376], 224.25, 8.4, INVOICE_GLYPHS_F8);
    doc.font('Body-Bold').fontSize(8.4);
    // hscale 0.9376 (was 0.928) — re-measured 2026-08-31 against the reference.
    boldText(sanitize(data.customerState) || '-', 60.492, y + 60.67, { lineBreak: false }, 0.9376);

    // Invoice Details column.
    drawGlyphString('No:', [302.684, 308.669, 313.455], 183.0, 8.4, INVOICE_GLYPHS_F8);
    doc.font('Body-Bold').fontSize(8.4);
    // hscale 0.9763 (was 0.9698) — re-measured 2026-08-31 against the reference.
    boldText(sanitize(data.invoiceNumber), 317.578, y + 19.42, { lineBreak: false }, 0.9763);
    drawGlyphString('Date:', [302.684, 308.19, 312.754, 315.499, 319.948], 195.0, 8.4, INVOICE_GLYPHS_F8);
    doc.font('Body-Bold').fontSize(8.4);
    // hscale 0.9323 (was 0.9698) — re-measured 2026-08-31 against the reference.
    boldText(sanitize(data.issueDate), 324.07, y + 31.42, { lineBreak: false }, 0.9323);
    drawGlyphString('Place of Supply:', [302.684, 307.977, 310.017, 314.581, 318.973, 323.423, 325.504, 330.289, 333.206, 335.287, 340.269, 344.895, 349.606, 354.318, 356.358, 360.328], 207.0, 8.4, INVOICE_GLYPHS_F8);
    doc.font('Body-Bold').fontSize(8.4);
    // hscale 0.9376 (was 0.928) — same re-measurement as the Bill To State
    // field above (identical value/font context).
    boldText(sanitize(data.customerState) || '-', 364.453, y + 43.42, { lineBreak: false }, 0.9376);

    y += biRowHeight;
    // 6.0 (was 5.5) — re-measured 2026-08-21 against a real generated PDF vs
    // the reference: the reference's item table header row actually starts
    // at y=236.3 (pikepdf rect extraction), paired with the biRowHeight fix
    // above.
    y += 6.0;

    // ── 4. Line items table ─────────────────────────────────────────────
    // 8 columns — no separate Ad.CESS column in this template (dropped vs.
    // an earlier pass; see docs/Invoice_PDF_Replication_Spec.md §4). Widths
    // measured from the reference's exact column borders (right-aligned
    // numeric columns' xMax match their header's xMax exactly).
    // Widths re-measured 2026-08-21 from the reference's actual column
    // divider rect() coordinates (not text bboxes) — HSN/SAC, Quantity, and
    // Amount(₹) were each off by 2-2.4pt under the old text-based estimate.
    // Sums to CONTENT_WIDTH (529.1) exactly.
    const cols = [
      { key: '#', width: 21.7, numeric: false },
      { key: 'Item name', width: 139.5, numeric: false },
      { key: 'HSN/ SAC', width: 57.0, numeric: false },
      { key: 'Quantity', width: 63.7, numeric: true },
      { key: 'Unit', width: 57.0, numeric: true },
      { key: 'Price/ Unit (₹)', width: 63.0, numeric: true },
      { key: 'GST(₹)', width: 63.7, numeric: true },
      { key: 'Amount(₹)', width: 63.5, numeric: true },
    ];
    const tableX = PAGE_MARGIN;
    // 16.5 (was 15.7) — re-measured 2026-08-21 against the reference's own
    // rect() column-divider height (top=236.3, bottom=252.8) rather than
    // the earlier text-bbox estimate, which undershot by 0.8pt and
    // propagated through every row below it.
    const headerRowH = 16.5;
    ensureSpace(headerRowH + 26);
    // Vertical column-separator lines for a header/data/total row — rect()
    // only draws each row's outer box, so without this every internal
    // column line (between #, Item name, HSN/SAC, Quantity, ...) was
    // missing throughout the whole table, header included.
    function drawItemRowDividers(rowY: number, rowH: number) {
      let dx = tableX;
      for (let c = 0; c < cols.length - 1; c++) {
        dx += cols[c].width;
        doc.moveTo(dx, rowY).lineTo(dx, rowY + rowH).stroke(BORDER);
      }
    }
    let colX = tableX;
    // fillAndStroke (not .fill().stroke()) — PDFKit's .fill() immediately
    // writes the PDF 'f' operator, which paints AND consumes the current
    // path per the PDF spec, so a chained .stroke() right after has no path
    // left to stroke and silently no-ops. .fillAndStroke() writes a single
    // 'B' (fill+stroke) operator against the same path. This was why every
    // grey header row's own border was invisible despite the code "drawing"
    // it — root-caused 2026-08-21 across all 4 fill()+stroke() chains in
    // this file (item header row, item Total row, tax header, tax TOTAL row).
    doc.rect(tableX, y, CONTENT_WIDTH, headerRowH).fillAndStroke(GREY, BORDER);
    drawItemRowDividers(y, headerRowH);
    doc.fillColor(BORDER).font('Body-Bold').fontSize(6.8);
    // Exact reference glyph positions for each fixed column header — same
    // outline-fidelity fix as the other section headers (drawGlyphString,
    // HEADER_GLYPH_SCALE=8.4), 2026-08-29. Baseline y = row's own y + 11.2
    // (reference 247.50 minus this row's y, 236.3, in scenario A).
    const itemHeaderCharX: Record<string, number[]> = {
      '#': [36.375],
      'Item name': [58.559, 60.841, 63.586, 68.035, 75.393, 77.474, 82.108, 86.672, 94.030],
      'HSN/ SAC': [198.059, 204.044, 209.026, 215.012, 218.474, 220.555, 225.537, 230.966],
      'Quantity': [281.437, 287.210, 291.836, 296.400, 301.033, 303.778, 305.819, 308.564],
      'Unit': [354.738, 360.179, 364.813, 366.853],
      'Price/ Unit (₹)': [381.375, 386.668, 389.512, 391.552, 395.944, 400.393, 403.855, 405.936, 411.377, 416.011, 418.051, 420.796, 422.877, 425.749, 430.088],
      'GST(₹)': [470.590, 476.305, 481.287, 486.294, 489.166, 493.504],
      'Amount(₹)': [520.113, 525.587, 532.945, 537.730, 542.356, 546.989, 549.734, 552.606, 556.945],
    };
    for (const col of cols) {
      const charX = itemHeaderCharX[col.key];
      if (charX) {
        drawGlyphString(col.key, charX, y + 11.2, 8.4);
      } else {
        // Left/right text insets split by alignment (was a flat +3/-6 for
        // both) — re-measured 2026-08-26 via pdftotext against scenario-A:
        // left-aligned headers ("Item name"/"HSN/ SAC") sat ~1.2-1.8pt too
        // far LEFT (need MORE left padding), right-aligned ones (Quantity/
        // Price/GST/Amount) sat ~1.0-2.5pt too far RIGHT (need MORE right
        // padding) — a first pass here had both directions backwards, made
        // worse, caught by re-measuring after. The column dividers themselves
        // are already correct (verified separately), so this only touches
        // text padding within each cell, not the boundaries. Kept as a
        // fallback for any column key not in the lookup above (there
        // shouldn't be any today, but a future column addition would fall
        // through here rather than crash).
        const leftPad = col.numeric ? 3 : 4.3;
        const rightPad = col.numeric ? 4 : 3;
        boldText(col.key, colX + leftPad, y + 4, { width: col.width - leftPad - rightPad, height: 9, ellipsis: true, align: col.numeric ? 'right' : 'left' });
      }
      colX += col.width;
    }
    y += headerRowH;

    let totalQty = 0;
    let totalAmount = 0;
    let totalGst = 0;

    const agentNote = sanitize(data.agentName);
    // 27.7 (was 28) — re-measured 2026-08-21 against the reference's own
    // rect() column-divider height for this row.
    const itemRowH = 27.7; // two lines: product name + "(agent)" note, and GST amount + rate%.

    // fontSize 8.4 (was 8) + ITEM_ROW_HSCALE 1.08 on every value — root-caused
    // 2026-08-31 via pikepdf content-stream Tf/cm extraction against the
    // reference: every dynamic value in this row (item name, qty, unit,
    // price, GST amount+rate, line amount) renders at effective size
    // 11.2×0.75=8.4 in the reference — the SAME uniform size used everywhere
    // else in this document (headers, Bill To) — not 8. The second line
    // (agent note / GST rate%) was ALSO wrongly shrunk to fontSize 7: a
    // pixel-zoomed crop of the reference (₹1,449.15 / (18.0%) cell) shows
    // both lines are the SAME size, not a smaller second line. Fixing the
    // size alone still leaves our regular-weight SegoeUI.ttf ~4-14%
    // narrower than the reference's font at identical nominal size (the
    // same "our TTF renders narrower" issue already fixed for Body-Bold
    // elsewhere via BOLD_HSCALE) — 1.08 is the measured average correction
    // across item-name/qty/unit/price/GST/amount (individual per-field
    // ratios ranged 1.035-1.143. A single averaged 1.08 (first pass) still
    // left up to ~6% residual per field, visible in an overlay comparison
    // and reported as "product name and all these numbers still not good" —
    // switched to per-field measured values below instead of one shared
    // constant.
    const HS_NAME = 1.06;
    const HS_QTY = 1.04;
    const HS_UNIT = 1.04;
    const HS_PRICE = 1.14;
    const HS_GST = 1.09;
    const HS_RATE = 1.035;
    const HS_AMOUNT = 1.09;
    doc.font('Body').fontSize(8.4);
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      const gstAmt = item.cgstAmount + item.sgstAmount + item.igstAmount;
      ensureSpace(itemRowH);

      doc.rect(tableX, y, CONTENT_WIDTH, itemRowH).stroke(BORDER);
      drawItemRowDividers(y, itemRowH);
      colX = tableX;

      // All y-offsets in this row (#, item name/note, HSN/qty/unit/price/
      // amount, GST amt/rate) carry a uniform -2.0 vs. the previous pass —
      // root-caused 2026-09-03, same bug/fix as Bank Details and Bill To/
      // Invoice Details above: these were calibrated against pdftotext's
      // yMin (font-ascent-based, not real ink). Measured against actual
      // rendered pixels (pdftoppm 300dpi, ink-top of each value's own first
      // character): item name +2.4, #/qty/unit/price +1.68-1.92, GST amount
      // +2.16, GST rate +1.92 — all in the same ~1.7-2.4pt band as the
      // other sections' Body/Body-Bold-at-8.4pt offset, so the same uniform
      // -2.0 applied here rather than chasing sub-0.5pt per-field noise.
      doc.fillColor(BORDER).font('Body').fontSize(8.4);
      doc.text(String(i + 1), colX + 3, y + 7, { width: cols[0].width - 6, height: 10, ellipsis: true });
      colX += cols[0].width;

      // Item name + agent-name note line.
      // y+3.37 (was +5), note y+13.87 (was +16) — re-measured 2026-08-31 via
      // pdftotext bbox against the reference (Sale_1263): reference item-name
      // line1 sits at row_y+3.37 exactly (256.17 - 252.8), note/line2 at
      // row_y+13.87 (266.67 - 252.8), not +5/+16 — those were guesses that
      // sat 1.63pt/2.13pt too low, reported as item-name text visually
      // crossing into the row below when overlaid against the reference.
      boldText(sanitize(item.productName), colX + 3, y + 1.37, { width: cols[1].width - 6, height: 12, ellipsis: true }, HS_NAME);
      if (agentNote) {
        boldText(`(${agentNote})`, colX + 3, y + 11.87, { width: cols[1].width - 6, height: 11, ellipsis: true }, HS_NAME);
      }
      colX += cols[1].width;

      boldText(sanitize(item.hsnSac) || '-', colX + 3, y + 7, { width: cols[2].width - 6, height: 12, ellipsis: true }, HS_NAME);
      colX += cols[2].width;
      boldText(String(item.quantity), colX + 3, y + 7, { width: cols[3].width - 6, height: 12, ellipsis: true, align: 'right' }, HS_QTY);
      colX += cols[3].width;
      boldText(sanitize(item.unit) || 'PCS', colX + 3, y + 7, { width: cols[4].width - 6, height: 12, ellipsis: true, align: 'right' }, HS_UNIT);
      colX += cols[4].width;
      boldText(rupee(item.unitPrice), colX + 3, y + 7, { width: cols[5].width - 6, height: 12, ellipsis: true, align: 'right' }, HS_PRICE);
      colX += cols[5].width;

      // GST(₹) — amount on top, rate% below, both right-aligned, same size
      // (see comment above — the reference does not shrink this line).
      // y+4.12 (was +5), rate y+13.87 (was +16) — same re-measurement as the
      // item-name/note line above: reference GST-amount line1 sits at
      // row_y+4.12 (256.92-252.8), rate line2 at row_y+13.87 (266.67-252.8).
      boldText(rupee(gstAmt), colX + 3, y + 2.12, { width: cols[6].width - 6, height: 12, ellipsis: true, align: 'right' }, HS_GST);
      boldText(`(${Number(item.gstRatePct).toFixed(1)}%)`, colX + 3, y + 11.87, { width: cols[6].width - 6, height: 11, ellipsis: true, align: 'right' }, HS_RATE);
      colX += cols[6].width;

      boldText(rupee(item.lineTotal), colX + 3, y + 7, { width: cols[7].width - 6, height: 12, ellipsis: true, align: 'right' }, HS_AMOUNT);

      y += itemRowH;

      totalQty += item.quantity;
      totalAmount += item.lineTotal;
      totalGst += gstAmt;
    }

    // 15.7 (was 16) — re-measured 2026-08-21 against the reference's own
    // rect() column-divider height for this row.
    const totalRowH = 15.7;
    ensureSpace(totalRowH);
    doc.rect(tableX, y, CONTENT_WIDTH, totalRowH).fillAndStroke('#f8f8f8', BORDER);
    drawItemRowDividers(y, totalRowH);
    // fontSize 8.4 (was 6.8) — same content-stream measurement as the data
    // rows above found this row's values ALSO render at 8.4 in the
    // reference, not a shrunk 6.8. hscale 1.0 (was the implicit default
    // BOLD_HSCALE=1.08, never overridden here) — re-measured 2026-08-31:
    // unlike the data rows' regular-weight text, this row's Body-Bold text
    // at the corrected 8.4 size already lands within 1-2.5% of the
    // reference with NO extra hscale (BOLD_HSCALE was tuned for much larger
    // bold elements elsewhere and overshoots here).
    doc.fillColor(BORDER).font('Body-Bold').fontSize(8.4);
    // 'Total' starts past the '#' column (tableX+cols[0].width+3), not at the
    // very left edge — reference measured x≈58.56 vs tableX+3=38, a ~20.5pt
    // gap matching exactly one '#' column width (21pt).
    // Exact reference glyph positions — same fix as the header row above.
    // y+10.5 (reference baseline 291.00 minus this row's y, 280.5, in
    // scenario A).
    drawGlyphString('Total', [58.559, 63.159, 67.944, 70.689, 75.253], y + 10.5, 8.4);
    // hscale 0.976 (was 1.0) — this cell alone measured ~2.4% wider than the
    // reference even though the GST/Amount cells beside it matched at 1.0.
    //
    // y+1 (was y+3) — root-caused 2026-09-03, same bug/fix as everywhere
    // else in this file: these three values sat ~1.92pt too low. The
    // earlier "y+3 is already correct" measurement was a false negative —
    // it used a naive first-dark-row scan that caught this row's own top
    // border stroke (a near-full-width dark line right at the row's start)
    // instead of the actual digit ink, since the border in both PDFs
    // happened to sit within ~0.24pt of each other and masked the real
    // 1.92pt text offset underneath. Re-measured with a scan that explicitly
    // skips near-full-width rows (i.e. border strokes) before looking for
    // real glyph ink; all three cells (qty/GST/amount) agreed on +1.92pt.
    boldText(
      String(totalQty),
      tableX + cols[0].width + cols[1].width + cols[2].width + 3,
      y + 1,
      { width: cols[3].width - 6, height: 12, ellipsis: true, align: 'right' },
      0.976,
    );
    boldText(
      rupee(totalGst),
      tableX + cols[0].width + cols[1].width + cols[2].width + cols[3].width + cols[4].width + cols[5].width + 3,
      y + 1,
      { width: cols[6].width - 6, height: 12, ellipsis: true, align: 'right' },
      1.0,
    );
    boldText(
      rupee(totalAmount),
      tableX + CONTENT_WIDTH - cols[7].width + 3,
      y + 1,
      { width: cols[7].width - 6, height: 12, ellipsis: true, align: 'right' },
      1.0,
    );
    y += totalRowH;
    // 2.69 (was 2.92) — re-tuned after fixing headerRowH/itemRowH/totalRowH
    // above (net +0.2pt shift to this row's bottom), so rightBoxTop/"Sub
    // Total" still lands on its already-verified target (298.92).
    y += 2.69;

    // ── 5. Tax Summary ───────────────────────────────────────────────────
    ensureSpace(18);
    // The right-side summary box starts at the SAME y as this label (not
    // after it) — in the reference, "Sub Total" sits almost exactly level
    // with "Tax Summary:", not with the tax table itself, which starts
    // ~12pt lower once the label's own line height is accounted for.
    const rightBoxTop = y;
    // The top of this whole "Tax Summary + right-side box" group — same
    // value the left/right vertical edges below both start from, so the
    // group's own border doesn't touch the item table above it (matches
    // the reference: this zone is its own separate bordered group, not
    // connected to the item table via a continuous outer frame).
    const group2Top = y - 2.69;
    // fontSize 8.92 (was 7.3) + local hscale 0.9172 (was shared BOLD_HSCALE
    // 1.08) — re-measured 2026-08-27 against real rendered pixels, same fix
    // as "Invoice"/"RAREPRINT.IN" above (this was the 3rd of the original 3
    // elements the flawed pdftotext-based BOLD_HSCALE was derived from):
    // real height measured 6.48pt vs reference's 7.92pt. x nudged
    // tableX+2.16 (was tableX) — text itself was starting 2.16pt left of
    // the reference's actual position (the border-line fix added earlier
    // only touched the group's border, never this label's own inset).
    // Exact reference glyph positions — same fix as the other section
    // headers. y+7.86 (reference baseline 306.75 minus this row's y, 298.89,
    // in scenario A).
    drawGlyphString(
      'Tax Summary:',
      [36.891, 41.434, 45.998, 50.160, 52.242, 57.223, 61.849, 69.207, 76.565, 81.129, 84.046, 88.016],
      y + 7.86,
      8.4,
    );
    // Vertical separator between the tax table and the right-side summary
    // box, extended UP to also cover this label row (previously only drawn
    // starting at taxTableTop below, so it visibly stopped short of "Tax
    // Summary:"/"Sub Total" — the same title-row/vertical-separator issue
    // as Bill To and Bank Details, just via a different code path here
    // since this side has no rect() of its own to draw it accidentally).
    // Hardcoded 370.5 here (not the `leftWidth` const) since that const
    // isn't declared until after the isInterState branch just below — kept
    // in sync with it manually; see the `const leftWidth = 370.5` comment
    // a few lines down for the measurement this value comes from.
    // Starts at group2Top (the item table's own Total row bottom border,
    // before the small gap this section's rightBoxTop adds) rather than at
    // y itself, so the top of this vertical line actually touches the
    // horizontal line above it instead of floating 2.69pt below it.
    // x = tableX + 369.75 — see the `leftWidth` comment below; kept in sync
    // with it manually since that const isn't declared yet here. THIS was
    // the actual cause of "the separator got to a bit right nudge" still
    // being reported after the leftWidth 370.5->369.0 pass: this specific
    // line is hardcoded (declared before `leftWidth` exists) and was never
    // updated when leftWidth moved, so it silently stayed at the old value
    // while every other use of leftWidth in this section moved correctly.
    doc.moveTo(tableX + 369.75, group2Top).lineTo(tableX + 369.75, y + 13.88).stroke(BORDER);
    // Left edge of this same label row — the right-side line above has
    // always existed, but this row (group2Top to taxTableTop) never had a
    // LEFT border of its own. It used to be covered incidentally by the old
    // continuous outer box; removing that box (2026-08-21, to split the
    // document into separate groups per the reference) left this one row
    // with no left edge at all, reported as "the vertical line to the left
    // of tax summary is missing".
    doc.moveTo(tableX, group2Top).lineTo(tableX, y + 13.88).stroke(BORDER);
    // 13.88 (was 13.78) — re-tuned along with the gap above so taxTableTop
    // (the two-tier header's actual top) still lands on its verified target
    // (312.8).
    y += 13.88;

    const isInterState = data.gstTreatment === 'INTER_STATE' || data.gstTreatment === 'EXPORT';
    // leftWidth was previously CONTENT_WIDTH*0.58 (a guess) — the reference
    // tax table is actually ~70% of content width (measured: its rightmost
    // column data — "1,449.15" in the TOTAL row — ends at x≈400.3, and
    // "Sub Total" on the right starts at x≈406.3, both against tableX=35).
    // The 58% guess put the whole right-side summary box ~55pt too far
    // left, consistently, across every row — confirmed by diffing this
    // render's exact text coordinates against the reference's.
    // 369.75 (was 369.0, before that 370.5) — re-measured 2026-08-26 via a
    // full pikepdf content-stream extraction of the reference's actual thin
    // rects (not eyeballed): the reference's own tax-table rect is
    // x=[33.0,403.5], w=370.5, but its stroke fills are drawn as 0.75pt-wide
    // rects with the visible line CENTERED partway across that width —
    // e.g. its right border is the rect x=[402.75,403.5], center=403.125.
    // PDFKit's stroke() also centers a line on the coordinate given, so the
    // correct target for `tableX + leftWidth` is that center, 403.125, not
    // the rect's left edge (402.7) — the previous pass matched the edge,
    // not the center, which is what still read as "nudged" after that fix.
    // leftWidth = 403.125 - tableX(33.7) = 369.425, rounded to 369.75 to
    // match the sum of the individually re-measured column widths below
    // (hsnW+taxableW+2*pairW+totalTaxW) exactly rather than introducing a
    // separate rounding source.
    const leftWidth = 369.75;
    // 2.83 (was 3.58) — reduced by the same 0.75 leftWidth increased by, so
    // rightX (where "Sub Total" etc. start, verified via pdftotext against
    // the reference at x=406.28) stays exactly where it already was.
    const GAP = 2.83;
    // RIGHT_PAD keeps right-aligned values (Sub Total / Total / Balance /
    // etc.) from landing flush against the outer page border — without it,
    // rightX + rightWidth lands exactly on tableX + CONTENT_WIDTH, so
    // align:'right' text has zero clearance and visibly touches the border.
    // 2.92 (was 6) — re-measured 2026-08-21: every right-aligned value in
    // this box (Sub Total, Total, Received, Balance, Previous/Current
    // Balance) was landing a consistent 3.08pt short of the reference's
    // actual xMax (559.88 vs 556.80), i.e. too far from the border.
    const RIGHT_PAD = 2.92;
    const rightWidth = CONTENT_WIDTH - leftWidth - GAP - RIGHT_PAD;
    const rightX = tableX + leftWidth + GAP;

    // Group items by HSN/SAC for the tax summary table.
    const groups = new Map<string, { taxable: number; cgst: number; sgst: number; igst: number; total: number }>();
    for (const item of data.items) {
      const key = sanitize(item.hsnSac) || '-';
      const g = groups.get(key) ?? { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
      g.taxable += item.taxableAmount;
      g.cgst += item.cgstAmount;
      g.sgst += item.sgstAmount;
      g.igst += item.igstAmount;
      g.total += item.cgstAmount + item.sgstAmount + item.igstAmount;
      groups.set(key, g);
    }

    // Guard against the tax table overflowing off the bottom of the page —
    // it has no per-row pagination of its own (unlike the line-items table
    // above), so a rough upfront estimate + single page break is enough to
    // stop content being silently drawn past the page boundary and lost.
    ensureSpace(32 + (groups.size + 1) * 16 + 20);

    const taxTableTop = y;
    // Real two-tier spanning header (HSN/SAC, Taxable amount, Total Tax are
    // vertically merged across both header rows; CGST/SGST — or IGST for
    // inter-state — each span 2 sub-columns horizontally in row 1, with
    // Rate(%)/Amt(₹) sub-headers in row 2). Both header rows measure ~16pt
    // each in the reference (a much taller 2-tier header than a flattened
    // single-row one would need). See docs/Invoice_PDF_Replication_Spec.md §5.
    // 15.35 each (was 16) — re-measured 2026-08-21: the reference's own
    // merged HSN/SAC cell rect() is 30.7pt tall total (312.8 to 343.5), not
    // 32.
    const taxRow1H = 15.35;
    const taxRow2H = 15.35;
    const taxHeaderH = taxRow1H + taxRow2H;
    // 15.7 (was 16) — matches the reference's own tax data/TOTAL row rect()
    // height exactly.
    const taxRowH = 15.7;

    // Column widths measured directly from the reference's data-row cell
    // edges (right-aligned cells' xMax + a ~2pt inset = the true column
    // boundary), not the earlier fractional guesses of leftWidth (0.14/0.2/
    // 0.2 splits) — those were off by 3-6.4pt per column, which compounded
    // rightward across CGST -> SGST -> Total Tax(₹) into a ~7.6pt drift by
    // the last column. hsnW/taxableW/totalTaxW are shared between the
    // INTRA_STATE (CGST+SGST) and INTER_STATE (IGST) layouts — only the
    // middle span differs (one wide IGST column vs two CGST/SGST columns of
    // half the width), which falls out naturally from the same leftWidth.
    // Re-measured 2026-08-21 from the reference's actual merged-cell rect()
    // widths (HSN/SAC and Taxable-amount cells span both header rows —
    // their real drawn width, not a fractional-split guess).
    const hsnW = 59.2;
    const taxableW = 70.5;
    // 80.25 (was 78.7, before that 80.2) — re-measured 2026-08-26 via
    // pikepdf: the reference's "Total Tax(₹)" cell rect is
    // x=[323.25,403.50], w=80.25 exactly. Cross-checked against pdftotext's
    // text bbox for the "Total Tax(₹)" header label itself, which centers
    // at x≈363.27 in the reference — with hsnW+taxableW+2*pairW=289.5
    // before this column starts, this width centers that label at 363.325,
    // a 0.05pt match.
    const totalTaxW = 80.25;
    // Rate(%)/Amt(₹) sub-column split within each CGST/SGST pair — measured
    // 41.77:38.21 (~52.2%:47.8%). The previous 0.44/0.56 had this backwards
    // (Amt wider than Rate), which it isn't in the reference.
    const RATE_FRACTION = 0.522;
    let spanGroups: { label: string; width: number; subWidths: [number, number] }[];
    if (isInterState) {
      const igstW = leftWidth - hsnW - taxableW - totalTaxW;
      spanGroups = [{ label: 'IGST', width: igstW, subWidths: [igstW * RATE_FRACTION, igstW * (1 - RATE_FRACTION)] }];
    } else {
      const pairW = (leftWidth - hsnW - taxableW - totalTaxW) / 2;
      spanGroups = [
        { label: 'CGST', width: pairW, subWidths: [pairW * RATE_FRACTION, pairW * (1 - RATE_FRACTION)] },
        { label: 'SGST', width: pairW, subWidths: [pairW * RATE_FRACTION, pairW * (1 - RATE_FRACTION)] },
      ];
    }

    // Outer header rect + grey fill.
    doc.rect(tableX, taxTableTop, leftWidth, taxHeaderH).fillAndStroke(GREY, BORDER);
    doc.fillColor(BORDER).font('Body-Bold').fontSize(6.3);

    // Exact reference glyph positions for the tax table headers — same
    // outline-fidelity fix as the other section headers (drawGlyphString,
    // HEADER_GLYPH_SCALE=8.4), 2026-08-29. All y offsets below are relative
    // to taxTableTop (reference baselines minus this table's taxTableTop,
    // 312.77, in scenario A). Only covers the INTRA_STATE (CGST/SGST) case,
    // which is what the reference invoice this was measured against uses —
    // IGST (inter-state) falls through to the original boldText rendering
    // below since there's no reference ground truth for that layout.
    let hx = tableX;
    // HSN/SAC — merged, vertically centered.
    drawGlyphString('HSN/ SAC', [44.168, 50.154, 55.136, 61.121, 64.583, 66.665, 71.646, 77.075], taxTableTop + 17.98, 8.4);
    hx += hsnW;
    doc.moveTo(hx, taxTableTop).lineTo(hx, taxTableTop + taxHeaderH).stroke(BORDER);

    // Taxable amount (₹) — merged, two lines, vertically centered.
    drawGlyphString('Taxable amount', [98.414, 102.957, 107.521, 111.684, 116.248, 120.959, 123.000, 127.449, 129.530, 134.094, 141.452, 146.238, 150.863, 155.497], taxTableTop + 12.73, 8.4);
    drawGlyphString('(₹)', [123.270, 126.142, 130.480], taxTableTop + 22.48, 8.4);
    hx += taxableW;
    doc.moveTo(hx, taxTableTop).lineTo(hx, taxTableTop + taxHeaderH).stroke(BORDER);

    // CGST/SGST or IGST spanning groups.
    const groupCharX: Record<string, { label: number[]; rate: number[]; amt: number[] }> = {
      CGST: { label: [192.715, 198.176, 203.891, 208.873], rate: [168.727, 173.897, 178.461, 181.206, 185.655, 187.737, 190.609, 196.754], amt: [210.293, 215.767, 223.125, 225.870, 227.951, 230.823, 235.162] },
      SGST: { label: [272.930, 277.912, 283.627, 288.609], rate: [248.695, 253.866, 258.430, 261.175, 265.624, 267.705, 270.577, 276.723], amt: [290.262, 295.735, 303.093, 305.838, 307.920, 310.792, 315.130] },
    };
    for (const group of spanGroups) {
      const gcx = groupCharX[group.label];
      if (gcx) {
        drawGlyphString(group.label, gcx.label, taxTableTop + 9.73, 8.4);
        drawGlyphString('Rate (%)', gcx.rate, taxTableTop + 25.48, 8.4);
        drawGlyphString('Amt (₹)', gcx.amt, taxTableTop + 25.48, 8.4);
      } else {
        doc.font('Body-Bold').fontSize(6.5);
        // +2.65 (was +3) — re-measured 2026-08-26: landed 0.35pt lower than
        // the reference.
        boldText(group.label, hx, taxTableTop + 2.65, { width: group.width, align: 'center' });
        doc.font('Body-Bold').fontSize(5.5);
        // Sub-headers. +3.05 (was +4) — re-measured 2026-08-26: landed
        // 0.95pt lower than the reference.
        boldText('Rate (%)', hx + 1, taxTableTop + taxRow1H + 3.05, { width: group.subWidths[0] - 2, align: 'center' });
        boldText('Amt (₹)', hx + group.subWidths[0] + 1, taxTableTop + taxRow1H + 3.05, { width: group.subWidths[1] - 2, align: 'center' });
      }
      // Horizontal divider under the group label, only within this group's width.
      doc.moveTo(hx, taxTableTop + taxRow1H).lineTo(hx + group.width, taxTableTop + taxRow1H).stroke(BORDER);
      // Vertical divider between the group's two sub-columns (row 2 only).
      doc.moveTo(hx + group.subWidths[0], taxTableTop + taxRow1H).lineTo(hx + group.subWidths[0], taxTableTop + taxHeaderH).stroke(BORDER);
      hx += group.width;
      doc.moveTo(hx, taxTableTop).lineTo(hx, taxTableTop + taxHeaderH).stroke(BORDER);
    }

    // Total Tax(₹) — merged, vertically centered. Shares HSN/SAC's baseline
    // offset above (both are the two-tier merged-cell headers).
    drawGlyphString('Total Tax(₹)', [341.238, 345.839, 350.624, 353.369, 357.933, 359.973, 361.891, 366.434, 370.998, 375.160, 378.032, 382.371], taxTableTop + 17.98, 8.4);

    // Column x-offsets for data rows, matching the header widths exactly.
    const dataColWidths = [hsnW, taxableW, ...spanGroups.flatMap((g) => g.subWidths), totalTaxW];

    // Vertical column-separator lines for a data/total row — the header rows
    // draw their own dividers via the moveTo/lineTo calls above, but the
    // data and TOTAL rows previously only got the outer rect() border, so
    // every internal column line (Taxable amount | Rate | Amt | Rate | Amt |
    // Total Tax) silently disappeared below the header. Reference has these
    // dividers running the full height of the table.
    function drawTaxRowDividers(rowY: number, rowH: number) {
      let dx = tableX;
      for (let c = 0; c < dataColWidths.length - 1; c++) {
        dx += dataColWidths[c];
        doc.moveTo(dx, rowY).lineTo(dx, rowY + rowH).stroke(BORDER);
      }
    }

    // NOTE: the reference's own rect() extraction shows its tax data rows
    // starting ~0.8pt below the header's bottom edge (343.5 -> 344.3)
    // rather than flush against it. Left flush here deliberately — every
    // other adjacent-box boundary in this document (item table rows, Terms/
    // Bank Details) shares a single border line by design, and introducing
    // a real gap here would look like a regression of that same fix
    // elsewhere. Treating the reference's 0.8pt as rendering noise, not an
    // intentional gap, unless a visual check says otherwise.
    // fontSize 8.4 (was 7) — same content-stream measurement as the item
    // table found this row ALSO renders at 8.4 in the reference, not 7.
    // money() not rupee() for the amount cells (was rupee(), adding a "₹"
    // this table never shows) — a pixel crop of the reference's Tax Summary
    // table (Taxable amount/CGST/SGST/Total Tax columns) confirms plain
    // "8,050.85"/"724.58" with no rupee sign, unlike the item table and
    // summary box which do show ₹. hscale 1.06 — measured after both fixes
    // above against the reference (regular-weight text, same residual
    // narrowness as the item table's regular-weight fields).
    let ty = taxTableTop + taxHeaderH;
    const TAX_ROW_HSCALE = 1.06;
    doc.font('Body').fontSize(8.4);
    let grandTaxable = 0;
    let grandCgst = 0;
    let grandSgst = 0;
    let grandIgst = 0;
    let grandTax = 0;
    for (const [hsn, g] of groups) {
      doc.rect(tableX, ty, leftWidth, taxRowH).stroke(BORDER);
      drawTaxRowDividers(ty, taxRowH);
      let tx = tableX;
      const taxableAmt = g.taxable;
      const cells: string[] = [hsn, money(taxableAmt)];
      if (isInterState) {
        const igstRate = taxableAmt > 0 ? (g.igst / taxableAmt) * 100 : 0;
        cells.push(`${igstRate.toFixed(1)}`, money(g.igst));
      } else {
        const cgstRate = taxableAmt > 0 ? (g.cgst / taxableAmt) * 100 : 0;
        const sgstRate = taxableAmt > 0 ? (g.sgst / taxableAmt) * 100 : 0;
        cells.push(`${cgstRate.toFixed(1)}`, money(g.cgst), `${sgstRate.toFixed(1)}`, money(g.sgst));
      }
      cells.push(money(g.total));
      // ty+3.45 (was +4) — re-measured 2026-08-31 via pdftotext bbox against
      // the reference: data-row values sit at ty+3.45 (346.92-343.47), not
      // +4 (0.55pt too low, reported as "tax summary rows below header"
      // sitting low when overlaid against the reference).
      //
      // ty+1.45 (was ty+3.45) — root-caused 2026-09-03: this row's earlier
      // "already correct" check was a false negative from the same border-
      // stroke contamination as the item table's Total row (see that fix's
      // comment) — the row's own top border, near-full-width and dark,
      // landed within ~0.24pt in both PDFs and got picked up as "first ink"
      // instead of the real digits underneath, masking a genuine +2.16pt
      // offset. Re-measured with a scan that explicitly skips near-full-
      // width rows first; both this row and the TOTAL row below agreed on
      // +2.16pt.
      for (let c = 0; c < cells.length; c++) {
        boldText(cells[c], tx + 2, ty + 1.45, { width: dataColWidths[c] - 4, height: 12, ellipsis: true, align: c === 0 ? 'left' : 'right' }, TAX_ROW_HSCALE);
        tx += dataColWidths[c];
      }
      ty += taxRowH;
      grandTaxable += g.taxable;
      grandCgst += g.cgst;
      grandSgst += g.sgst;
      grandIgst += g.igst;
      grandTax += g.total;
    }
    doc.rect(tableX, ty, leftWidth, taxRowH).fillAndStroke('#f8f8f8', BORDER);
    drawTaxRowDividers(ty, taxRowH);
    // .fill('#f8f8f8') above also sets the *current* fill color (PDFKit
    // shares one fillColor state between shapes and text) — without
    // resetting it back to BORDER here, every cell in this row was being
    // drawn in near-white text on its own near-white background, i.e.
    // invisible. The item table's own Total row already does this reset;
    // this one didn't, which is what looked like "missing" row content.
    // fontSize 8.4 (was 6.8) — same fix as the data rows above.
    doc.fillColor(BORDER).font('Body-Bold').fontSize(8.4);
    {
      let tx = tableX;
      const totalCells = isInterState
        ? ['TOTAL', money(grandTaxable), '', money(grandIgst), money(grandTax)]
        : ['TOTAL', money(grandTaxable), '', money(grandCgst), '', money(grandSgst), money(grandTax)];
      for (let c = 0; c < totalCells.length; c++) {
        // Unlike the regular per-item data rows (HSN/SAC left-aligned), the
        // reference right-aligns the 'TOTAL' word itself in this row — its
        // measured x-end (≈90.35) sits at the HSN column's right edge, not
        // its left edge.
        // ty+3.5 (was +4) — re-measured 2026-08-31 against the reference:
        // this TOTAL row (including the "TOTAL" label itself) sits at
        // ty+3.5 (362.67-359.17), not +4. hscale 1.0 (was implicit default
        // BOLD_HSCALE=1.08) — bold text at the corrected 8.4 size needs no
        // extra hscale, same finding as the item table's own Total row.
        //
        // ty+1.5 (was ty+3.5) — root-caused 2026-09-03, same border-stroke
        // false-negative fix as the data row above: real offset measured
        // +2.16pt once the row's own top border was excluded from the scan.
        boldText(totalCells[c], tx + 2, ty + 1.5, { width: dataColWidths[c] - 4, height: 12, ellipsis: true, align: 'right' }, 1.0);
        tx += dataColWidths[c];
      }
    }
    ty += taxRowH;

    // Right-side summary box (no borders, "Label : Value" rows, value
    // right-aligned). Row pitch (15.75pt for the first three, 15pt for the
    // last three) matches the reference's measured line spacing exactly —
    // it isn't a single round constant there either.
    // labelW=93 matches the reference's measured colon position (x≈499.8,
    // rightX≈406.3) — the earlier leftWidth fix changed rightX enough that
    // the old labelW=110 (sized for the old, wrong rightX) would have left
    // too little room for the value column against the new, wider rightWidth.
    const labelW = 93;
    // Exact reference glyph positions for this box's fixed labels (Sub
    // Total / Total / Received / Balance / Previous Balance / Current
    // Balance) — same technique as every other section header, extracted
    // 2026-08-29 via pikepdf against Sale_1263_23-06-2026.pdf. "Total" is
    // set in /F5 (same bold Type3 font as the other headers, reuses
    // INVOICE_GLYPHS); the other five + the shared ":" are set in /F8, a
    // different Type3 font under the same glyph names — confirmed by
    // reading each row's actual Tf operand, not assumed from how the row
    // looks. Colon is included at the end of `chars`/`x` (its own real
    // measured x=499.781) rather than drawn separately, matching how
    // "Invoice Amount In Words :" already handles its own colon above.
    const summaryLabelGlyphs: Record<string, { chars: string; x: number[]; font: 'F5' | 'F8' }> = {
      'Sub Total': { chars: 'Sub Total:', x: [406.277, 411.259, 415.885, 420.596, 422.513, 427.114, 431.899, 434.644, 439.208, 499.781], font: 'F8' },
      Total: { chars: 'Total:', x: [406.277, 410.878, 415.663, 418.408, 422.972, 499.781], font: 'F5' },
      Received: { chars: 'Received:', x: [406.277, 411.448, 415.897, 420.289, 424.738, 426.779, 430.79, 435.239, 499.781], font: 'F8' },
      Balance: { chars: 'Balance:', x: [406.277, 411.505, 416.069, 418.109, 422.673, 427.307, 431.699, 499.781], font: 'F8' },
      'Previous Balance': { chars: 'Previous Balance:', x: [406.277, 411.571, 414.336, 418.732, 422.796, 424.837, 429.622, 434.247, 438.578, 440.659, 445.887, 450.451, 452.491, 457.055, 461.689, 466.081, 499.781], font: 'F8' },
      'Current Balance': { chars: 'Current Balance:', x: [406.277, 411.739, 416.364, 419.207, 421.973, 426.422, 431.056, 433.801, 435.882, 441.11, 445.674, 447.714, 452.278, 456.912, 461.304, 499.781], font: 'F8' },
    };
    function summaryRow(label: string, value: string, opts?: { bold?: boolean; size?: number }) {
      // size 8.4 (was 8.5 non-bold / 8.5*0.86=7.31 bold) — pikepdf
      // content-stream Tf/cm extraction (2026-08-31) found every row in this
      // box, bold and non-bold, renders at 8.4 in the reference — the same
      // uniform size as the rest of the document, not a shrunk 7.31 for
      // Total/Balance.
      const size = opts?.size ?? 8.4;
      // No offset (was ry-2.16) — re-measured 2026-08-31 via pdftotext bbox
      // against the reference: the old -2.16 overcorrected, landing Total/
      // Balance's VALUE text 2.19pt too HIGH (312.48/384.48 vs the
      // reference's actual 314.67/386.67 — the opposite direction from what
      // the -2.16 was meant to fix). Non-bold rows (Sub Total/Received/
      // Previous Balance/Current Balance, plain doc.text at `ry` with no
      // offset) already land within 0.03pt of the reference, so plain `ry`
      // is correct for the value here too. (Doesn't affect the glyphSpec
      // label branch below, which draws its own baseline directly.)
      //
      // VALUE_Y_FIX -2.0 added on top of the above — root-caused 2026-09-03,
      // same bug/fix as every other section: `ry` (like the other sections'
      // y-offsets) was calibrated against pdftotext's yMin, not real ink.
      // Measured against actual rendered pixels (pdftoppm 300dpi, using a
      // window that starts safely below each row's own divider line —
      // Total's and Received's naive ink-top reading was contaminated by
      // the divider stroke immediately above them, masking the real error
      // until the window was moved past it): every value row in this box
      // (Sub Total through Current Balance) sits ~1.9-2.2pt too low, the
      // same magnitude as Bank Details/Bill To/item row. Only the VALUE
      // moves — glyphSpec labels (drawGlyphString) are unaffected, same as
      // everywhere else.
      const VALUE_Y_FIX = -2.0;
      const boldY = ry + VALUE_Y_FIX;
      doc.font(opts?.bold ? 'Body-Bold' : 'Body').fontSize(size).fillColor(BORDER);
      const glyphSpec = summaryLabelGlyphs[label];
      if (glyphSpec) {
        // ry+7.11 is the same constant already established for "Invoice
        // Amount In Words :" a few lines below — verified against every row
        // in this box (2026-08-29): the row pitch is fixed and both this
        // file's `ry` cursor and the reference's own y advance by the exact
        // same amount per row, so the offset from `ry` to the reference's
        // real baseline stays constant across all six rows.
        drawGlyphString(glyphSpec.chars, glyphSpec.x, ry + 7.11, 8.4, glyphSpec.font === 'F8' ? INVOICE_GLYPHS_F8 : INVOICE_GLYPHS);
      } else if (opts?.bold) {
        boldText(label, rightX, boldY, { width: labelW });
      } else {
        doc.text(label, rightX, ry, { width: labelW });
      }
      // Bold value hscale 1.0 (matches the item table's own Total row).
      // Non-bold value hscale 1.10 (was 1.0) — re-measured 2026-08-31: Sub
      // Total/Received/Previous/Current Balance (regular weight, unlike
      // Total/Balance) measured 9-14% narrower than the reference at
      // hscale 1.0, same residual-narrowness pattern as every other
      // regular-weight field in this document.
      if (opts?.bold) {
        boldText(value, rightX + labelW + 9, boldY, { width: rightWidth - labelW - 9, align: 'right' }, 1.0);
      } else {
        boldText(value, rightX + labelW + 9, ry + VALUE_Y_FIX, { width: rightWidth - labelW - 9, align: 'right' }, 1.10);
      }
      if (!glyphSpec) {
        doc.font(opts?.bold ? 'Body-Bold' : 'Body').fontSize(size);
        doc.text(':', rightX + labelW, opts?.bold ? boldY : ry, { width: 10 });
      }
    }

    // Divider lines between Sub Total / Total / Invoice Amount In Words —
    // measured from the reference's own thin divider rects (2026-08-21,
    // pikepdf content-stream extraction): each spans from the tax table's
    // right edge (tableX+leftWidth) to the outer border, not just under the
    // right-box's own text column, matching the reference's actual width.
    const rightDividerX0 = tableX + leftWidth;
    const rightDividerX1 = tableX + CONTENT_WIDTH;
    // rightDivider(ry) previously drew the line flush with the NEXT row's
    // text-top (ry itself), leaving zero clearance from the row above —
    // PDFKit's text "top" y already sits close to the cap-height, so at
    // that offset the line visually cut through the row above it (reported
    // as text rendering with a line "through" it). The reference's own
    // divider positions (311.3/327.0/342.8/368.3) sit a consistent 3.37pt
    // *before* the following row's text-top (314.67/330.42/346.17/371.67),
    // not flush with it — this offsets every call to match.
    function rightDivider(nextRowTextY: number) {
      doc.moveTo(rightDividerX0, nextRowTextY - 3.37).lineTo(rightDividerX1, nextRowTextY - 3.37).stroke(BORDER);
    }

    let ry = rightBoxTop;
    summaryRow('Sub Total', rupee(data.subtotal));
    ry += 15.75;
    rightDivider(ry);
    // size override removed (was 9.5) — content-stream measurement confirms
    // this row is 8.4 like every other row in this box, not enlarged.
    summaryRow('Total', rupee(data.totalAmount), { bold: true });
    ry += 15.75;
    rightDivider(ry);
    // Exact reference glyph positions — same fix as the other section
    // headers. ry+7.11 (reference baseline 337.50 minus this row's ry,
    // 330.39, in scenario A).
    drawGlyphString(
      'Invoice Amount In Words :',
      [406.277, 408.559, 413.193, 417.196, 421.981, 424.021, 428.413, 432.863, 434.944, 440.417, 447.776, 452.561, 457.186, 461.820, 464.565, 466.646, 468.928, 473.562, 475.643, 482.960, 487.746, 490.511, 495.243, 499.574, 501.655],
      ry + 7.11,
      8.4,
    );
    ry += 15.75;
    rightDivider(ry);
    // fontSize 8.4 (was 7.5) + hscale 1.02 (re-measured against the
    // reference after the size fix) — same content-stream measurement
    // and regular-weight residual-narrowness fix as the rest of this
    // document; height bumped to 28 (was 24) to keep 2-line wrapping safe
    // at the larger size (reported as "invoice amount in words value also
    // not good").
    doc.font('Body').fontSize(8.4);
    // y-2.0 — root-caused 2026-09-03, same bug/fix as the summaryRow values
    // above: measured against actual rendered pixels, this text sits
    // ~2.16pt too low at plain `ry`.
    //
    // lineGap: -2.16 — root-caused 2026-09-03, a SEPARATE bug from the
    // above: when this value wraps to 2 lines, the first line matched the
    // reference (-0.48pt) but the second line ("only") drifted +1.68pt
    // lower — measured line-to-line pitch was 17.76pt here vs the
    // reference's actual 15.6pt. This is PDFKit's own automatic wrapped-
    // line spacing (font-metric-derived, same "our font's metrics don't
    // match the reference's" family of bug as everywhere else in this file,
    // but affecting inter-line gap here instead of a single line's
    // position) being ~2.16pt too tall per line. `lineGap` is pure
    // PDFKit — passed straight through via boldText's opts spread.
    boldText(amountInWords(data.totalAmount), rightX, ry - 2.0, { width: rightWidth, height: 28, lineGap: -2.16 }, 1.02);
    ry += 25.5;
    // 4th right-box divider, below the amount-in-words text and before
    // Received — missed in the earlier pass (only 3 were added then); the
    // reference has one here too (pikepdf thin-rect extraction, y=368.3).
    rightDivider(ry);
    summaryRow('Received', rupee(data.paidAmount));
    ry += 15;
    // bold:true removed — root-caused 2026-09-03: the reference renders
    // this row in the SAME regular weight as Received/Previous Balance/
    // Current Balance, not bold like Total. Corroborated independently by
    // the label's own font: summaryLabelGlyphs['Balance'] is already tagged
    // 'F8' (the regular label font shared with Sub Total/Received/Previous
    // Balance/Current Balance), while Total's label alone uses 'F5' (the
    // bold label font) — the glyph-font data already said this, the value
    // weight just hadn't been matched to it. Confirmed visually: our render
    // showed Balance's value in visibly heavier strokes than the reference
    // at the same spot.
    summaryRow('Balance', rupee(data.balanceAmount));
    ry += 15;
    summaryRow('Previous Balance', rupee(data.previousBalance));
    ry += 15;
    summaryRow('Current Balance', rupee(data.currentBalance));
    // Deliberately NOT another "+= 15" here — every increment above moves
    // ry to the top of the row that follows, but there is no row after
    // Current Balance. Advancing by the same row pitch anyway (as an
    // earlier pass did) left ry pointing ~18pt past the last visible text,
    // which pushed Terms And Conditions down by that same amount — this
    // was the actual bug behind the growing gap the user found by
    // overlaying the two PDFs, not accumulated rounding drift. Reverted to
    // +10 (was briefly +10.52) — that +0.52 was meant only to nudge the
    // closing line's own drawn position, but since Terms/Bank Details below
    // are positioned off of `sectionBottom` (which `ry` feeds into), it also
    // dragged Terms And Conditions/Bank Details down by the same 0.52pt —
    // reported as "the one above bank details header is a bit down than the
    // original". See `closingLineY` below for the decoupled fix.
    ry += 10;

    // Reference invoice leaves the tax-summary table bordered down to the
    // same bottom edge as the right-side summary box, even though the table
    // itself has no more data rows there — an empty bordered cell, not a
    // gap. Reproduce it so the two blocks end flush.
    const sectionBottom = Math.max(ty, ry);
    // The closing line/rect are drawn lower than `sectionBottom` itself —
    // re-measured 2026-08-26 via pikepdf against a scenario-A render using
    // the reference's own data (invoice #1263/POSH PHARMA): rightBoxTop and
    // every row pitch through Current Balance already land within 0.03pt of
    // the reference (Current Balance text itself is correctly positioned,
    // confirming the row is fine), but this render's closing line landed at
    // y=427.16 vs the reference's actual y=429.0-429.75 (rect center
    // 429.375) — a 2.22pt shortfall, not the 0.52pt an earlier pass assumed
    // without being able to render/measure. Deliberately kept separate from
    // `sectionBottom`, which Terms And Conditions/Bank Details below anchor
    // to via `y = sectionBottom + 9.1` (independently verified exact,
    // 435.74 vs reference's 435.75) — nudging `sectionBottom` directly (as
    // a previous pass did) moved those rows too, which they shouldn't.
    const closingLineY = sectionBottom + 2.22;
    if (closingLineY > ty) {
      doc.rect(tableX, ty, leftWidth, closingLineY - ty).stroke(BORDER);
    }
    // The reference's closing line at this level runs the FULL content
    // width (528.7 wide, verified via its own re() rect), not just under
    // the tax table — it continues across the right-side summary box too,
    // closing that box off from the Terms row below. The rect above only
    // covers the tax table's own leftWidth; this line completes the rest.
    doc.moveTo(rightDividerX0, closingLineY).lineTo(tableX + CONTENT_WIDTH, closingLineY).stroke(BORDER);
    // Right-side outer edge for this whole "Tax Summary + right box" group
    // — the right box has no rect() of its own (text-only), so unlike every
    // other group in this document it has no right border at all unless
    // drawn explicitly. The reference has exactly this one line, spanning
    // only this group's own height (group2Top to closingLineY) — NOT the
    // whole document — which is part of why the reference reads as three
    // visually separate groups instead of one continuous frame.
    doc.moveTo(tableX + CONTENT_WIDTH, group2Top).lineTo(tableX + CONTENT_WIDTH, closingLineY).stroke(BORDER);

    // +9.10 (was +7.32) — re-measured directly against a fresh render: the
    // reference's Terms row top is y=435.80; after the item-Total→
    // rightBoxTop and taxTableTop gap changes above, this landed at 435.10,
    // so +0.70 more closes the remaining gap exactly.
    y = sectionBottom + 9.1;

    // ── 6. Terms And Conditions row (full width — no separate Description
    // column any more; the sales-agent note moved into the item table, §4) ──
    ensureSpace(33);
    const termsRowH = 33;
    // Grey fill drawn BEFORE the border stroke — same fix already applied to
    // Bank Details below (see its comment): fill() paints an opaque
    // rectangle, so stroking the border first let the fill immediately
    // overpaint the portion of the top border inside the label band,
    // leaving only a partial/anti-aliased sliver of it visible — reported
    // as "the line above terms and conditions is a bit thin". Terms was the
    // one row that still had the old (wrong) order.
    doc.rect(tableX, y, CONTENT_WIDTH, 17).fill(GREY);
    doc.rect(tableX, y, CONTENT_WIDTH, termsRowH).stroke(BORDER);
    // Divider between the "Terms And Conditions:" label and the value text
    // below it — the grey fill alone only implies a boundary via color; the
    // reference draws an actual line there (matches the same treatment
    // added to Bank Details/For Company below).
    // 15.7 (was 17) — re-measured 2026-08-21 against a real generated PDF vs
    // the reference: the reference's divider sits at y=451.5, 1.3pt above
    // where +17 (matching the grey fill's own height) was landing — the
    // fill height and the divider position aren't quite the same value in
    // the reference. 16.13 (was 15.7) — re-measured 2026-08-26 via pikepdf:
    // the reference's actual divider rect is y=[451.5,452.25] (center
    // 451.875), and this row's own top border lands at y=435.75 in the
    // reference, giving a true offset of 16.125.
    doc.moveTo(tableX, y + 16.13).lineTo(tableX + CONTENT_WIDTH, y + 16.13).stroke(BORDER);
    // Exact reference glyph positions — same fix as the other section
    // headers. y+10.51 (reference baseline 446.25 minus this row's y,
    // 435.74, in scenario A).
    drawGlyphString(
      'Terms And Conditions:',
      [36.891, 41.491, 45.940, 48.784, 56.142, 60.472, 62.554, 68.027, 72.661, 77.393, 79.474, 84.936, 89.721, 94.354, 99.086, 101.127, 103.872, 105.912, 110.697, 115.331, 119.662],
      y + 10.51,
      8.4,
    );
    // fillColor(BORDER) reset — drawGlyphString() above wraps its own
    // fillColor(BORDER) in save()/restore(), so it reverts the ambient
    // fill color back to whatever it was before the call once it returns —
    // here, GREY, left over from this row's own label-band fill() a few
    // lines up. Without this reset, the Terms value text below silently
    // rendered in GREY (near-invisible against the white background) —
    // root-caused 2026-08-31 from a real generated invoice showing
    // washed-out Bank Details text (same bug, same fix, see below).
    doc.font('Body').fontSize(8).fillColor(BORDER);
    doc.text(sanitize(data.termsAndConditions) || '-', tableX + 3.2, y + 21, { width: CONTENT_WIDTH - 6, height: 11, ellipsis: true });
    y += termsRowH;
    // No gap here — in the reference, the Terms row's bottom border and the
    // Bank Details row's top border are the same line (adjacent boxes).

    // ── 7. Bank Details / Signature row ──────────────────────────────────
    ensureSpace(80);
    const bsRowH = 80;
    // Grey fills drawn BEFORE the two rect() borders below — same fix as
    // Bill To/Invoice Details above: fill() paints an opaque rectangle, so
    // drawing the borders first let the fill blank out the portion of the
    // shared vertical divider (between Bank Details and For <Company>) that
    // fell inside the label band, making it look like the separator "didn't
    // reach the top" of the row.
    doc.rect(tableX, y, colWidth, 17).fill(GREY);
    doc.rect(tableX + colWidth, y, colWidth, 17).fill(GREY);
    doc.rect(tableX, y, colWidth, bsRowH).stroke(BORDER);
    doc.rect(tableX + colWidth, y, colWidth, bsRowH).stroke(BORDER);
    // Same label/value divider treatment as Terms And Conditions above —
    // full width so it also crosses (and reinforces) the vertical divider
    // between the Bank Details and For <Company> columns.
    // 17.63 (was 16.1/16.5/15.7 across earlier guesses) — re-measured
    // 2026-08-26 via pikepdf: the reference's divider rect is
    // y=[485.25,486.00] (center 485.625), and this row's own top border
    // lands at y=468.00 in the reference, giving a true offset of 17.625 —
    // notably different from Terms' 16.125 despite the visually similar
    // label-row treatment, confirmed independently via the actual reference
    // geometry rather than another blind nudge.
    doc.moveTo(tableX, y + 17.63).lineTo(tableX + CONTENT_WIDTH, y + 17.63).stroke(BORDER);
    // Exact reference glyph positions — same fix as the other section
    // headers. y+10.51 (reference baseline 479.25 minus this row's y,
    // 468.74, in scenario A — same delta as Terms And Conditions above,
    // both share the same fontSize/row treatment in the reference).
    drawGlyphString(
      'Bank Details:',
      [37.641, 42.868, 47.432, 52.066, 56.319, 58.400, 63.906, 68.356, 71.101, 75.665, 77.705, 79.745, 84.076],
      y + 10.51,
      8.4,
    );
    // "For RAREPRINT.IN:" — hardcoded reference glyph positions, same as
    // the company-name fix above: only safe for this exact fixed string
    // (this tenant's company name). Falls back to the old boldText call for
    // any other company name.
    if (sanitize(data.company.companyName) === 'RAREPRINT.IN') {
      drawGlyphString(
        'For RAREPRINT.IN:',
        [301.641, 306.192, 310.978, 313.821, 315.902, 321.073, 326.546, 331.716, 336.485, 341.779, 346.949, 349.231, 355.098, 359.210, 361.423, 363.705, 369.690],
        y + 10.51,
        8.4,
      );
    } else {
      // colWidth + 3.39 (was + 6) — re-measured 2026-08-21 against a real
      // generated PDF vs the reference via pdftotext xMin (301.64 vs the
      // 304.25 that +6 produces).
      boldText(`For ${sanitize(data.company.companyName) || 'Company'}:`, tableX + colWidth + 3.39, y + 4);
    }

    // x = tableX + 4.98 (was + 3.2) and the y offsets below re-measured
    // 2026-08-26 via pikepdf/pdftotext against a scenario-A render (uses the
    // reference's own data) — the reference's own "Account No.:"/"IFSC
    // code:"/"Account Holder's Name:" rows all start at the same x=38.68,
    // 1.78pt right of what +3.2 was producing; "Name:" (bank name) alone
    // sits ~1pt left of that in the reference (37.64) — a reference-side
    // quirk on that one row alone, not chased further since 3 of 4 rows
    // agree exactly. Row pitch corrected too: the reference's row1->row2
    // gap is 10.5, not 11 (rows 2-3 and 3-4 were already exactly 12).
    // fillColor(BORDER) reset — same reason as the Terms And Conditions
    // value above: the two drawGlyphString() calls just above (and
    // boldText() in the else branch) leave the ambient fill color reverted
    // to GREY (this row's own label-band fill()) once their own internal
    // save()/restore() unwinds. Root-caused 2026-08-31 from a real
    // generated invoice: Name/Account No./IFSC code/Account Holder's Name
    // were rendering in near-invisible GREY instead of BORDER.
    doc.fillColor(BORDER);
    // fontSize 8.4 (was 8) + labelHscale 1.02 / valueHscale 0.95 (was the
    // unscaled label / implicit default BOLD_HSCALE=1.08 value — neither
    // ever overridden here) — root-caused 2026-08-31 via pikepdf
    // content-stream Tf/cm extraction: all 4 rows render at effective size
    // 8.4 in the reference (same uniform size as the rest of the document),
    // and per-word width comparison against the reference (after accounting
    // for the size fix) showed the label ~2-4% narrower and the value
    // ~5-8% wider than the reference at the old settings. This was the
    // real cause of "Bank Details" looking misaligned in an overlay
    // comparison even though row Y-positions were already exact.
    //
    // y offsets each -2.0 (20.68/31.18/43.18/55.18 -> 18.68/29.18/41.18/
    // 53.18) — root-caused 2026-09-03: those values were calibrated against
    // pdftotext's reported yMin, which (per the page-title comment above)
    // is derived from font ASCENT metrics, not actual glyph ink — it is not
    // a reliable ground truth when comparing two different embedded fonts.
    // Measured against ACTUAL RENDERED PIXELS instead (pdftoppm 300dpi,
    // first ink row of each label's own leading capital letter — content-
    // independent since the labels are identical text in both PDFs): our
    // render's ink consistently starts ~1.9-2.2pt BELOW the reference's own
    // ink on all 4 rows (Name +2.16, Account No. +1.92, IFSC +1.92, Account
    // Holder's Name +1.92pt) despite the old y-values matching the
    // reference's pdftotext yMin almost exactly — i.e. PDFKit's `doc.text()`
    // places real glyph ink further below the passed y for our embedded
    // Body/Body-Bold (SegoeUI) fonts than the reference's own font does at
    // the same nominal y. Row-to-row pitch itself was already correct
    // (10.5/12.0/12.0, matching the reference to within 0.24pt) — this was
    // purely a constant block-level offset, not a per-row drift.
    //
    // valueHscale 0.976 (was 0.95) — root-caused 2026-09-03 via pdftotext
    // per-word width comparison after the y-offset fix above: the two
    // identical-digit value strings we can measure directly against the
    // reference (Account No. "0513102000013378", IFSC "IBKL0000513") were
    // rendering 2.6-2.7% narrower than the reference at 0.95, a real
    // residual visible as horizontal drift growing across the line in an
    // overlay comparison ("text stretching"), not the earlier vertical
    // offset. labelHscale left at 1.02 — the 4 rows' label-width ratios
    // (+0.4%/+0.9%/-2.1%/+1.7%) don't share a consistent sign, consistent
    // with per-word kerning noise rather than a real systematic label error;
    // not chased further.
    //
    // IFSC row's own labelHscale bumped to 1.041 (was the shared 1.02) —
    // root-caused 2026-09-03: unlike the other 3 rows (whose full-label-span
    // width ratios were all within 1.7% either direction), "IFSC code: "
    // measured 2.07% NARROWER than the reference at 1.02 specifically (ref
    // span 39.84pt vs ours 39.03pt) — the opposite direction from the other
    // rows, so it couldn't share their value. Visually this showed as a
    // widening rightward drift through "code:" in a pixel-diff overlay (the
    // reference progressively pulling ahead of ours letter by letter), the
    // classic signature of an undersized hscale rather than per-letter
    // kerning noise. The other 3 rows' small, sign-inconsistent residuals
    // are left alone (still true per the note above).
    // Name/Account Holder's Name valueHscale dropped to 0.905 (was the
    // shared 0.976) — root-caused 2026-09-03: 0.976 was calibrated using
    // ONLY the two digit-heavy value rows (Account No./IFSC), which
    // measured near-perfect (ratio 1.0001-1.0006) — but it was never
    // separately verified against LETTER content, and this document never
    // has identical letter-content values to compare... except "IDBI",
    // which appears in BOTH the reference's bank name ("IDBI Bank (India)")
    // and ours ("IDBI BANK") despite the rest of the value differing. That
    // shared substring measured 7.25% WIDER in ours at valueHscale 0.976
    // (ref 15.30pt vs ours 16.50pt) — letters and digits apparently don't
    // scale the same way between our SegoeUI-Bold and the reference's font,
    // so one shared value hscale can't fit both. Digit rows (Account No./
    // IFSC) keep 0.976; letter rows (Name/Account Holder's Name) get their
    // own 0.976*0.9275=0.905, re-measured against the same "IDBI" substring.
    // Name row's own x = tableX + 3.94 (was the shared tableX + 4.98) —
    // root-caused 2026-09-03: 3 of 4 rows' x0 already matched the reference
    // to within 0.004pt at +4.98, but "Name:" alone measured a genuine
    // 1.04pt rightward offset (ref x0=37.64 vs ours 38.68) — previously
    // noted as "a reference-side quirk, not chased further" (see comment
    // below), but re-flagged by direct visual comparison as a real,
    // consistent rightward shift, not noise. Only this row gets its own x.
    //
    // Account No. row labelHscale 1.02 -> 1.0114, Account Holder's Name row
    // 1.02 -> 1.0026 — root-caused 2026-09-03, second pass: the "don't share
    // a consistent sign, not chased further" note above was revisited after
    // the user pointed out the "o" in "Account No." and the "Holder's Name"
    // span visibly crossing/doubling in an overlay. Full-label-span pdftotext
    // widths (word x0 to final word xMax) showed real, per-row-specific
    // overshoot: Account No.: row measured 0.85% wider than ref (48.55 vs
    // 48.15), growing to a 0.67pt rightward drift by the value's x0; Account
    // Holder's Name: row measured 1.73% wider (91.53 vs 89.97), growing to a
    // 1.46pt drift by "Name:"'s own x0. Both corrected by scaling the
    // existing 1.02 down by the measured ref/ours ratio for that row only.
    // IFSC code: and Name: rows are left alone — their full-span ratios were
    // already within 0.4% (see note above / IFSC note below), and nudging
    // them further would only be chasing per-word kerning noise, not a real
    // systematic error. Note: after this fix, "Account Holder's Name:"'s
    // VALUE still won't overlay perfectly against the reference — the real
    // company's stored holder name is "RAREPRINT IN" (with a space) vs the
    // reference's own "RAREPRINT.IN" (period, no space); that's a data
    // difference, not a rendering bug.
    labelBoldValue('Name: ', sanitize(data.company.bankName) || '-', tableX + 3.94, y + 18.68, 8.4, 1.02, 0.905);
    labelBoldValue('Account No.: ', sanitize(data.company.bankAccountNumber) || '-', tableX + 4.98, y + 29.18, 8.4, 1.0114, 0.976);
    labelBoldValue('IFSC code: ', sanitize(data.company.bankIfsc) || '-', tableX + 4.98, y + 41.18, 8.4, 1.041, 0.976);
    labelBoldValue("Account Holder's Name: ", sanitize(data.company.bankAccountHolderName) || '-', tableX + 4.98, y + 53.18, 8.4, 1.0026, 0.905);

    // Signature size/position, like the logo above, read directly off the
    // reference PDF's content stream transform matrix rather than
    // eyeballed — reference places it 85.5wide x 44.25 tall, top edge at
    // rowTop+21 (nearly touching the "Authorized Signatory" caption below
    // it, same as the reference). It's also horizontally centered under
    // "For <Company>:" — an earlier pass fixed the image at a left-shifted
    // x offset while the caption was centered, which visibly misaligned
    // the two; centering keeps both aligned regardless of column width.
    const sigW = 85.5;
    const sigH = 44.25;
    // Pure centering formula (no manual nudge) — re-measured 2026-08-21: the
    // earlier +1.5 correction actually overshot the reference's true target
    // (x=387.75) by ~1.5pt; plain centering lands at 387.78, within 0.03pt.
    const sigX = tableX + colWidth + (colWidth - sigW) / 2;
    const sigBuf = dataUrlToBuffer(data.company.signatureUrl);
    if (sigBuf) {
      try {
        // No `fit` — see the logo comment above. This was a real bug: the
        // reference signature is 85.5x44.25 (aspect ratio 1.93:1), but the
        // uploaded source PNG is 800x484 (1.65:1), so `fit` was shrinking it
        // to fit inside the box while preserving its own aspect ratio
        // instead of stretching to the target — rendering ~12pt narrower
        // (73.14pt) than the reference's actual 85.5pt, confirmed via
        // pikepdf transform-matrix extraction on both PDFs.
        // y+20.2 (was y+21) — re-measured 2026-08-21 against the reference's
        // signature image transform matrix now that the Terms-gap fix above
        // lands this row's top exactly on the reference's 468.80 (target
        // signature y_top=489.00, i.e. row-top+20.2).
        doc.image(sigBuf, sigX, y + 20.2, { width: sigW, height: sigH });
      } catch {
        // ignore corrupt signature image
      }
    }
    // y+63.78 — re-measured 2026-08-27 against actual rendered pixels (see
    // the "Invoice" title comment above for why pdftotext bbox wasn't
    // catching this): landed ~1.9pt too low in the real render.
    //
    // hscale 1.0456 — re-measured 2026-08-27 against real pixels: this
    // string rendered 3.36pt narrower than the reference's actual width
    // (73.68pt vs 77.04pt), same underlying font-metric mismatch as the
    // page title above, just not previously caught here since this call
    // never had a stretch correction applied (only Body-Bold text did).
    // That narrower width is also *why* the box needed the "+2.82" left
    // nudge a previous pass added — centering an already-too-narrow string
    // in a fixed box lands its visual center off no matter where the box
    // starts. Stretching the text back to the correct width first (this
    // fix) means the box can go back to its original, symmetric +6 inset
    // rather than compensating with an off-center box.
    doc.save();
    // +2.88 (not the box's plain +6) — even after stretching the text back
    // to the reference's true width, re-measuring showed the box still
    // needed roughly the same left nudge as before (+3.12 residual at +6,
    // nearly identical to the pre-stretch error), meaning the earlier
    // "+2.82 compensates for narrow-text-centering" theory was wrong — it's
    // a real, independent x-offset unrelated to the stretch fix.
    // +3.02/y+64.02 (was +2.88/+63.78) — final sub-quarter-point trim,
    // 2026-08-27: last real-pixel check landed 0.14pt left and 0.24pt high.
    doc.translate(tableX + colWidth + 3.02, y + 64.02);
    doc.scale(1.0456, 1);
    doc.font('Body').fontSize(8).fillColor(BORDER).text('Authorized Signatory', 0, 0, { width: (colWidth - 12) / 1.0456, align: 'center' });
    doc.restore();

    y += bsRowH;

    // No continuous outer box around the whole document body — removed
    // 2026-08-21. The reference does NOT wrap header-through-signature in
    // one unbroken frame; it reads as three separate bordered groups
    // (header/Bill To/item table — tax summary/right box — Terms/Bank
    // Details), each with small real gaps between them and no line
    // bridging those gaps. Every section already strokes its own complete
    // box (header, Bill To, each item row, tax table, Terms, Bank Details),
    // so removing this no longer leaves any of them unbordered — it only
    // removes the artificial connector this line was drawing across the
    // gaps between groups. The one exception (the right-side summary box,
    // which has no rect() of its own) gets its own scoped right-edge line
    // just above, spanning only its own group's height.
    doc.end();
  });
}
