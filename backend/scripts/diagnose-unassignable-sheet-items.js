/**
 * diagnose-unassignable-sheet-items.js
 *
 * READ-ONLY diagnostic. Finds every order item across the whole ERP that is
 * sitting in Production > Sheets > Unassigned with NO compatible sheet to
 * assign it to -- i.e. every item that would show "No compatible sheet" /
 * have a disabled Assign control right now, for ANY reason, not just the
 * letterpad/reference-pad/bill-book unit-mismatch bug fixed 2026-08-19.
 *
 * Mirrors the exact eligibility + compatibility logic used by:
 *   - backend/src/production/production.service.ts  (listInProduction)
 *   - backend/src/production/clubbing-sheet.service.ts (getPrintUnitMultiplier)
 *   - frontend/app/production/page.tsx (Sheets > Unassigned "compatibleSheets" filter)
 * so its output should match what the UI shows. If a product type turns up
 * here that ISN'T letterpad/reference pad/bill book, that's a NEW bug class,
 * not the one already fixed -- read the "reason" column before assuming it's
 * the same multiplier issue.
 *
 * KEEP THE MULTIPLIER TABLE BELOW IN SYNC with getPrintUnitMultiplier in
 * backend/src/production/clubbing-sheet.service.ts -- duplicated here only
 * because this is a plain standalone script, not compiled Nest code.
 *
 * Usage:
 *   node scripts/diagnose-unassignable-sheet-items.js
 *   node scripts/diagnose-unassignable-sheet-items.js 1459 1450   (deep-dive specific order numbers)
 */

const path = require('path');
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch {}

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function getPrintUnitMultiplier(productName, categoryName) {
  const haystack = `${productName} ${categoryName ?? ''}`.toLowerCase();
  if (haystack.includes('letterpad')) return 100;
  if (haystack.includes('reference pad')) return 100;
  if (haystack.includes('bill book')) return 100;
  return 1;
}

// Same GSM/size/notes resolution as production.service.ts's resolveItemDetails
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

  const focusOrderNumbers = process.argv.slice(2);

  const orders = await prisma.order.findMany({
    where: {
      status: { in: ACTIVE_ORDER_STATUSES },
      isSample: false,
      items: { some: { itemProductionStage: { not: 'READY_FOR_DISPATCH' }, cancelledAt: null } },
    },
    select: {
      orderNumber: true,
      customer: { select: { businessName: true } },
      items: {
        where: { cancelledAt: null },
        select: {
          id: true, quantity: true, productionNotes: true, productionCategory: true,
          itemProductionStage: true,
          product: { select: { name: true, gsm: true, category: { select: { name: true } } } },
        },
      },
    },
  });

  const allSheets = await prisma.printSheet.findMany({
    select: { id: true, sheetNo: true, gsm: true, quantity: true, status: true },
  });

  // Assigned-so-far per order item, across ALL sheets (any status) — same as
  // frontend's `aqm`.
  const sheetItems = await prisma.printSheetItem.findMany({
    select: { orderItemId: true, quantityOnSheet: true, multiple: true, sheet: { select: { quantity: true } } },
  });
  const assignedByItem = {};
  for (const si of sheetItems) {
    const qty = si.quantityOnSheet ?? si.multiple * si.sheet.quantity;
    assignedByItem[si.orderItemId] = (assignedByItem[si.orderItemId] || 0) + qty;
  }

  const problems = [];
  const focusResults = [];

  for (const order of orders) {
    for (const item of order.items) {
      if (item.productionCategory !== 'SHEET_PRODUCTION') continue;
      const multiplier = getPrintUnitMultiplier(item.product.name, item.product.category?.name);
      const effectiveQuantity = item.quantity * multiplier;
      const assigned = assignedByItem[item.id] || 0;
      const balance = effectiveQuantity - assigned;
      const itemGsm = resolveGsm(item);
      const isFocus = focusOrderNumbers.includes(order.orderNumber);

      if (balance <= 0) {
        if (isFocus) focusResults.push({ order, item, multiplier, effectiveQuantity, assigned, balance, itemGsm, note: 'Fully assigned already (balance <= 0) — should not appear in Unassigned at all.' });
        continue;
      }

      const gsmMatches = allSheets.filter(s => s.gsm === itemGsm);
      const compatible = gsmMatches.filter(s => COMPATIBLE_SHEET_STATUSES.includes(s.status) && s.quantity <= balance);

      const record = { order, item, multiplier, effectiveQuantity, assigned, balance, itemGsm, gsmMatches, compatible };
      if (isFocus) focusResults.push(record);
      if (compatible.length === 0) problems.push(record);
    }
  }

  if (focusOrderNumbers.length > 0) {
    console.log(`=== DEEP DIVE: orders ${focusOrderNumbers.join(', ')} ===\n`);
    if (focusResults.length === 0) {
      console.log('  No SHEET_PRODUCTION items found on these orders (wrong order number, item not categorized as Sheet Production yet, or order status outside the active set). Check the order in the UI for its current status/category.\n');
    }
    for (const r of focusResults) {
      console.log(`Order ${r.order.orderNumber} — ${r.order.customer.businessName}`);
      console.log(`  Item: ${r.item.product.name} (itemId ${r.item.id})`);
      console.log(`  Raw quantity: ${r.item.quantity}   Multiplier: ${r.multiplier}x   Effective quantity: ${r.effectiveQuantity}`);
      console.log(`  Already assigned (any sheet, any status): ${r.assigned}`);
      console.log(`  Balance: ${r.balance}`);
      console.log(`  Item GSM (resolved): ${r.itemGsm}`);
      if (r.note) { console.log(`  ${r.note}\n`); continue; }
      if (r.gsmMatches.length === 0) {
        console.log(`  No PrintSheet exists anywhere in the system with GSM ${r.itemGsm}. A new sheet needs to be created (Auto Create ERP Sheets, or manually) — this is a data/workflow gap, not the multiplier bug.`);
      } else {
        console.log(`  Sheets at GSM ${r.itemGsm} (${r.gsmMatches.length} total):`);
        for (const s of r.gsmMatches) {
          const statusOk = COMPATIBLE_SHEET_STATUSES.includes(s.status);
          const qtyOk = s.quantity <= r.balance;
          console.log(`    Sheet ${s.sheetNo}: status=${s.status} (${statusOk ? 'OK' : 'BLOCKS -- past SETTING'}), quantity=${s.quantity} (${qtyOk ? 'OK' : 'BLOCKS -- exceeds balance'})`);
        }
      }
      console.log(`  Compatible sheets found: ${r.compatible.length}\n`);
    }
    console.log('');
  }

  console.log(`=== FULL SWEEP: ${problems.length} item(s) across the ERP with balance > 0 and zero compatible sheets ===\n`);
  if (problems.length === 0) {
    console.log('None found — every Unassigned item currently has at least one compatible sheet.');
  } else {
    for (const r of problems) {
      const reason = r.gsmMatches.length === 0
        ? 'NO_SHEET_AT_GSM'
        : r.gsmMatches.every(s => !COMPATIBLE_SHEET_STATUSES.includes(s.status))
          ? 'ALL_GSM_SHEETS_PAST_SETTING'
          : 'ALL_GSM_SHEETS_TOO_LARGE_FOR_BALANCE';
      console.log(`Order ${r.order.orderNumber} — ${r.item.product.name} — balance ${r.balance} (raw ${r.item.quantity} x${r.multiplier}) — GSM ${r.itemGsm} — reason: ${reason}`);
    }
  }

  // Flag any product name that looks pad/book-like but ISN'T in the known
  // multiplier list, in case there's a missed product type contributing to
  // ALL_GSM_SHEETS_TOO_LARGE_FOR_BALANCE above.
  const suspicious = problems.filter(r => {
    const n = r.item.product.name.toLowerCase();
    return r.multiplier === 1 && (n.includes('pad') || n.includes('book') || n.includes('booklet'));
  });
  if (suspicious.length > 0) {
    console.log(`\n=== POSSIBLE MISSED MULTIPLIER: ${suspicious.length} item(s) with "pad"/"book"/"booklet" in the name but multiplier=1x ===`);
    for (const r of suspicious) {
      console.log(`  Order ${r.order.orderNumber} — ${r.item.product.name} — raw quantity ${r.item.quantity}, balance ${r.balance}`);
    }
    console.log('  If any of these are genuinely "1 order unit = many printed sheets" products, tell me the ratio and I\'ll add them to getPrintUnitMultiplier.');
  }
}

main()
  .catch((err) => { console.error('Failed:', err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
