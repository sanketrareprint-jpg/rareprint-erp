const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres:cpwyjHacUIgnKYAgZqHSqSGOmMjfqqYc@monorail.proxy.rlwy.net:46355/railway'
});

async function main() {
  await client.connect();

  // Find order items for order #1275
  const items = await client.query(`
    SELECT oi.id, oi."itemProductionStage", o."orderNumber"
    FROM "OrderItem" oi
    JOIN "Order" o ON oi."orderId" = o.id
    WHERE o."orderNumber" = '1275'
  `);
  console.log('Order items for #1275:', items.rows);

  for (const item of items.rows) {
    // Delete job works for this item
    const del = await client.query(`DELETE FROM "JobWork" WHERE "orderItemId" = $1 RETURNING id, "poNumber"`, [item.id]);
    console.log(`Deleted ${del.rowCount} JobWork(s):`, del.rows);

    // Reset production stage to NOT_PRINTED
    await client.query(`UPDATE "OrderItem" SET "itemProductionStage" = 'NOT_PRINTED', "productionCategory" = NULL WHERE id = $1`, [item.id]);
    console.log(`Reset stage to NOT_PRINTED for item ${item.id}`);
  }

  await client.end();
  console.log('✅ Order 1275 moved to Unassigned');
}

main().catch(e => { console.error('❌', e.message); client.end(); });
