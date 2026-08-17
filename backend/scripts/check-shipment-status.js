/**
 * check-shipment-status.js
 *
 * Prints everything the ERP currently knows about an order's latest
 * shipment — local status, Bigship's last-synced raw status, and the
 * reconciled status from an uploaded Shipping Charges report. Use this to
 * see exactly why a shipment is or isn't showing in Dispatch > Courier
 * Charges (that list excludes a row only if one of these three says
 * "cancel" — see listCourierCharges in dispatch.service.ts).
 *
 * HOW TO RUN (from your own machine, needs real DATABASE_URL to Railway):
 *   cd backend
 *   node scripts/check-shipment-status.js 1331
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

const orderNumberArg = process.argv[2];

async function main() {
  if (!orderNumberArg) {
    console.error('Usage: node scripts/check-shipment-status.js <orderNumber>');
    process.exitCode = 1;
    return;
  }

  const order = await prisma.order.findUnique({
    where: { orderNumber: orderNumberArg },
    include: { shipments: { orderBy: { createdAt: 'desc' } } },
  });

  if (!order) {
    console.error(`Order ${orderNumberArg} not found.`);
    process.exitCode = 1;
    return;
  }

  console.log(`Order ${order.orderNumber}  status: ${order.status}  isTest: ${order.isTest}`);
  console.log(`Shipments: ${order.shipments.length}`);

  for (const s of order.shipments) {
    console.log(`\n  shipment ${s.id}`);
    console.log(`    local status:      ${s.status}`);
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

  console.log('\nIf none of the above says "cancel" in any form, the ERP genuinely does not know this shipment was cancelled yet.');
  console.log('Fix: open Dispatch > History, find this order, click "Sync Bigship" to pull the live status from Bigship directly.');
  console.log('If it does not appear in History either, its local status has already moved past PACKED/IN_TRANSIT — check order.status above.');
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
