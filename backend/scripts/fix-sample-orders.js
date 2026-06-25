// Moves existing sample kit orders from PENDING_APPROVAL → READY_FOR_DISPATCH
// so they appear in the Dispatch queue immediately.
// Run once: node scripts/fix-sample-orders.js

const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres:cpwyjHacUIgnKYAgZqHSqSGOmMjfqqYc@monorail.proxy.rlwy.net:46355/railway'
});

async function main() {
  await client.connect();

  // Find sample orders still in PENDING_APPROVAL
  const { rows: orders } = await client.query(`
    SELECT id, "orderNumber", status, "grandTotal"
    FROM "Order"
    WHERE "isSample" = true AND status = 'PENDING_APPROVAL'
  `);

  if (orders.length === 0) {
    console.log('✅ No sample orders stuck in PENDING_APPROVAL');
    await client.end();
    return;
  }

  console.log(`Found ${orders.length} sample order(s) to fix:`, orders.map(o => o.orderNumber));

  for (const order of orders) {
    // Update order status
    await client.query(`
      UPDATE "Order"
      SET status = 'READY_FOR_DISPATCH',
          "samplePaymentType" = 'COD'
      WHERE id = $1
    `, [order.id]);

    // Update all order items
    await client.query(`
      UPDATE "OrderItem"
      SET "itemProductionStage" = 'READY_FOR_DISPATCH'
      WHERE "orderId" = $1
    `, [order.id]);

    // Log the change
    await client.query(`
      INSERT INTO "StatusLog" (id, "orderId", "fromStatus", "toStatus", "changedById", reason, "createdAt")
      VALUES (gen_random_uuid(), $1, 'PENDING_APPROVAL', 'READY_FOR_DISPATCH', 'system', 'Sample kit — moved directly to dispatch (backfill)', NOW())
    `, [order.id]);

    console.log(`✅ Fixed order ${order.orderNumber}`);
  }

  await client.end();
  console.log('Done.');
}

main().catch(e => { console.error('❌', e.message); client.end(); });
