/**
 * mark-shipment-cancelled.js
 *
 * One-time manual correction: mark a shipment CANCELLED when Sanket has
 * independently confirmed (e.g. courier's own dashboard, refund/credit
 * notification) that a parcel was cancelled, but the ERP's cached data
 * (local status / last Bigship sync / uploaded Shipping Charges report)
 * doesn't yet reflect that — see check-shipment-status.js for the
 * diagnostic that showed the mismatch on order 1331 (local status
 * DELIVERED, but bigshipStatus last synced as "Pickup Scheduled", no
 * report match).
 *
 * This ONLY touches the shipment (status -> CANCELLED, notes annotated).
 * It deliberately does NOT change Order.status — that's a separate
 * business decision (was it actually delivered some other way?) that
 * wasn't asked for here. Once status = CANCELLED, both
 * listCourierCharges() and getMonthlyCourierProfitSummary() already
 * exclude it (pre-existing `status: { not: CANCELLED }` filter), so it
 * drops out of Dispatch > Courier Charges and the Dashboard courier
 * profit rollup immediately.
 *
 * HOW TO RUN (from your own machine, needs real DATABASE_URL to Railway):
 *   cd backend
 *   node scripts/mark-shipment-cancelled.js 1331           # dry run
 *   node scripts/mark-shipment-cancelled.js 1331 --apply    # actually fix
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

const { PrismaClient, ShipmentStatus } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const orderNumberArg = process.argv[2];
const apply = process.argv.includes('--apply');

async function main() {
  if (!orderNumberArg) {
    console.error('Usage: node scripts/mark-shipment-cancelled.js <orderNumber> [--apply]');
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

  const shipment = order.shipments[0];
  if (!shipment) {
    console.error(`Order ${orderNumberArg} has no shipment.`);
    process.exitCode = 1;
    return;
  }

  console.log(`Order ${order.orderNumber}  order.status: ${order.status} (left untouched by this script)`);
  console.log(`Shipment ${shipment.id}`);
  console.log(`  current status: ${shipment.status}`);
  console.log(`  awbNumber:      ${shipment.awbNumber ?? '(none)'}`);
  console.log(`  bigshipStatus:  ${shipment.bigshipStatus ?? '(never synced)'}`);

  if (shipment.status === ShipmentStatus.CANCELLED) {
    console.log('\nAlready CANCELLED — nothing to do.');
    return;
  }

  console.log(`\n${apply ? 'Marking' : 'Would mark'} this shipment CANCELLED (manual correction).`);
  if (!apply) {
    console.log('Re-run with --apply to make the change.');
    return;
  }

  const note = `[${new Date().toISOString()}] Manually marked CANCELLED by Sanket — parcel was cancelled and amount credited back; ERP's cached status (${shipment.status}, bigshipStatus="${shipment.bigshipStatus ?? 'none'}") was stale/incorrect.`;
  await prisma.shipment.update({
    where: { id: shipment.id },
    data: {
      status: ShipmentStatus.CANCELLED,
      bigshipStatus: 'Cancelled (manually confirmed)',
      bigshipSyncedAt: new Date(),
      notes: shipment.notes ? `${shipment.notes}\n${note}` : note,
    },
  });
  console.log('\nDone. Refresh Dispatch > Courier Charges — this row should be gone.');
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
