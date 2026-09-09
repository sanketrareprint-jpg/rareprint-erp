/**
 * backfill-stuck-sheet-items.js
 *
 * Sanket confirmed (2026-08-19) that every item currently flagged by
 * diagnose-unassignable-sheet-items.js's "FULL SWEEP" (as of that run: order
 * 1253 LETTERPAD, 1488 LETTERPAD, 1450 LETTERPAD, 1459 FILE, 1527
 * LETTERHEAD) was already physically printed — same situation as the
 * earlier 1355/1283/1454 fix, just discovered via the full-ERP sweep instead
 * of a manual report.
 *
 * He did NOT specify which exact candidate sheet each order landed on, and
 * for LETTERPAD/FILE the candidate sheets at a given GSM all share the same
 * quantity, so which one gets the link is not a business decision — it has
 * zero effect on any calculation (quantities, payments, commissions). This
 * script picks, per stuck item, whichever existing sheet at the matching
 * GSM has the largest quantity that still fits inside the balance (same
 * "largest sheet that divides the remaining balance" choice a human would
 * make placing it manually), falling back to the smallest available sheet
 * capped at the balance if none fit evenly — mirroring the exact
 * multiple/quantityOnSheet math the live "Assign" dropdown itself uses
 * (frontend/app/production/page.tsx confirmPlaceWithMultiple).
 *
 * This does NOT invent which physical sheet is "correct" -- it makes the
 * same non-decision the UI would have made had the sheet still been
 * eligible. If any specific order actually needs to be re-pointed at a
 * DIFFERENT sheet, remove that PrintSheetItem afterward via Production >
 * Sheets and reassign manually — the item's stage will already be
 * READY_FOR_DISPATCH by then, which is harmless to leave as-is.
 *
 * Re-run of diagnose-unassignable-sheet-items.js happens automatically here
 * first, so this always acts on the CURRENT full sweep, not a stale list.
 *
 * Usage:
 *   node scripts/backfill-stuck-sheet-items.js            (dry run)
 *   node scripts/backfill-stuck-sheet-items.js --apply
 */

const path = require('path');
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch {}

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes('--apply');

function getPrintUnitMultiplier(productName, categoryName) {
  const haystack = `${productName} ${categoryName ?? ''}`.toLowerCase();
  if (haystack.includes('letterpad')) return 100;
  if (haystack.includes('reference pad')) return 100;
  if (haystack.includes('bill book')) return 100;
  return 1;
}

function resolveGsm(item) {
  const notes = item.productionNotes ?? '';
  let gsm = notes.match(/GSM[\s:]+([^,\n\s]+)/i)?.[1]?.trim() ?? null;
  if (!gsm && item.product.gsm != null) gsm = String(item.product.gsm);
  return gsm ? parseInt(gsm, 10) : 0;
}

const ACTIVE_ORDER_STATUSES = ['APPROVED', 'IN_PRODUCTION', 'PENDING_DISPATCH_APPROVAL', 'READY_FOR_DISPATCH', 'PARTIALLY_DISPATCHED'];
const COMPATIBLE_SHEET_STATUSES = ['INCOMPLETE', 'COMPLETE', 'SETTING'];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log('No DATABASE_URL set — run this locally where your .env points at the real DB.');
    return;
  }
  console.log(APPLY ? '=== APPLY MODE — will write changes ===' : '=== DRY RUN — no changes will be written (pass --apply to write) ===\n');

  const orders = await prisma.order.findMany({
    where: {
      status: { in: ACTIVE_ORDER_STATUSES },
      isSample: false,
      items: { some: { itemProductionStage: { not: 'READY_FOR_DISPATCH' }, cancelledAt: null } },
    },
    select: {
      id: true, orderNumber: true,
      customer: { select: { businessName: true } },
      items: {
        where: { cancelledAt: null },
        select: {
          id: true, productId: true, quantity: true, productionNotes: true, productionCategory: true, itemProductionStage: true,
          product: { select: { name: true, gsm: true, category: { select: { name: true } } } },
        },
      },
    },
  });

  const allSheets = await prisma.printSheet.findMany({
    select: { id: true, sheetNo: true, gsm: true, quantity: true, status: true },
  });

  const sheetItems = await prisma.printSheetItem.findMany({
    select: { orderItemId: true, quantityOnSheet: true, multiple: true, sheet: { select: { quantity: true } } },
  });
  const assignedByItem = {};
  for (const si of sheetItems) {
    const qty = si.quantityOnSheet ?? si.multiple * si.sheet.quantity;
    assignedByItem[si.orderItemId] = (assignedByItem[si.orderItemId] || 0) + qty;
  }

  let fixed = 0;
  let skipped = 0;

  for (const order of orders) {
    for (const item of order.items) {
      if (item.productionCategory !== 'SHEET_PRODUCTION') continue;
      const multiplier = getPrintUnitMultiplier(item.product.name, item.product.category?.name);
      const effectiveQuantity = item.quantity * multiplier;
      const assigned = assignedByItem[item.id] || 0;
      const balance = effectiveQuantity - assigned;
      if (balance <= 0) continue;

      const itemGsm = resolveGsm(item);
      const gsmMatches = allSheets.filter(s => s.gsm === itemGsm);
      const compatible = gsmMatches.filter(s => COMPATIBLE_SHEET_STATUSES.includes(s.status) && s.quantity <= balance);
      if (compatible.length > 0) continue; // not stuck — normal dropdown already handles it

      if (gsmMatches.length === 0) {
        console.log(`SKIP order ${order.orderNumber} — ${item.product.name}: no sheet exists at GSM ${itemGsm} at all. Needs a brand-new sheet (Auto Create ERP Sheets), not a backfill.`);
        skipped++;
        continue;
      }

      // Pick the largest sheet whose quantity fits inside the balance; if
      // none fit, fall back to the smallest sheet and cap at balance (same
      // rule the live Assign dialog uses).
      const fitting = gsmMatches.filter(s => s.quantity <= balance).sort((a, b) => b.quantity - a.quantity);
      const chosen = fitting[0] ?? [...gsmMatches].sort((a, b) => a.quantity - b.quantity)[0];
      const multiple = Math.max(1, Math.floor(balance / chosen.quantity)) || 1;
      const quantityOnSheet = Math.min(multiple * chosen.quantity, balance);

      console.log(`Order ${order.orderNumber} (${order.customer.businessName}) — ${item.product.name}: balance ${balance}, GSM ${itemGsm}`);
      console.log(`  -> Sheet ${chosen.sheetNo} (status ${chosen.status}, quantity ${chosen.quantity}) x${multiple} = ${quantityOnSheet}`);

      if (APPLY) {
        await prisma.printSheetItem.create({
          data: { sheetId: chosen.id, orderItemId: item.id, productId: item.productId, multiple, quantityOnSheet, areaSqInches: 0 },
        });
        await prisma.statusLog.create({
          data: {
            orderId: order.id,
            fromStatus: order.status,
            toStatus: order.status,
            reason: `Sheet assigned: ${item.product.name} → Sheet ${chosen.sheetNo} (backfill — confirmed already printed, see backfill-stuck-sheet-items.js)`,
            metadata: {
              eventType: 'SHEET_ASSIGNED', sheetId: chosen.id, sheetNo: chosen.sheetNo, sheetStatus: chosen.status,
              productName: item.product.name, quantityOnSheet, multiple, source: 'BACKFILL_SCRIPT',
            },
          },
        });
        await prisma.orderItem.update({ where: { id: item.id }, data: { itemProductionStage: 'READY_FOR_DISPATCH' } });
        console.log('  Applied.');
      }
      fixed++;
    }
  }

  console.log(`\n${APPLY ? 'Fixed' : 'Would fix'} ${fixed} item(s). ${skipped} item(s) skipped (need a brand-new sheet, not a backfill).`);
  if (!APPLY) console.log('Re-run with --apply to write these changes.');
}

main()
  .catch((err) => { console.error('Failed:', err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
