/**
 * One-time correction script: order 1521's ENVELOPE line item had its
 * itemProductionStage set to READY_FOR_DISPATCH (shows as "Ready" in the
 * Orders/Production UI) by an accidental click on the Production page's
 * Stage dropdown, even though the item has not actually been printed.
 *
 * IMPORTANT: this repo's schema.prisma has an unapplied migration
 * (20260907140000_add_tenant_id_rollout) that adds a required `tenantId`
 * column to Order/OrderItem/StatusLog. That column does NOT exist yet in
 * the live production database (confirmed: normal Prisma calls through
 * the generated client fail with "column Order.tenantId does not exist"),
 * so this script talks to the DB entirely via raw SQL naming only the
 * columns that predate that migration, instead of going through the
 * generated Prisma model client (which would try to select tenantId too).
 *
 * What it does:
 *  1. Reads order 1521's non-cancelled ENVELOPE item.
 *  2. Only if its itemProductionStage is currently READY_FOR_DISPATCH,
 *     resets it to NOT_PRINTED.
 *  3. Best-effort: writes a matching StatusLog journal entry (same shape
 *     as a normal Production-page stage change). If that insert fails for
 *     any reason, the core fix above still stands -- this step is purely
 *     cosmetic (order-journey history) and is not allowed to block it.
 *
 * Run from the backend/ folder:
 *   node fix-order-1521-envelope-stage.js
 */
require('dotenv').config();
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const ORDER_NUMBER = '1521';
const PRODUCT_NAME_MATCH = 'ENVELOPE';

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const rows = await prisma.$queryRaw`
      SELECT
        o.id AS "orderId",
        o.status AS "orderStatus",
        oi.id AS "itemId",
        oi."itemProductionStage" AS "itemProductionStage",
        oi."productionCategory" AS "productionCategory",
        p.name AS "productName"
      FROM "Order" o
      JOIN "OrderItem" oi ON oi."orderId" = o.id
      JOIN "Product" p ON p.id = oi."productId"
      WHERE o."orderNumber" = ${ORDER_NUMBER}
        AND oi."cancelledAt" IS NULL
    `;

    if (rows.length === 0) {
      console.log(`Order ${ORDER_NUMBER} not found (or has no non-cancelled items).`);
      return;
    }

    const item = rows.find((r) => r.productName.toUpperCase().includes(PRODUCT_NAME_MATCH));
    if (!item) {
      console.log(`No non-cancelled item matching "${PRODUCT_NAME_MATCH}" found on order ${ORDER_NUMBER}.`);
      console.log('Items on this order:', rows.map((r) => r.productName));
      return;
    }

    console.log(`Order ${ORDER_NUMBER} — item "${item.productName}" (id ${item.itemId})`);
    console.log(`Current itemProductionStage: ${item.itemProductionStage}`);

    if (item.itemProductionStage !== 'READY_FOR_DISPATCH') {
      console.log('Stage is no longer READY_FOR_DISPATCH -- nothing to do. Exiting without changes.');
      return;
    }

    const updated = await prisma.$executeRaw`
      UPDATE "OrderItem"
      SET "itemProductionStage" = 'NOT_PRINTED'::"OrderProductionStage",
          "updatedAt" = NOW()
      WHERE id = ${item.itemId}
        AND "itemProductionStage" = 'READY_FOR_DISPATCH'::"OrderProductionStage"
    `;

    if (updated !== 1) {
      console.log(`Unexpected: update affected ${updated} rows (expected 1). Stopping -- please check manually.`);
      return;
    }
    console.log('itemProductionStage reset to NOT_PRINTED.');

    try {
      const logId = crypto.randomUUID();
      await prisma.$executeRaw`
        INSERT INTO "StatusLog" (id, "orderId", "fromStatus", "toStatus", "changedById", reason, metadata, "createdAt")
        VALUES (
          ${logId},
          ${item.orderId},
          ${item.orderStatus}::"OrderStatus",
          ${item.orderStatus}::"OrderStatus",
          NULL,
          ${`Item: ${item.productName} → Not Started (manual correction -- was marked Ready before printing had actually started)`},
          ${JSON.stringify({
            eventType: 'ITEM_STAGE_CHANGED',
            orderItemId: item.itemId,
            itemStage: 'NOT_PRINTED',
            productName: item.productName,
            productionCategory: item.productionCategory,
            correction: true,
          })}::jsonb,
          NOW()
        )
      `;
      console.log('Order journey entry added.');
    } catch (logErr) {
      console.warn('Note: could not write the order-journey log entry (core fix above still applied). Reason:', logErr.message);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exitCode = 1;
});
