/**
 * backfill-bigship-status-delivered.js
 *
 * One-time bulk correction for the same root cause as the single-order fix
 * in mark-shipment-cancelled.js: markDelivered() (Dispatch > History "Delivered"
 * button, and the bulk "Delivered Orders Report" CSV import that calls it in a
 * loop) only ever updated Shipment.status/deliveredAt -- it never touched
 * bigshipStatus, the field Dispatch actually displays as "Live status as
 * reported by Bigship". Since the Sync button that would normally refresh
 * that field is only shown for PACKED/IN_TRANSIT shipments (and disappears
 * once status flips to DELIVERED), every shipment marked delivered before
 * this fix landed is stuck showing whatever bigshipStatus was last captured
 * at booking time -- usually "Pickup Scheduled" -- even though it's actually
 * delivered. That's the exact mismatch reported 2026-08-19 (screenshot showed
 * green "Delivered" badges sitting next to a stale "Pickup Scheduled" column
 * for orders dated 13-17 Aug).
 *
 * markDelivered() itself is now fixed going forward (dispatch.service.ts) --
 * this script is only for the shipments that were already marked delivered
 * before that fix shipped.
 *
 * Scope: only touches Shipment.bigshipStatus / bigshipSyncedAt. Does not
 * touch status, deliveredAt, Order, or any financial data.
 *
 * HOW TO RUN (from your own machine, needs real DATABASE_URL to Railway):
 *   cd backend
 *   node scripts/backfill-bigship-status-delivered.js           # dry run
 *   node scripts/backfill-bigship-status-delivered.js --apply    # actually fix
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

const apply = process.argv.includes('--apply');

async function main() {
  // Filtered in plain JS below instead of in the Prisma query -- Prisma's
  // nested `not: { contains, mode: 'insensitive' }` filter doesn't accept
  // `mode` (that's only valid on a top-level string filter, not inside a
  // nested `not`), which threw PrismaClientValidationError on first run.
  // Simpler and just as correct to pull the (small) DELIVERED+Bigship set
  // and filter case-insensitively here.
  const delivered = await prisma.shipment.findMany({
    where: {
      status: ShipmentStatus.DELIVERED,
      bigshipOrderId: { not: null },
    },
    include: { order: { select: { orderNumber: true } } },
    orderBy: { deliveredAt: 'desc' },
  });
  const candidates = delivered.filter(
    (s) => !s.bigshipStatus || !s.bigshipStatus.toLowerCase().includes('deliver'),
  );

  if (candidates.length === 0) {
    console.log('No stale bigshipStatus rows found — nothing to do.');
    return;
  }

  console.log(`Found ${candidates.length} DELIVERED shipment(s) with a stale/missing bigshipStatus:\n`);
  for (const s of candidates) {
    console.log(`  Order ${s.order.orderNumber}  shipment ${s.id}  bigshipStatus was: "${s.bigshipStatus ?? '(none)'}"`);
  }

  if (!apply) {
    console.log('\nDry run only — re-run with --apply to update these to "Delivered".');
    return;
  }

  console.log('\nApplying...');
  const now = new Date();
  const result = await prisma.shipment.updateMany({
    where: { id: { in: candidates.map((s) => s.id) } },
    data: { bigshipStatus: 'Delivered', bigshipSyncedAt: now },
  });
  console.log(`Done — updated ${result.count} shipment(s).`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
