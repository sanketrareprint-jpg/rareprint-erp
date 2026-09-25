/**
 * Diagnostic (read-only, makes NO changes): order 1574 (PALLAVI MEDICAL) was
 * dispatched via Fship with an actual COD amount of ₹300, but Fship ended up
 * charging/booking the full order amount instead.
 *
 * dispatch.service.ts's dispatchPaymentInfo() derives the COD amount by
 * regex-matching order.notes (there's no dedicated "COD amount" column on
 * Order) -- this script re-runs that EXACT regex against this order's real
 * notes text to see whether it actually resolved to 300, or fell through to
 * null/0 (which would explain a wrong amount reaching Fship on our side,
 * rather than Fship itself ignoring a correctly-sent cod_Amount).
 *
 * It also prints the order's grandTotal, item totals, and any Shipment /
 * StatusLog rows already recorded for this order's Fship booking, so we can
 * see the AWB and whatever was logged at booking time.
 *
 * Schema-drift note: same as the order-1521 script, this avoids Prisma's
 * typed model client (which would try to select the not-yet-migrated
 * tenantId column) by using raw SQL for every read.
 *
 * Run from the backend/ folder:
 *   node diagnose-order-1574-cod.js
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const ORDER_NUMBER = '1574';

// Exact copy of dispatch.service.ts's dispatchPaymentInfo() regex logic.
function dispatchPaymentInfo(notesRaw, grandTotal) {
  const notes = notesRaw ?? '';
  const notesIsCod = /\bCOD[:\s]/i.test(notes);
  const notesCodAmountMatch = notes.match(/COD(?:\s+amount)?:\s*₹?(\d+(?:\.\d+)?)/i);
  const notesCodAmount = notesCodAmountMatch ? Number(notesCodAmountMatch[1]) : null;
  const isCod = notesIsCod;
  const codAmount = isCod ? notesCodAmount : null;
  return { isCod, codAmount };
}

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const orders = await prisma.$queryRaw`
      SELECT o.id AS "orderId", o.notes AS "notes", o."grandTotal" AS "grandTotal",
             o.status AS "status", o."orderDate" AS "orderDate"
      FROM "Order" o
      WHERE o."orderNumber" = ${ORDER_NUMBER}
    `;
    if (orders.length === 0) {
      console.log(`Order ${ORDER_NUMBER} not found.`);
      return;
    }
    const order = orders[0];

    console.log('=== ORDER ===');
    console.log('id:', order.orderId);
    console.log('status:', order.status);
    console.log('grandTotal:', order.grandTotal?.toString?.() ?? order.grandTotal);
    console.log('notes (raw, exactly as stored):');
    console.log(JSON.stringify(order.notes));
    console.log();

    const { isCod, codAmount } = dispatchPaymentInfo(order.notes, order.grandTotal);
    console.log('=== dispatchPaymentInfo() RESULT (same logic used at booking time) ===');
    console.log('isCod:', isCod);
    console.log('codAmount parsed from notes:', codAmount);
    console.log();

    const items = await prisma.$queryRaw`
      SELECT p.name AS "productName", oi.quantity AS "quantity",
             oi."unitPrice" AS "unitPrice", oi."lineTotal" AS "lineTotal",
             oi."itemProductionStage" AS "itemProductionStage", oi."cancelledAt" AS "cancelledAt"
      FROM "OrderItem" oi JOIN "Product" p ON p.id = oi."productId"
      WHERE oi."orderId" = ${order.orderId}
    `;
    console.log('=== ORDER ITEMS ===');
    for (const i of items) {
      console.log(`${i.productName}: qty ${i.quantity} x ₹${i.unitPrice} = ₹${i.lineTotal}  [stage: ${i.itemProductionStage}]${i.cancelledAt ? ' CANCELLED' : ''}`);
    }
    console.log();

    const shipments = await prisma.$queryRaw`
      SELECT id, "shipmentNumber", "carrierName", "awbNumber", "trackingNumber",
             "fshipOrderId", "fshipStatus", "courierChargeActual", "courierChargeCollected",
             status, "dispatchDate", "createdAt"
      FROM "Shipment"
      WHERE "orderId" = ${order.orderId}
      ORDER BY "createdAt" ASC
    `;
    console.log('=== SHIPMENT RECORDS ===');
    if (shipments.length === 0) console.log('(none)');
    for (const s of shipments) {
      console.log(JSON.stringify(s, null, 2));
    }
    console.log();

    const logs = await prisma.$queryRaw`
      SELECT "createdAt", reason, metadata
      FROM "StatusLog"
      WHERE "orderId" = ${order.orderId}
        AND (reason ILIKE '%fship%' OR reason ILIKE '%dispatch%' OR reason ILIKE '%cod%')
      ORDER BY "createdAt" ASC
    `;
    console.log('=== RELEVANT STATUS LOG ENTRIES ===');
    if (logs.length === 0) console.log('(none)');
    for (const l of logs) {
      console.log(`[${l.createdAt.toISOString()}] ${l.reason}`);
      if (l.metadata) console.log('  metadata:', JSON.stringify(l.metadata));
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exitCode = 1;
});
