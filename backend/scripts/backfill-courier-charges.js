/**
 * backfill-courier-charges.js
 *
 * One-off backfill for Dispatch > Courier Charges rows that predate the
 * Shipment.courierChargeActual / Order.courierChargeQuoted columns, so
 * "Actual" and "Taken from Customer" aren't permanently blank for orders
 * dispatched before those fields existed.
 *
 * Neither value was ever persisted on its own field before now — both were
 * only ever recorded as text/JSON inside StatusLog, so this recovers them
 * from there:
 *
 *  - Actual: StatusLog.metadata.amount on the "N item(s) dispatched via ..."
 *    log whose metadata.shipmentNumber matches the shipment. This is the
 *    same picked.amount that bookItems() now saves directly going forward.
 *  - Taken from Customer: the "Courier charges: ₹X" line inside the
 *    "Agent submitted for dispatch..." StatusLog reason at
 *    PENDING_DISPATCH_APPROVAL, matched to the order and copied onto every
 *    COURIER shipment of that order that doesn't already have a value.
 *
 * Only fills NULLs. Never touches a Shipment.courierChargeActual or
 * Shipment.courierChargeCollected that's already set (e.g. from a manual
 * edit already made in the Courier Charges tab, or already captured
 * automatically by the updated bookItems()/submitForDispatch code). Orders
 * with no matching StatusLog data are left as-is and reported, not guessed.
 *
 * Usage:
 *   node scripts/backfill-courier-charges.js            (dry run)
 *   node scripts/backfill-courier-charges.js --apply     (writes changes)
 */

const path = require('path');
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch {}

const { PrismaClient, Prisma } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes('--apply');

function parseTakenAmount(reason) {
  if (!reason) return null;
  const m = reason.match(/Courier charges:\s*₹\s*([\d,]+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function main() {
  console.log(APPLY ? '⚡ APPLYING changes...' : '🔍 DRY RUN — pass --apply to commit');

  // ── 1. Backfill Order.courierChargeQuoted from submit-for-dispatch StatusLogs ──
  const ordersMissingQuoted = await prisma.order.findMany({
    where: { courierChargeQuoted: null },
    select: { id: true, orderNumber: true },
  });
  console.log(`Orders with courierChargeQuoted still null: ${ordersMissingQuoted.length}`);

  const submitLogs = ordersMissingQuoted.length
    ? await prisma.statusLog.findMany({
        where: {
          orderId: { in: ordersMissingQuoted.map((o) => o.id) },
          toStatus: 'PENDING_DISPATCH_APPROVAL',
          reason: { contains: 'Courier charges: ₹' },
        },
        orderBy: { createdAt: 'desc' },
        select: { orderId: true, reason: true },
      })
    : [];
  const quotedByOrder = new Map();
  for (const log of submitLogs) {
    if (quotedByOrder.has(log.orderId)) continue; // keep the most recent (already ordered desc)
    const amount = parseTakenAmount(log.reason);
    if (amount != null) quotedByOrder.set(log.orderId, amount);
  }
  console.log(`Recovered a "Courier charges" amount for ${quotedByOrder.size} order(s).`);

  let quotedUpdated = 0;
  for (const [orderId, amount] of quotedByOrder) {
    if (APPLY) {
      await prisma.order.update({
        where: { id: orderId },
        data: { courierChargeQuoted: new Prisma.Decimal(amount) },
      });
    }
    quotedUpdated++;
  }
  console.log(`${APPLY ? 'Updated' : 'Would update'} Order.courierChargeQuoted on ${quotedUpdated} order(s).`);

  // ── 2. Backfill Shipment.courierChargeActual from dispatch StatusLogs ──
  const shipmentsMissingActual = await prisma.shipment.findMany({
    where: { dispatchType: 'COURIER', courierChargeActual: null },
    select: { id: true, orderId: true, shipmentNumber: true },
  });
  console.log(`\nCourier shipments with courierChargeActual still null: ${shipmentsMissingActual.length}`);

  const orderIdsForActual = [...new Set(shipmentsMissingActual.map((s) => s.orderId))];
  const dispatchLogs = orderIdsForActual.length
    ? await prisma.statusLog.findMany({
        where: {
          orderId: { in: orderIdsForActual },
          reason: { contains: 'dispatched via' },
        },
        select: { orderId: true, metadata: true },
      })
    : [];
  const actualByShipmentNumber = new Map();
  for (const log of dispatchLogs) {
    const meta = log.metadata;
    if (meta && typeof meta === 'object' && meta.shipmentNumber && meta.amount != null) {
      actualByShipmentNumber.set(meta.shipmentNumber, Number(meta.amount));
    }
  }

  let actualUpdated = 0;
  for (const s of shipmentsMissingActual) {
    const amount = actualByShipmentNumber.get(s.shipmentNumber);
    if (amount == null || !Number.isFinite(amount) || amount < 0) continue;
    if (APPLY) {
      await prisma.shipment.update({
        where: { id: s.id },
        data: { courierChargeActual: new Prisma.Decimal(amount) },
      });
    }
    actualUpdated++;
  }
  console.log(`${APPLY ? 'Updated' : 'Would update'} Shipment.courierChargeActual on ${actualUpdated} shipment(s).`);

  // ── 3. Copy Order.courierChargeQuoted onto Shipment.courierChargeCollected ──
  // Covers shipments whose order's courierChargeQuoted is now known (either
  // already set, or just backfilled in step 1) but whose own
  // courierChargeCollected is still blank — i.e. never manually edited.
  const shipmentsMissingCollected = await prisma.shipment.findMany({
    where: { dispatchType: 'COURIER', courierChargeCollected: null },
    select: { id: true, orderId: true, order: { select: { courierChargeQuoted: true } } },
  });
  console.log(`\nCourier shipments with courierChargeCollected still null: ${shipmentsMissingCollected.length}`);

  let collectedUpdated = 0;
  for (const s of shipmentsMissingCollected) {
    const quoted = s.order.courierChargeQuoted != null
      ? Number(s.order.courierChargeQuoted)
      : quotedByOrder.get(s.orderId); // just backfilled above, not yet in `order` relation until applied
    if (quoted == null || !Number.isFinite(quoted) || quoted <= 0) continue;
    if (APPLY) {
      await prisma.shipment.update({
        where: { id: s.id },
        data: { courierChargeCollected: new Prisma.Decimal(quoted), courierChargeUpdatedAt: new Date() },
      });
    }
    collectedUpdated++;
  }
  console.log(`${APPLY ? 'Updated' : 'Would update'} Shipment.courierChargeCollected on ${collectedUpdated} shipment(s).`);

  if (!APPLY) {
    console.log('\nRe-run with --apply to write these changes.');
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
