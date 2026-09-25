/**
 * Diagnostic (read-only, makes NO changes): find every order at status
 * DISPATCHED that still has an item at itemProductionStage=READY_FOR_DISPATCH
 * with no dispatchedAt -- i.e. every order the new resolveLockedItemIds
 * DISPATCHED-fallback logic (orders.service.ts) has to make a call on -- and
 * print exactly what that logic would decide for each one, so we can see
 * whether the shipment-timestamp cutoff is actually working against real
 * data, or whether something about this DB's history (e.g. the "migrate dev
 * --accept-data-loss" incident / rebuild) breaks the createdAt comparison.
 *
 * Schema-drift note: same as the other diagnose-order-*.js scripts in this
 * folder, uses raw SQL via PrismaPg to avoid the typed client trying to
 * select not-yet-migrated columns.
 *
 * Run from the backend/ folder:
 *   node diagnose-ready-for-dispatch-dispatched.js
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const orders = await prisma.$queryRaw`
      SELECT o.id AS "orderId", o."orderNumber" AS "orderNumber", o.status AS "status",
             o."pendingDispatchItemIds" AS "pendingDispatchItemIds"
      FROM "Order" o
      WHERE o.status = 'DISPATCHED'
        AND EXISTS (
          SELECT 1 FROM "OrderItem" oi
          WHERE oi."orderId" = o.id
            AND oi."itemProductionStage" = 'READY_FOR_DISPATCH'
            AND oi."dispatchedAt" IS NULL
        )
      ORDER BY o."orderNumber" ASC
    `;

    console.log(`Found ${orders.length} DISPATCHED order(s) with a READY_FOR_DISPATCH item that has no dispatchedAt.\n`);

    for (const order of orders) {
      const items = await prisma.$queryRaw`
        SELECT id, "itemProductionStage" AS "stage", "dispatchedAt", "createdAt"
        FROM "OrderItem"
        WHERE "orderId" = ${order.orderId}
        ORDER BY "createdAt" ASC
      `;
      const shipments = await prisma.$queryRaw`
        SELECT id, "shipmentNumber", "createdAt", "dispatchDate"
        FROM "Shipment"
        WHERE "orderId" = ${order.orderId}
        ORDER BY "createdAt" DESC
      `;
      const latestShipmentCreatedAt = shipments[0]?.createdAt ?? null;
      const pendingIds = Array.isArray(order.pendingDispatchItemIds) ? order.pendingDispatchItemIds : [];

      console.log(`=== Order ${order.orderNumber} (${order.orderId}) ===`);
      console.log(`  pendingDispatchItemIds: ${JSON.stringify(pendingIds)}`);
      console.log(`  shipments: ${shipments.length} — latest.createdAt = ${latestShipmentCreatedAt ? latestShipmentCreatedAt.toISOString() : 'NONE'}`);
      if (shipments.length > 0) {
        for (const s of shipments) {
          console.log(`    - ${s.shipmentNumber}  createdAt=${s.createdAt.toISOString()}  dispatchDate=${s.dispatchDate ? s.dispatchDate.toISOString() : 'null'}`);
        }
      }
      // Mirrors the FIXED resolveLockedItemIds (orders.service.ts, 2026-09-17
      // round 3): for DISPATCHED orders, pendingDispatchItemIds no longer
      // short-circuits the whole item list -- it's unioned with the
      // shipment-cutoff check, so an item not in pendingDispatchItemIds still
      // gets locked if it predates the latest shipment.
      for (const i of items) {
        const explicitlyPending = pendingIds.includes(i.id);
        let locked = explicitlyPending;
        let reason = explicitlyPending ? 'in pendingDispatchItemIds' : '';
        if (!locked) {
          if (!latestShipmentCreatedAt) {
            locked = true;
            reason = 'no shipment record at all -> conservative lock-everything';
          } else if (i.createdAt <= latestShipmentCreatedAt) {
            locked = true;
            reason = `createdAt ${i.createdAt.toISOString()} <= shipment ${latestShipmentCreatedAt.toISOString()}`;
          } else {
            reason = `createdAt ${i.createdAt.toISOString()} > shipment ${latestShipmentCreatedAt.toISOString()}`;
          }
        }
        const cutoffApplies = i.stage === 'READY_FOR_DISPATCH' && !i.dispatchedAt;
        const verdict = !cutoffApplies
          ? 'n/a (not a bare ready+undispatched item)'
          : locked
            ? `LOCKED (${reason})`
            : `FREE / SHOWS (${reason})`;
        console.log(`  item ${i.id}: stage=${i.stage} dispatchedAt=${i.dispatchedAt ?? 'null'} createdAt=${i.createdAt.toISOString()} -> ${verdict}`);
      }
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
