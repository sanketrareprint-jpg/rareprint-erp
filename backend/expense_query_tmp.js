const { Client } = require('pg');
require('dotenv').config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function main() {
  await client.connect();

  const sql = `
    SELECT
      t.id, t."txnDate", t."expensePeriod", t.description, t.amount, t."reconcileStatus",
      t."vendorExpenseOverride",
      v.name AS vendor_name,
      ec.name AS category_name,
      p."referenceNumber", p.amount AS payment_amount,
      o."orderNumber", c."businessName",
      t."checkedAt", cb."fullName" AS checked_by,
      t."recheckedAt", rb."fullName" AS rechecked_by,
      t."accountantNote"
    FROM "BankTransaction" t
    LEFT JOIN "Vendor" v ON v.id = t."matchedVendorId"
    LEFT JOIN "ExpenseCategory" ec ON ec.id = t."expenseCategoryId"
    LEFT JOIN "Payment" p ON p.id = t."matchedPaymentId"
    LEFT JOIN "Order" o ON o.id = p."orderId"
    LEFT JOIN "Customer" c ON c.id = o."customerId"
    LEFT JOIN "User" cb ON cb.id = t."checkedById"
    LEFT JOIN "User" rb ON rb.id = t."recheckedById"
    WHERE t."crDr" = 'DR'
      AND t."reconcileStatus" IN ('MATCHED_PAYMENT','MATCHED_VENDOR','MATCHED_EXPENSE','MANUAL_REVIEW')
      AND (
        (t."expensePeriod" >= '2026-07-01' AND t."expensePeriod" < '2026-08-01')
        OR (t."expensePeriod" IS NULL AND t."txnDate" >= '2026-07-01' AND t."txnDate" < '2026-08-01')
      )
    ORDER BY t."txnDate" DESC;
  `;

  const res = await client.query(sql);
  console.log(JSON.stringify(res.rows, null, 2));
  console.error(`\n--- ROW COUNT: ${res.rows.length} ---`);
  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
