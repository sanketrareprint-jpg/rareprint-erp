/**
 * backfill-orphaned-sheet-assignments.js
 *
 * One-off fix for 3 specific order items that were physically printed on an
 * existing sheet, but never got a PrintSheetItem link created in the app —
 * because the "Select sheet…" dropdown in Production > Sheets > Unassigned
 * only lists sheets whose GSM matches AND whose own total quantity is <=
 * the item's remaining balance (see clubbing-sheet.service.ts /
 * frontend/app/production/page.tsx). By the time anyone tried to assign
 * these items, the target sheet had already moved past PRINTING/PROCESSING
 * status and no longer showed up as a candidate — so the item was stuck
 * with no sheet link and itemProductionStage never advanced to
 * READY_FOR_DISPATCH, even though the physical work was already done.
 *
 * This does exactly what clicking "Assign" in the UI would have done
 * (creates a PrintSheetItem + a SHEET_ASSIGNED StatusLog entry — same
 * shape as ClubbingSheetService.placeItemOnSheet), then separately sets the
 * order item's itemProductionStage to READY_FOR_DISPATCH to match reality.
 * areaSqInches is passed as 0 deliberately — these sheets are already fully
 * printed, so there's no accurate open-size figure to add to
 * usedAreaSqInches at this point, and 0 keeps placeItemOnSheet's capacity
 * check inert (it only fires when areaSqInches > 1).
 *
 * The three cases, from Sanket (2026-08-13):
 *   Order 1355  BILL BOOK MULTICOLOR PRINTING  -> Sheet 1352
 *   Order 1283  REFERENCE PAD                  -> Sheet 1353
 *   Order 1454  LETTERPAD                      -> Sheet 1392
 *
 * Safe to re-run — skips any pair that already has a PrintSheetItem link.
 *
 * Usage:
 *   Dry-run (shows what WOULD change, writes nothing):
 *     node scripts/backfill-orphaned-sheet-assignments.js
 *   Apply:
 *     node scripts/backfill-orphaned-sheet-assignments.js --apply
 */

const path = require('path');
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch {}

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes('--apply');

const CASES = [
  { orderNumber: '1355', productNameContains: 'BILL BOOK', sheetNo: '1352' },
  { orderNumber: '1283', productNameContains: 'REFERENCE PAD', sheetNo: '1353' },
  { orderNumber: '1454', productNameContains: 'LETTERPAD', sheetNo: '1392' },
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log('No DATABASE_URL set — run this locally where your .env points at the real DB.');
    return;
  }
  console.log(APPLY ? '=== APPLY MODE — will write changes ===' : '=== DRY RUN — no changes will be written (pass --apply to write) ===');
  console.log('');

  for (const c of CASES) {
    console.log(`--- Order ${c.orderNumber} (${c.productNameContains}) -> Sheet ${c.sheetNo} ---`);

    const order = await prisma.order.findFirst({
      where: { orderNumber: c.orderNumber },
      include: { items: { include: { product: true } } },
    });
    if (!order) { console.log(`  SKIP: order ${c.orderNumber} not found`); continue; }

    const item = order.items.find((i) =>
      i.product.name.toUpperCase().includes(c.productNameContains.toUpperCase()),
    );
    if (!item) {
      console.log(`  SKIP: no item matching "${c.productNameContains}" on order ${c.orderNumber}`);
      console.log(`        items on this order: ${order.items.map((i) => i.product.name).join(', ')}`);
      continue;
    }

    const sheet = await prisma.printSheet.findFirst({ where: { sheetNo: c.sheetNo } });
    if (!sheet) { console.log(`  SKIP: sheet ${c.sheetNo} not found`); continue; }

    const existingLink = await prisma.printSheetItem.findFirst({
      where: { sheetId: sheet.id, orderItemId: item.id },
    });
    if (existingLink) {
      console.log(`  Already linked (PrintSheetItem ${existingLink.id}) — checking item stage only.`);
    } else {
      console.log(`  Item: ${item.product.name} x${item.quantity} (orderItemId ${item.id})`);
      console.log(`  Sheet: ${sheet.sheetNo} (id ${sheet.id}, status ${sheet.status}, gsm ${sheet.gsm})`);
      console.log(`  Would create PrintSheetItem: multiple=1, quantityOnSheet=${item.quantity}, areaSqInches=0`);
      if (APPLY) {
        await prisma.printSheetItem.create({
          data: {
            sheetId: sheet.id,
            orderItemId: item.id,
            productId: item.productId,
            multiple: 1,
            quantityOnSheet: item.quantity,
            areaSqInches: 0,
          },
        });
        await prisma.statusLog.create({
          data: {
            orderId: order.id,
            fromStatus: order.status,
            toStatus: order.status,
            reason: `Sheet assigned: ${item.product.name} → Sheet ${sheet.sheetNo} (backfill — item was physically printed but never linked, see backfill-orphaned-sheet-assignments.js)`,
            metadata: {
              eventType: 'SHEET_ASSIGNED',
              sheetId: sheet.id,
              sheetNo: sheet.sheetNo,
              sheetStatus: sheet.status,
              productName: item.product.name,
              quantityOnSheet: item.quantity,
              multiple: 1,
              source: 'BACKFILL_SCRIPT',
            },
          },
        });
        console.log('  Created PrintSheetItem + StatusLog.');
      }
    }

    if (item.itemProductionStage === 'READY_FOR_DISPATCH') {
      console.log('  Item stage already READY_FOR_DISPATCH — nothing to do.');
    } else {
      console.log(`  Would set itemProductionStage: ${item.itemProductionStage} -> READY_FOR_DISPATCH`);
      if (APPLY) {
        await prisma.orderItem.update({
          where: { id: item.id },
          data: { itemProductionStage: 'READY_FOR_DISPATCH' },
        });
        console.log('  Updated item stage.');
      }
    }
    console.log('');
  }

  console.log(APPLY ? 'Done.' : 'Dry run complete — re-run with --apply to write these changes.');
}

main()
  .catch((err) => { console.error('Failed:', err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
