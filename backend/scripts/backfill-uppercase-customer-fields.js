// Uppercases customer name and address fields for every existing customer,
// to match the new order-creation/edit behavior (see upper() in
// orders.service.ts) which now always stores these fields in caps regardless
// of how the sales agent typed them in.
//
// Fields touched: businessName, contactPerson, shippingAddress,
// billingAddress, city, state. NOT touched: phone, phone2, email, gstNumber,
// pincode, customerCode — those aren't "name and address" and casing
// doesn't apply to them anyway.
//
// SAFE BY DEFAULT: running with no flags is a DRY RUN — it prints a sample
// of what WOULD change but writes nothing. Pass --apply to actually write.
//
// Idempotent: UPPER(UPPER(x)) = UPPER(x), so this can be safely re-run any
// time (e.g. after a fresh customer-directory import) with no side effects
// on rows that are already uppercase.
//
// Run from backend/:
//   node scripts/backfill-uppercase-customer-fields.js            (dry run, safe)
//   node scripts/backfill-uppercase-customer-fields.js --apply     (writes changes)

const { Client } = require('pg');

const APPLY = process.argv.includes('--apply');

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://postgres:cpwyjHacUIgnKYAgZqHSqSGOmMjfqqYc@monorail.proxy.rlwy.net:46355/railway';

const client = new Client({ connectionString });

const FIELDS = ['businessName', 'contactPerson', 'shippingAddress', 'billingAddress', 'city', 'state'];

async function main() {
  await client.connect();
  console.log(APPLY ? '=== APPLY MODE — writes will be made ===' : '=== DRY RUN — no writes will be made (pass --apply to commit) ===');

  const { rows } = await client.query(`
    SELECT id, "businessName", "contactPerson", "shippingAddress", "billingAddress", city, state
    FROM "Customer"
    WHERE ${FIELDS.map((f) => `("${f}" IS NOT NULL AND "${f}" != UPPER("${f}"))`).join(' OR ')}
  `);

  console.log(`Customers with at least one non-uppercase name/address field: ${rows.length}`);

  if (rows.length === 0) {
    console.log('Nothing to backfill.');
    await client.end();
    return;
  }

  console.log('\nSample (first 15):');
  console.table(
    rows.slice(0, 15).map((r) => ({
      businessName: r.businessName,
      contactPerson: r.contactPerson,
      city: r.city,
      state: r.state,
    })),
  );

  if (!APPLY) {
    console.log('\nThis was a DRY RUN — nothing was written. Re-run with --apply to commit these changes.');
    await client.end();
    return;
  }

  const result = await client.query(`
    UPDATE "Customer"
    SET
      "businessName" = UPPER("businessName"),
      "contactPerson" = UPPER("contactPerson"),
      "shippingAddress" = UPPER("shippingAddress"),
      "billingAddress" = UPPER("billingAddress"),
      city = UPPER(city),
      state = UPPER(state)
    WHERE ${FIELDS.map((f) => `("${f}" IS NOT NULL AND "${f}" != UPPER("${f}"))`).join(' OR ')}
  `);

  console.log(`\nUpdated ${result.rowCount} customer rows.`);
  await client.end();
}

main().catch((e) => {
  console.error('Fatal error:', e);
  client.end();
  process.exit(1);
});
