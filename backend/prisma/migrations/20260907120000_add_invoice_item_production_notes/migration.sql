-- Adds the real product-detail line (Size/GSM/Paper/Sides, same free-text
-- format OrderItem.productionNotes already uses) to InvoiceItem, so the
-- invoice PDF can show actual product specs under each item instead of
-- nothing item-specific. Root-caused 2026-09-07: the item row's note line
-- was previously hardcoded to the order's sales-agent name (same value
-- repeated on every row, not a real per-item detail) — see
-- invoice-pdf.ts/billing.service.ts for the render-side change. Snapshotted
-- at invoice-creation/reconcile time, same denormalization pattern as every
-- other InvoiceItem column (no FK back to OrderItem) — an order item's
-- specs can keep changing after the invoice is issued without silently
-- rewriting a document that may already be in the customer's hands.
--
-- Nullable, additive — existing InvoiceItem rows (and every write path that
-- doesn't set it) are completely unaffected.

ALTER TABLE "InvoiceItem" ADD COLUMN IF NOT EXISTS "productionNotes" TEXT;
