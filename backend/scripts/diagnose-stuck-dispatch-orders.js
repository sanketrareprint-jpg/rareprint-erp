/**
 * diagnose-stuck-dispatch-orders.js
 *
 * WHY THIS EXISTS
 * ----------------
 * "Orders aren't moving forward from READY_FOR_DISPATCH" was reported, but a
 * full code review of the pipeline (production.service.ts item-stage rollup,
 * orders.service.ts submit-dispatch-batch, accounts.service.ts approveDispatch,
 * dispatch.service.ts assertCanDispatch/bookItems/getRates, bigship.service.ts
 * booking + sync) found no single logic bug that would silently strand every
 * order — the code is internally consistent and has fallbacks at each step
 * (e.g. getRates always falls back to local offline rates if Bigship AND
 * Shiprocket both fail).
 *
 * That means the real cause is order-specific and lives in the data, not the
 * code — could be any of several different things, each with a different fix:
 *
 *   1. Order is READY_FOR_DISPATCH but has never been through the mandatory
 *      Sales-submits → Accounts-approves loop (assertCanDispatch requires a
 *      StatusLog: PENDING_DISPATCH_APPROVAL → READY_FOR_DISPATCH to exist
 *      before the Dispatch team can even book it). If nobody's submitting or
 *      approving, it just sits there — looks identical to a bug from the
 *      Dispatch team's side.
 *   2. Order IS approved/bookable but nobody has clicked "Book" yet.
 *   3. A shipment WAS booked into Bigship (draft order created) but nobody
 *      has gone into Bigship's own dashboard to hit "Ship Now" — the ERP
 *      deliberately does not auto-manifest (see bigship.service.ts comment,
 *      change dated 2026-08-04), so this step is 100% manual and easy to
 *      forget.
 *   4. Bigship/Shiprocket credentials are missing or broken, so nobody can
 *      even get a rate quote (this would fall back to local/offline rates,
 *      so it wouldn't fully block booking, but it's worth ruling out).
 *
 * This script sorts every currently-stuck order into one of those buckets
 * using real production data, so you know exactly which fix applies instead
 * of guessing.
 *
 * HOW TO RUN
 * ----------
 *   cd backend
 *   node scripts/diagnose-stuck-dispatch-orders.js
 *
 * Needs DATABASE_URL in backend/.env (already there) — run this from your
 * own machine, not inside a sandboxed/offline environment, since it needs a
 * real connection to the Railway Postgres instance.
 */

// Load DATABASE_URL from backend/.env when it's not already in the environment
// (e.g. running this by hand with `node scripts/...js` instead of through the
// app, which normally gets its env from Railway). No dotenv dependency needed —
// just enough parsing to pull KEY=VALUE lines out of the file.
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

// Prisma ORM v7 removed the `url` field from schema.prisma's datasource block —
// PrismaClient now needs a driver adapter passed explicitly. Same pattern as
// backend/src/prisma/prisma.service.ts.
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function daysAgo(date) {
  return ((Date.now() - new Date(date).getTime()) / 86400000).toFixed(1);
}

async function main() {
  const orders = await prisma.order.findMany({
    where: { status: { in: ['READY_FOR_DISPATCH', 'PARTIALLY_DISPATCHED'] } },
    include: {
      customer: { select: { businessName: true } },
      items: { select: { id: true, itemProductionStage: true } },
      statusLogs: {
        select: { fromStatus: true, toStatus: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      },
      shipments: {
        select: {
          id: true, status: true, createdAt: true, dispatchDate: true,
          awbNumber: true, trackingNumber: true,
        },
        orderBy: { createdAt: 'desc' },
      },
      salesAgent: { select: { id: true, fullName: true, isActive: true, role: true } },
    },
    orderBy: { updatedAt: 'asc' }, // oldest-stuck first
  });

  console.log(`\nFound ${orders.length} order(s) currently in READY_FOR_DISPATCH / PARTIALLY_DISPATCHED.\n`);

  const buckets = {
    noReadyItems: [],
    missingApprovalLog: [],
    approvedNoShipment: [],
    shipmentStuckUnmanifested: [],
    other: [],
  };

  for (const o of orders) {
    const readyItems = o.items.filter((i) => i.itemProductionStage === 'READY_FOR_DISPATCH');
    const hasApprovalLog = o.statusLogs.some(
      (l) => l.fromStatus === 'PENDING_DISPATCH_APPROVAL' && l.toStatus === 'READY_FOR_DISPATCH',
    );
    const latestShipment = o.shipments[0];

    const row = {
      orderNo: o.orderNumber,
      customer: o.customer?.businessName ?? '—',
      isSample: o.isSample,
      status: o.status,
      readyItems: readyItems.length,
      totalItems: o.items.length,
      hasApprovalLog,
      daysSinceUpdate: daysAgo(o.updatedAt),
      salesAgent: o.salesAgent
        ? `${o.salesAgent.fullName}${o.salesAgent.isActive ? '' : ' [INACTIVE]'}`
        : 'NONE (unassigned)',
      latestShipment: latestShipment
        ? { status: latestShipment.status, awb: latestShipment.awbNumber, daysSinceBooked: daysAgo(latestShipment.createdAt) }
        : null,
    };

    if (readyItems.length === 0) {
      buckets.noReadyItems.push(row);
    } else if (!o.isSample && !hasApprovalLog) {
      buckets.missingApprovalLog.push(row);
    } else if (!latestShipment) {
      buckets.approvedNoShipment.push(row);
    } else if (latestShipment.status === 'PACKED' && !latestShipment.awbNumber) {
      buckets.shipmentStuckUnmanifested.push(row);
    } else {
      buckets.other.push(row);
    }
  }

  const print = (label, rows, hint) => {
    console.log(`\n── ${label} (${rows.length}) ──`);
    console.log(`   ${hint}`);
    for (const r of rows.slice(0, 25)) {
      const extra = r.latestShipment
        ? ` | shipment=${r.latestShipment.status} awb=${r.latestShipment.awb ?? 'none'} booked ${r.latestShipment.daysSinceBooked}d ago`
        : '';
      console.log(`   ${r.orderNo}  ${r.customer}  agent=${r.salesAgent}  ready=${r.readyItems}/${r.totalItems}  idle ${r.daysSinceUpdate}d${extra}`);
    }
    if (rows.length > 25) console.log(`   ... and ${rows.length - 25} more`);
  };

  print(
    'Missing dispatch approval (Sales/Accounts step never happened)',
    buckets.missingApprovalLog,
    'FIX: sales agent must submit dispatch details, then Accounts must click "Approve" — order can\'t be booked until then.',
  );
  if (buckets.missingApprovalLog.length > 0) {
    const byAgent = {};
    for (const r of buckets.missingApprovalLog) byAgent[r.salesAgent] = (byAgent[r.salesAgent] ?? 0) + 1;
    console.log('   ── by sales agent ──');
    for (const [agent, count] of Object.entries(byAgent).sort((a, b) => b[1] - a[1])) {
      console.log(`   ${agent}: ${count}`);
    }
  }
  print(
    'Approved & bookable, but no shipment booked yet',
    buckets.approvedNoShipment,
    'FIX: dispatch team needs to open Dispatch > Ready for Dispatch and click Book for these.',
  );
  print(
    'Shipment booked into Bigship, but not manifested (no AWB)',
    buckets.shipmentStuckUnmanifested,
    'FIX: go into Bigship\'s own dashboard > Unshipped tab, click "Ship Now" to pick a courier and generate the AWB, then Sync Bigship in the ERP.',
  );
  print(
    'No ready items (shouldn\'t be in this status — data inconsistency)',
    buckets.noReadyItems,
    'FIX: check these individually — order status says ready but no item is actually at READY_FOR_DISPATCH stage.',
  );
  print('Other / already has an active shipment', buckets.other, 'Likely fine — has a shipment already moving (IN_TRANSIT etc).');

  // ── Is the Sales-submit → Accounts-approve loop being used AT ALL? ────────
  // The bucket above only looks at orders currently stuck at READY_FOR_DISPATCH.
  // This checks the full history: has anyone ever clicked "Submit for dispatch"
  // (→ PENDING_DISPATCH_APPROVAL), and separately, has Accounts ever clicked
  // "Approve" (PENDING_DISPATCH_APPROVAL → READY_FOR_DISPATCH)? If submits
  // exist but approvals don't, the ball is in Accounts' court. If submits
  // don't exist at all, agents likely can't find/use the submit action.
  const [everSubmitted, everApproved, currentlyPendingApproval] = await Promise.all([
    prisma.statusLog.count({ where: { toStatus: 'PENDING_DISPATCH_APPROVAL' } }),
    prisma.statusLog.count({ where: { fromStatus: 'PENDING_DISPATCH_APPROVAL', toStatus: 'READY_FOR_DISPATCH' } }),
    prisma.order.count({ where: { status: 'PENDING_DISPATCH_APPROVAL' } }),
  ]);
  console.log('\n── Is the Sales-submit → Accounts-approve loop being used? ──');
  console.log(`   Orders ever submitted for dispatch (→ PENDING_DISPATCH_APPROVAL): ${everSubmitted}`);
  console.log(`   Orders ever approved by Accounts (PENDING_DISPATCH_APPROVAL → READY_FOR_DISPATCH): ${everApproved}`);
  console.log(`   Orders sitting in PENDING_DISPATCH_APPROVAL right now (submitted, awaiting Accounts): ${currentlyPendingApproval}`);
  if (everSubmitted === 0) {
    console.log('   → Nobody has ever clicked "Submit for dispatch". Look at the Sales/Orders side first.');
  } else if (currentlyPendingApproval > 0 && everApproved === 0) {
    console.log('   → Submits are happening but Accounts has never approved one. Look at the Accounts approval queue first.');
  }

  console.log('\n── Carrier config sanity check ──');
  console.log(`   BIGSHIP_USERNAME set: ${!!process.env.BIGSHIP_USERNAME}`);
  console.log(`   BIGSHIP_PASSWORD set: ${!!process.env.BIGSHIP_PASSWORD}`);
  console.log(`   BIGSHIP_ACCESS_KEY set: ${!!process.env.BIGSHIP_ACCESS_KEY}`);
  console.log(`   BIGSHIP_PICKUP_WAREHOUSE_ID: ${process.env.BIGSHIP_PICKUP_WAREHOUSE_ID ?? '(not set)'}`);
  console.log('');
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
