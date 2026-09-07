/**
 * backfill-invoice-item-production-notes.js (v2 — 2026-09-07)
 *
 * One-off fix for InvoiceItem rows whose productionNotes note line is
 * missing/blank on the invoice PDF.
 *
 * v1 of this script just copied OrderItem.productionNotes verbatim — but
 * that field is a manual FREE-TEXT OVERRIDE, null on the vast majority of
 * items. The real per-item Size/GSM/Paper/Sides normally come from the
 * linked Product's own catalog fields (sizeInches/gsm/paperType/sides),
 * with productionNotes only used when someone overrides those defaults —
 * see backend/src/common/resolve-item-details.ts (the single source of
 * truth already used by Orders/Dispatch/Accounts screens) and its new
 * formatItemDetailsNote() helper, added alongside this v2. v1 therefore
 * silently no-op'd on any invoice whose items never had a manual override
 * (confirmed via order 1621: OrderItem.productionNotes was null on both
 * items, even though the Orders page correctly showed Size/GSM/Paper/Sides
 * pulled from the Product catalog).
 *
 * v2 resolves EVERY InvoiceItem the same way formatItemDetailsNote() does
 * (notes-first, falling back to the Product catalog), so it also re-checks
 * (and can upgrade) rows v1 already touched, not just rows still null.
 *
 * Does NOT touch any amount, total, tax, or ledger field — productionNotes
 * only. Pairs each Invoice's items with its Order's (non-cancelled) items
 * IN ARRAY ORDER, same as the original creation loop — see v1's original
 * header comment for the full reasoning. Same count-mismatch safety check
 * as v1: an invoice is only touched when item counts match 1:1.
 *
 * Usage:
 *   Dry-run (shows what WOULD change, writes nothing):
 *     node scripts/backfill-invoice-item-production-notes.js
 *
 *   Apply:
 *     node scripts/backfill-invoice-item-production-notes.js --apply
 */

const path = require('path');
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch {}

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes('--apply');

// Mirrors backend/src/common/resolve-item-details.ts exactly (plain JS copy
// since this script runs outside the Nest/ts-node build). Keep in sync with
// that file if the resolution rules ever change.
function resolveItemDetails(productionNotes, product) {
  const notes = productionNotes ?? '';
  let size  = notes.match(/Size[\s:]+([^\n,|]+)/i)?.[1]?.trim() ?? null;
  let gsm   = notes.match(/GSM[\s:]+([^,\n|\s]+)/i)?.[1]?.trim() ?? null;
  let paper = notes.match(/Paper[\s:]+([^\n,|]+)/i)?.[1]?.trim() ?? null;
  let sides = notes.match(/Sides[\s:]+([^,\n|\s]+)/i)?.[1]?.trim() ?? null;

  if (!size && product.sizeInches) size = product.sizeInches;
  if (!gsm && product.gsm != null) gsm = String(product.gsm);
  if (!paper && product.paperType) paper = product.paperType;
  if (!sides && product.sides) sides = product.sides;

  return { size, gsm, paper, sides };
}

function formatItemDetailsNote(productionNotes, product) {
  const { size, gsm, paper, sides } = resolveItemDetails(productionNotes, product);
  if (!size && !gsm && !paper && !sides) return null;
  return `Size: ${size ?? '-'}, GSM: ${gsm ?? '-'}${paper ? `, Paper: ${paper}` : ''}, Sides: ${sides ?? '-'}`;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set (check backend/.env) — aborting.');
    process.exit(1);
  }

  console.log(APPLY ? '⚡ APPLYING changes...' : '🔍 DRY RUN — pass --apply to commit');

  // v2 re-checks every invoice, not just ones with a NULL note, since a
  // wrong-but-non-null value (v1's no-op on order 1621 would've been null
  // still, but be safe) could otherwise be skipped.
  const invoices = await prisma.invoice.findMany({
    select: {
      id: true,
      invoiceNumber: true,
      orderId: true,
      items: { select: { id: true, productName: true, productionNotes: true } },
      order: {
        select: {
          orderNumber: true,
          items: {
            select: {
              id: true,
              productionNotes: true,
              cancelledAt: true,
              product: { select: { name: true, sizeInches: true, gsm: true, paperType: true, sides: true } },
            },
          },
        },
      },
    },
  });

  console.log(`Total invoices: ${invoices.length}`);

  let updatedInvoices = 0, updatedItems = 0, skippedMismatch = 0, unchanged = 0;
  const mismatches = [];

  for (const inv of invoices) {
    const orderItems = inv.order.items.filter((i) => !i.cancelledAt);
    if (orderItems.length !== inv.items.length) {
      skippedMismatch++;
      mismatches.push(`  Invoice ${inv.invoiceNumber} (order ${inv.order.orderNumber}): ${inv.items.length} invoice item(s) vs ${orderItems.length} non-cancelled order item(s) — skipped, needs manual review`);
      continue;
    }

    let anyUpdatedThisInvoice = false;
    for (let i = 0; i < inv.items.length; i++) {
      const invItem = inv.items[i];
      const orderItem = orderItems[i];
      const resolvedNote = formatItemDetailsNote(orderItem.productionNotes, orderItem.product);
      if (resolvedNote === invItem.productionNotes) { unchanged++; continue; } // already correct

      anyUpdatedThisInvoice = true;
      updatedItems++;
      if (APPLY) {
        await prisma.invoiceItem.update({
          where: { id: invItem.id },
          data: { productionNotes: resolvedNote },
        });
      }
    }
    if (anyUpdatedThisInvoice) updatedInvoices++;
  }

  console.log(`\n${APPLY ? 'Updated' : 'Would update'} ${updatedItems} item(s) across ${updatedInvoices} invoice(s).`);
  console.log(`${unchanged} item(s) already correct, left untouched.`);
  if (mismatches.length > 0) {
    console.log(`\n${skippedMismatch} invoice(s) skipped due to item-count mismatch (manual review needed):`);
    mismatches.forEach((m) => console.log(m));
  }
  if (!APPLY && updatedItems > 0) {
    console.log('\nRe-run with --apply to write these changes.');
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
