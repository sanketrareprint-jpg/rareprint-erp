/**
 * Diagnostic (read-only, makes NO changes): for a specific list of order
 * numbers seen on the main Orders page still showing item-level "Ready"
 * badges despite being 30-80+ days old, print each order's ACTUAL status,
 * every item's itemProductionStage/dispatchedAt, and shipment history --
 * to confirm whether they've truly already been dispatched/delivered (the
 * "Ready" badge just reflects a production-stage field that never resets
 * after shipment) or whether something is genuinely stuck.
 *
 * Run from the backend/ folder:
 *   node diagnose-orders-page-status-check.js
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const ORDER_NUMBERS = [1506, 1475, 1464, 1463, 1450, 1436, 1379, 1368, 1304];

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    for (const orderNumber of ORDER_NUMBERS) {
      const orders = await prisma.$queryRaw`
        SELECT id, "orderNumber", status, "pendingDispatchItemIds", "createdAt"
        FROM "Order"
        WHERE "orderNumber" = ${orderNumber}
      `;
      if (orders.length === 0) {
        console.log(`=== Order ${orderNumber}: NOT FOUND ===\n`);
        continue;
      }
      const order = orders[0];
      const items = await prisma.$queryRaw`
        SELECT id, "itemProductionStage" AS stage, "dispatchedAt", "createdAt"
        FROM "OrderItem"
        WHERE "orderId" = ${order.id}
        ORDER BY "createdAt" ASC
      `;
      const shipments = await prisma.$queryRaw`
        SELECT "shipmentNumber", status, "createdAt", "dispatchDate"
        FROM "Shipment"
        WHERE "orderId" = ${order.id}
        ORDER BY "createdAt" DESC
      `;

      console.log(`=== Order ${order.orderNumber} (${order.id}) ===`);
      console.log(`  status: ${order.status}`);
      console.log(`  pendingDispatchItemIds: ${JSON.stringify(order.pendingDispatchItemIds)}`);
      console.log(`  shipments: ${shipments.length}`);
      for (const s of shipments) {
        console.log(`    - ${s.shipmentNumber} status=${s.status} createdAt=${s.createdAt.toISOString()} dispatchDate=${s.dispatchDate ? s.dispatchDate.toISOString() : 'null'}`);
      }
      for (const i of items) {
        console.log(`  item ${i.id}: stage=${i.stage} dispatchedAt=${i.dispatchedAt ? i.dispatchedAt.toISOString() : 'null'}`);
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
