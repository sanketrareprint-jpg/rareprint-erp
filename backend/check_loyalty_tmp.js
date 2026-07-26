const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:cpwyjHacUIgnKYAgZqHSqSGOmMjfqqYc@monorail.proxy.rlwy.net:46355/railway' });

(async () => {
  await client.connect();

  const orderNumbers = ['1344','1104','1310','1239','1271','1309'];
  const res = await client.query(`
    SELECT o."orderNumber", o."customerId", o."orderDate", o."status", o."isTest", o."isSample",
           o."loyaltyPointsEarned", c."businessName", c.phone,
           i.id AS "invoiceId",
           (SELECT COUNT(*) FROM "CustomerLoyaltyTransaction" t WHERE t."orderId" = o.id AND t.type='EARN') AS earn_txn_count
    FROM "Order" o
    JOIN "Customer" c ON c.id = o."customerId"
    LEFT JOIN "Invoice" i ON i."orderId" = o.id
    WHERE o."orderNumber" = ANY($1)
    ORDER BY o."orderNumber"
  `, [orderNumbers]);
  console.table(res.rows);

  // also check migration date of loyalty feature vs earliest/latest orders with 0 pts
  const minMax = await client.query(`
    SELECT MIN("orderDate") as min_date, MAX("orderDate") as max_date, COUNT(*) as total
    FROM "Order" WHERE COALESCE("isTest",false)=false
  `);
  console.log('order date range:', minMax.rows[0]);

  const earnCount = await client.query(`SELECT COUNT(*) FROM "CustomerLoyaltyTransaction" WHERE type='EARN'`);
  console.log('total EARN transactions in system:', earnCount.rows[0]);

  await client.end();
})().catch(e => { console.error(e); process.exit(1); });
