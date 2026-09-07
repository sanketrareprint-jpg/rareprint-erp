// backend/src/common/resolve-item-details.ts
//
// Single source of truth for resolving an order item's display details
// (Size / GSM / Paper / Sides) for any screen that needs to show them
// (Production, Dispatch Queue/History/Delivered, Accounts Dispatch
// Approval, etc). Prefers the item's own free-text productionNotes (an
// order can override the product's defaults per-line), falling back to the
// linked Product's own catalog fields when notes are missing or don't
// mention a given field.
//
// Replaces dispatch.service.ts's old local parseProductionNotes, which had
// no product-fallback at all — that's what left some Dispatch item cards
// showing only Qty/Wt with nothing else. production.service.ts has its own
// similar (but not identical — it also normalizes `sides` to "Single"/
// "Double" text for the Production page) local resolveItemDetails that was
// left as-is rather than migrated here, to avoid touching that already-
// tuned, unrelated screen while fixing Dispatch/Accounts.
export interface ResolvableProduct {
  sizeInches?: string | null;
  gsm?: number | null;
  paperType?: string | null;
  sides?: string | null;
  printingType?: string | null;
}

export interface ResolvedItemDetails {
  size: string | null;
  gsm: string | null;
  paper: string | null;
  sides: string | null;
  // Printing method (OFFSET/DIGITAL/SCREEN/FLEX) -- always comes straight
  // from the Product catalog (productionNotes never encodes this), so
  // there's no notes-parsing branch for it like the other four fields.
  printingType: string | null;
}

export function resolveItemDetails(
  productionNotes: string | null | undefined,
  product: ResolvableProduct,
): ResolvedItemDetails {
  const notes = productionNotes ?? '';
  // Stop at commas/newlines/pipes so "GSM: 70, Sides: DOUBLE_SIDE" doesn't
  // capture "70," with a trailing comma.
  let size  = notes.match(/Size[\s:]+([^\n,|]+)/i)?.[1]?.trim() ?? null;
  let gsm   = notes.match(/GSM[\s:]+([^,\n|\s]+)/i)?.[1]?.trim() ?? null;
  let paper = notes.match(/Paper[\s:]+([^\n,|]+)/i)?.[1]?.trim() ?? null;
  let sides = notes.match(/Sides[\s:]+([^,\n|\s]+)/i)?.[1]?.trim() ?? null;

  if (!size && product.sizeInches) size = product.sizeInches;
  if (!gsm && product.gsm != null) gsm = String(product.gsm);
  if (!paper && product.paperType) paper = product.paperType;
  if (!sides && product.sides) sides = product.sides;

  const printingType = product.printingType ?? null;

  return { size, gsm, paper, sides, printingType };
}

// Renders a resolved item's details as the single "Size: X, GSM: Y, Paper: Z,
// Sides: W" line used on the invoice PDF (see InvoicePdfItem.productDetails
// in ../billing/invoice-pdf.ts) and in orders.service.ts#superAdminEditItem's
// rebuilt productionNotes string. Same field order/format as that existing
// string so historical and freshly-generated notes read identically. Added
// 2026-09-07 alongside the invoice product-details fix: the invoice snapshot
// was originally just copying raw OrderItem.productionNotes, which is null
// for the vast majority of items (it's only ever set when someone manually
// overrides a product's defaults) — falling through resolveItemDetails first
// picks up the Product catalog's Size/GSM/Paper/Sides in the (normal) case
// where no override note was entered.
export function formatItemDetailsNote(
  productionNotes: string | null | undefined,
  product: ResolvableProduct,
): string | null {
  const { size, gsm, paper, sides } = resolveItemDetails(productionNotes, product);
  if (!size && !gsm && !paper && !sides) return null;
  return `Size: ${size ?? '-'}, GSM: ${gsm ?? '-'}${paper ? `, Paper: ${paper}` : ''}, Sides: ${sides ?? '-'}`;
}

// Pulls just the Size value back out of a string built by
// formatItemDetailsNote() above (InvoiceItem.productionNotes is stored
// already-formatted, not as separate fields — see the migration/schema
// comment). Used by billing.service.ts to show Size next to the item name
// on the invoice PDF, in addition to the full note line. Returns null if
// there's no recognizable "Size: ..." prefix or it's the "-" placeholder.
export function extractSizeFromNote(note: string | null | undefined): string | null {
  const match = (note ?? '').match(/^Size:\s*([^,]+),/i);
  const value = match?.[1]?.trim();
  return value && value !== '-' ? value : null;
}
