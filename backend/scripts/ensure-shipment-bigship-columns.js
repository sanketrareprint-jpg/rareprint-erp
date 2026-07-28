// Self-heal for migration 20260728180000_add_shipment_bigship_sync.
//
// Same class of bug documented in ensure-commission-override-table.js and
// ensure-customer-phone2-column.js: `prisma migrate deploy` can report
// success on production while the actual columns never get created, if
// `_prisma_migrations` has drifted (a stale/partial row makes the deploy
// step treat the migration as already-applied and skip it). When that
// happens here, every query against Shipment (e.g. Dispatch > History)
// throws a Prisma "column Shipment.bigshipOrderId does not exist" error —
// confirmed live via Railway logs on 2026-07-28, breaking the whole
// History page with 0 shipments shown.
//
// Runs right after `prisma migrate deploy` on every boot and adds the
// columns directly (idempotently) against the same DATABASE_URL the app
// itself uses, if they aren't already there. Safe to run every deploy — a
// no-op once the columns exist.
const { Client } = require('pg');

const COLUMNS = [
  { name: 'bigshipOrderId', ddl: 'TEXT' },
  { name: 'bigshipStatus', ddl: 'TEXT' },
  { name: 'bigshipSyncedAt', ddl: 'TIMESTAMP(3)' },
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.log('[ensure-shipment-bigship-columns] No DATABASE_URL set, skipping.');
    return;
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const { rows } = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'Shipment' AND column_name = ANY($1::text[])
    `, [COLUMNS.map((c) => c.name)]);
    const existing = new Set(rows.map((r) => r.column_name));
    const missing = COLUMNS.filter((c) => !existing.has(c.name));

    if (missing.length === 0) {
      console.log('[ensure-shipment-bigship-columns] All columns already exist, skipping.');
      return;
    }

    for (const col of missing) {
      console.log(`[ensure-shipment-bigship-columns] Column ${col.name} missing — adding it now.`);
      await client.query(`ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "${col.name}" ${col.ddl};`);
    }
    console.log('[ensure-shipment-bigship-columns] Columns added successfully.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  // Never block app startup over this — worst case, columns stay missing
  // (as they already are) and the next deploy retries.
  console.error('[ensure-shipment-bigship-columns] Failed:', err.message);
});
