/**
 * Read-only audit (makes NO changes): finds past Fship COD shipments where
 * the actual COD amount (parsed from the order's notes, same regex
 * dispatch.service.ts's dispatchPaymentInfo() uses) is LESS than the order
 * value that was sent to Fship as order_Amount/total_Amount at booking
 * time -- i.e. orders Fship would have told its delivery rider to collect
 * the full order value on, instead of the smaller actual COD amount.
 *
 * This is exactly the bug fixed in dispatch.service.ts today (see order
 * 1574) -- this script finds every OTHER order that shipped with the same
 * bug before the fix, so they can be corrected with Fship support or
 * refunded to the customer, whichever already happened.
 *
 * Orders where the parsed COD amount equals (or exceeds) the item value
 * are NOT affected -- there was nothing to overcharge in those cases -- so
 * they're excluded from the list.
 *
 * Run from the backend/ folder:
 *   node audit-fship-cod-mismatches.js
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

function dispatchPaymentInfo(notesRaw) {
  const notes = notesRaw ?? '';
  const notesIsCod = /\bCOD[:\s]/i.test(notes);
  const notesCodAmountMatch = notes.match(/COD(?:\s+amount)?:\s*₹?(\d+(?:\.\d+)?)/i);
  const notesCodAmount = notesCodAmountMatch ? Number(notesCodAmountMatch[1]) : null;
  return { isCod: notesIsCod, codAmount: notesIsCod ? notesCodAmount : null };
}

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    // Every shipment that actually went through Fship (fshipOrderId is only
    // set on a successful Fship booking -- see dispatch.service.ts).
    const shipments = await prisma.$queryRaw`
      SELECT s.id, s."shipmentNumber", s."fshipOrderId", s."awbNumber", s.status,
             s."dispatchDate", s."createdAt",
             o.id AS "orderId", o."orderNumber", o.notes, o."grandTotal",
             c."businessName", c.phone
      FROM "Shipment" s
      JOIN "Order" o ON o.id = s."orderId"
      JOIN "Customer" c ON c.id = o."customerId"
      WHERE s."fshipOrderId" IS NOT NULL
      ORDER BY s."createdAt" ASC
    `;

    console.log(`Checked ${shipments.length} Fship shipment(s).\n`);

    const affected = [];
    for (const s of shipments) {
      const { isCod, codAmount } = dispatchPaymentInfo(s.notes);
      if (!isCod || codAmount == null) continue;
      const orderValue = Number(s.grandTotal);
      // Only flag a real, meaningful shortfall -- not rounding noise.
      if (codAmount < orderValue - 0.5) {
        affected.push({ ...s, parsedCodAmount: codAmount, orderValue });
      }
    }

    if (affected.length === 0) {
      console.log('No affected orders found -- every Fship COD shipment on record already had a matching COD amount and order value.');
      return;
    }

    console.log(`=== ${affected.length} AFFECTED ORDER(S) -- likely overcharged via Fship COD ===\n`);
    for (const a of affected) {
      console.log(`Order ${a.orderNumber} — ${a.businessName} (${a.phone ?? 'no phone'})`);
      console.log(`  Should have collected: ₹${a.parsedCodAmount}   Fship was told to collect: ₹${a.orderValue}   Overcharge: ₹${(a.orderValue - a.parsedCodAmount).toFixed(2)}`);
      console.log(`  Shipment status: ${a.status}   AWB: ${a.awbNumber ?? '—'}   Fship order id: ${a.fshipOrderId}`);
      console.log(`  Dispatched: ${a.dispatchDate ? new Date(a.dispatchDate).toISOString() : '—'}`);
      console.log(`  Notes: ${a.notes}`);
      console.log();
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exitCode = 1;
});
