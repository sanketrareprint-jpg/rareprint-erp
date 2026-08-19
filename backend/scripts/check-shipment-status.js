/**
 * check-shipment-status.js
 *
 * Read-only diagnostic. Look up a shipment by order number, tracking
 * number, AWB, or internal shipment number, and print everything the ERP
 * currently knows about it -- local status, Bigship's last-synced raw
 * status, and the reconciled status from an uploaded Shipping Charges
 * report (if the shipment has an AWB). Use this to see exactly why a
 * shipment is or isn't showing in Dispatch > Courier Charges (that list
 * excludes a row only if one of these three says "cancel" -- see
 * listCourierCharges in dispatch.service.ts), or to confirm whether a
 * shipment that "vanished" from Dispatch > History (because it aged out of
 * the "most recent 100" window, not because anything broke) actually has
 * correct, up-to-date data.
 *
 * Makes NO changes to the database.
 *
 * HOW TO RUN (from your own machine, needs real DATABASE_URL to Railway):
 *   cd backend
 *   node scripts/check-shipment-status.js 1331
 *   node scripts/check-shipment-status.js 13090324486710
 */

if (!process.env.DATABASE_URL) {
  const fs = require('fs');
  const path = require('path');
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const needle = process.argv[2];

async function main() {
  if (!needle) {
    console.error('Usage: node scripts/check-shipment-status.js <orderNumber|trackingNumber|awbNumber|shipmentNumber>');
    process.exitCode = 1;
    return;
  }

  const shipments = await prisma.shipment.findMany({
    where: {
      OR: [
        { order: { orderNumber: { contains: needle, mode: 'insensitive' } } },
        { trackingNumber: { contains: needle, mode: 'insensitive' } },
        { awbNumber: { contains: needle, mode: 'insensitive' } },
        { shipmentNumber: { contains: needle, mode: 'insensitive' } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    include: { order: { select: { orderNumber: true, status: true, isTest: true, customer: { select: { businessName: true } } } } },
  });

  if (shipments.length === 0) {
    console.log(`No shipment found matching "${needle}".`);
    return;
  }

  for (const s of shipments) {
    console.log('─'.repeat(60));
    console.log(`Order ${s.order.orderNumber}  (${s.order.customer.businessName})  order status: ${s.order.status}  isTest: ${s.order.isTest}`);
    console.log(`  shipment ${s.id}`);
    console.log(`    local status:      ${s.status}`);
    console.log(`    createdAt:         ${s.createdAt.toISOString()}`);
    console.log(`    deliveredAt:       ${s.deliveredAt ? s.deliveredAt.toISOString() : '(none)'}`);
    console.log(`    carrierName:       ${s.carrierName ?? '(none)'}`);
    console.log(`    trackingNumber:    ${s.trackingNumber ?? '(none)'}`);
    console.log(`    awbNumber:         ${s.awbNumber ?? '(none)'}`);
    console.log(`    bigshipOrderId:    ${s.bigshipOrderId ?? '(none)'}`);
    console.log(`    bigshipStatus:     ${s.bigshipStatus ?? '(never synced)'}`);
    console.log(`    bigshipSyncedAt:   ${s.bigshipSyncedAt ? s.bigshipSyncedAt.toISOString() : '(never)'}`);

    if (s.awbNumber) {
      const normalized = s.awbNumber.trim().toUpperCase();
      const record = await prisma.shippingChargeRecord.findFirst({
        where: { awbNumber: { equals: normalized, mode: 'insensitive' } },
      });
      console.log(`    Shipping Charges report row: ${record ? `orderStatus="${record.orderStatus}", totalCharges=${record.totalCharges}` : '(no matching AWB in any uploaded report)'}`);
    }
  }

  console.log('─'.repeat(60));
  console.log('If none of the above says "cancel"/"deliver"/"rto" in any form and you expected it to, the ERP genuinely does not have that update yet.');
  console.log('Fix: open Dispatch > History, search for this order/tracking number (now searches the full table, not just the last 100), and click "Sync Bigship".');
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
