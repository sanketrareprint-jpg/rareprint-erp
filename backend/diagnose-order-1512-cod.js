/**
 * Read-only diagnostic for order 1512's Fship COD-amount bug report.
 *
 * Prints: order.notes (raw), grandTotal, verified payments received,
 * what dispatchPaymentInfo() in dispatch.service.ts would compute
 * (isCod / codAmount -- the exact regex-based logic that also feeds the
 * "COD ₹X" badge on the Dispatch/Orders pages and what's sent to Fship's
 * cod_Amount field at booking time), and any Shipment record(s) already
 * created for this order (carrier, AWB, notes, courierChargeActual).
 *
 * Makes NO changes -- purely read-only, for tracing the bug before fixing
 * anything.
 *
 * Uses raw SQL (not the generated Prisma model client) because this repo's
 * schema.prisma currently has an unapplied migration (tenantId rollout)
 * that the live database doesn't have yet -- see the sticker-sheet-gap
 * session's earlier notes on this. Raw SQL sidesteps that entirely.
 *
 * Run from the backend/ folder:
 *   node diagnose-order-1512-cod.js
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const ORDER_NUMBER = '1512';

// Exact same regex dispatch.service.ts's private dispatchPaymentInfo() uses.
function dispatchPaymentInfo(notesRaw, grandTotal, paidTotal) {
  const notes = notesRaw ?? '';
  const notesIsCod = /\bCOD[:\s]/i.test(notes);
  const notesCodAmountMatch = notes.match(/COD(?:\s+amount)?:\s*₹?(\d+(?:\.\d+)?)/i);
  const notesCodAmount = notesCodAmountMatch ? Number(notesCodAmountMatch[1]) : null;
  const balanceDue = Math.max(0, grandTotal - paidTotal);
  const balanceAmount = balanceDue > 0.5 ? Math.ceil(balanceDue) : 0;
  const isCod = notesIsCod;
  const codAmount = isCod ? notesCodAmount : null;
  return { isCod, codAmount, balanceDue: balanceAmount };
}

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const orders = await prisma.$queryRaw`
      SELECT id, "orderNumber", notes, "grandTotal"
      FROM "Order"
      WHERE "orderNumber" = ${ORDER_NUMBER}
    `;
    if (orders.length === 0) {
      console.log(`Order ${ORDER_NUMBER} not found.`);
      return;
    }
    const order = orders[0];
    const grandTotal = Number(order.grandTotal);

    const payments = await prisma.$queryRaw`
      SELECT amount, "verificationStatus"
      FROM "Payment"
      WHERE "orderId" = ${order.id} AND "verificationStatus" = 'VERIFIED'
    `;
    const paidTotal = payments.reduce((sum, p) => sum + Number(p.amount), 0);

    console.log('--- Order ---');
    console.log('orderNumber:', order.orderNumber);
    console.log('grandTotal:', grandTotal);
    console.log('verified payments total:', paidTotal);
    console.log('notes (raw):');
    console.log(JSON.stringify(order.notes));

    const info = dispatchPaymentInfo(order.notes, grandTotal, paidTotal);
    console.log('\n--- What dispatchPaymentInfo() computes (feeds the COD badge + what gets sent to Fship as cod_Amount) ---');
    console.log(info);
    console.log('\nWhat would actually be sent to Fship if booked right now:');
    console.log({
      payment_Mode: info.isCod ? 'COD (1)' : 'PREPAID (2)',
      cod_Amount: info.isCod ? (info.codAmount ?? 0) : 0,
      order_Amount_and_total_Amount: '(dispatchItemsValue -- sum of dispatched items\' lineTotal, i.e. full item value)',
    });

    const shipments = await prisma.$queryRaw`
      SELECT "shipmentNumber", "carrierName", status, "trackingNumber", "awbNumber",
             "transportChargesType", "courierChargeActual", notes, "createdAt"
      FROM "Shipment"
      WHERE "orderId" = ${order.id}
      ORDER BY "createdAt" DESC
    `;
    console.log('\n--- Shipment record(s) for this order ---');
    if (shipments.length === 0) {
      console.log('(none found)');
    } else {
      for (const s of shipments) console.log(s);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exitCode = 1;
});
