// One-off (Sanket, 2026-10-13): Shopify's sample webhook created ERP order
// SH-9999 before the Shopify inbox existed. Moves it into the inbox as a
// REJECTED test record, then deletes the ERP order (its items + status logs)
// and the "SHIPPING COMPANY" customer it created.
//
// Refuses to touch anything unless every foreign key pointing at the order,
// its items and the customer holds exactly the expected rows (5 items, 2
// status logs, 1 order) — i.e. no payment, invoice, commission, ledger,
// shipment, lead, complaint, sheet etc. Dry run by default:
//   node scripts/shopify-move-sh9999-to-inbox.js          # report only
//   node scripts/shopify-move-sh9999-to-inbox.js --apply  # do it
// Needs `npm run build` first (reuses dist's Shopify mapper).
require('dotenv/config');
const { Client } = require('pg');
const { mapShopifyOrder } = require('../dist/src/shopify/shopify.mapper');

const ORDER_NUMBER = 'SH-9999';
const SHOPIFY_ORDER_ID = '820982911946154500';
const APPLY = process.argv.includes('--apply');

async function refCounts(c, table, id) {
  const fks = (await c.query(
    `SELECT tc.table_name, kcu.column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
       JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public' AND ccu.table_name = $1 AND ccu.column_name = 'id'`,
    [table],
  )).rows;
  const out = {};
  for (const fk of fks) {
    const n = Number((await c.query(`SELECT count(*) FROM "${fk.table_name}" WHERE "${fk.column_name}" = ANY($1)`, [id])).rows[0].count);
    if (n) out[`${fk.table_name}.${fk.column_name}`] = n;
  }
  return out;
}

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  console.log('DB:', process.env.DATABASE_URL.split('@')[1]);
  const fail = async (msg) => { console.error('ABORT:', msg); await c.end(); process.exit(1); };

  const order = (await c.query(`SELECT * FROM "Order" WHERE "orderNumber" = $1 AND "shopifyOrderId" = $2`, [ORDER_NUMBER, SHOPIFY_ORDER_ID])).rows[0];
  if (!order) return fail(`${ORDER_NUMBER} not found (already moved?)`);
  const customer = (await c.query(`SELECT * FROM "Customer" WHERE id = $1`, [order.customerId])).rows[0];
  const items = (await c.query(`SELECT id FROM "OrderItem" WHERE "orderId" = $1`, [order.id])).rows.map((r) => r.id);
  const log = (await c.query(
    `SELECT payload, "shopDomain" FROM "ShopifyWebhookLog" WHERE "resourceId" = $1 AND topic LIKE 'orders/%' ORDER BY "receivedAt" DESC LIMIT 1`,
    [SHOPIFY_ORDER_ID],
  )).rows[0];
  if (!log) return fail('Webhook payload for SH-9999 not found');
  if ((await c.query(`SELECT 1 FROM "ShopifyInboxOrder" WHERE "shopifyOrderId" = $1`, [SHOPIFY_ORDER_ID])).rowCount) {
    return fail('Inbox row already exists');
  }

  const orderRefs = await refCounts(c, 'Order', [order.id]);
  const itemRefs = await refCounts(c, 'OrderItem', items);
  const customerRefs = await refCounts(c, 'Customer', [customer.id]);
  const leads = Number((await c.query(
    `SELECT count(*) FROM "Lead" WHERE "convertedOrderId" = $1 ${customer.phone ? `OR phone LIKE '%' || $2` : ''}`,
    customer.phone ? [order.id, customer.phone] : [order.id],
  )).rows[0].count);
  console.log({ order: order.orderNumber, status: order.status, customer: customer.businessName, items: items.length, orderRefs, itemRefs, customerRefs, leads });

  const expectedOrderRefs = { 'OrderItem.orderId': 5, 'StatusLog.orderId': 2 };
  if (JSON.stringify(orderRefs) !== JSON.stringify(expectedOrderRefs)) return fail('Order has unexpected references');
  if (Object.keys(itemRefs).length) return fail('Order items are referenced elsewhere');
  if (JSON.stringify(customerRefs) !== JSON.stringify({ 'Order.customerId': 1 })) return fail('Customer has other orders/records');
  if (leads) return fail('A lead points at this order/customer');

  const m = mapShopifyOrder(log.payload);
  if (!APPLY) { await c.end(); console.log('Dry run OK — rerun with --apply'); return; }

  await c.query('BEGIN');
  try {
    await c.query(
      `INSERT INTO "ShopifyInboxOrder" (id, "shopifyOrderId", "shopDomain", "shopifyName", status, "isTest", "orderDate", "customerName", phone, email, city, state,
         "itemsSummary", "totalPrice", gateway, "financialStatus", "cancelledAt", "shopifyUpdatedAt", payload, "rejectedByName", "rejectedAt", "rejectReason", "updatedAt")
       VALUES ($1,$2,$3,$4,'REJECTED',true,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'System cleanup',now(),$18,now())`,
      [
        'sh9999' + Date.now().toString(36), SHOPIFY_ORDER_ID, log.shopDomain, m.shopifyName, m.orderDate, m.customer.name, m.customer.phone,
        m.customer.email, m.customer.city, m.customer.state,
        m.lines.map((l) => `${l.quantity} × ${l.title}${l.variantTitle ? ` (${l.variantTitle})` : ''}`).join(', ').slice(0, 500) || null,
        m.totalPrice, m.gateway, m.financialStatus, m.cancelledAt ? new Date(m.cancelledAt) : null, m.updatedAt, log.payload,
        `Shopify sample/test webhook — was ERP order ${ORDER_NUMBER} (cancelled), removed from ERP orders on 2026-10-13`,
      ],
    );
    const del = {
      statusLogs: (await c.query(`DELETE FROM "StatusLog" WHERE "orderId" = $1`, [order.id])).rowCount,
      items: (await c.query(`DELETE FROM "OrderItem" WHERE "orderId" = $1`, [order.id])).rowCount,
      order: (await c.query(`DELETE FROM "Order" WHERE id = $1`, [order.id])).rowCount,
      customer: (await c.query(`DELETE FROM "Customer" WHERE id = $1`, [customer.id])).rowCount,
    };
    if (del.statusLogs !== 2 || del.items !== 5 || del.order !== 1 || del.customer !== 1) throw new Error(`Unexpected delete counts ${JSON.stringify(del)}`);
    await c.query('COMMIT');
    console.log('Done:', del);
  } catch (e) {
    await c.query('ROLLBACK');
    return fail(e.message);
  }
  await c.end();
})();
