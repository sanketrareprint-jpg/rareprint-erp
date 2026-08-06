// Self-heal for migration 20260806130000_add_attendance_final_sheet.
//
// Same class of bug documented in ensure-commission-override-table.js,
// ensure-customer-phone2-column.js and ensure-shipment-bigship-columns.js:
// `prisma migrate deploy` can report success on production while the actual
// column never gets created, if `_prisma_migrations` has drifted. When that
// happens here, every query against AttendanceImportSession (import,
// listing import history, the Attendance grid, and salaryForMonth via its
// "Final sheet" lookup) throws a Prisma "column isFinal does not exist"
// error — confirmed live on 2026-08-06: Attendance page showed "Internal
// server error" on load AND on import.
//
// Runs right after `prisma migrate deploy` on every boot and adds the
// column directly (idempotently) against the same DATABASE_URL the app
// itself uses, if it isn't already there. Safe to run every deploy — a
// no-op once the column exists.
const { Client } = require('pg');

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.log('[ensure-attendance-final-column] No DATABASE_URL set, skipping.');
    return;
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const { rows } = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'AttendanceImportSession' AND column_name = 'isFinal'
    `);
    if (rows.length > 0) {
      console.log('[ensure-attendance-final-column] Column already exists, skipping.');
      return;
    }
    console.log('[ensure-attendance-final-column] Column isFinal missing — adding it now.');
    await client.query(`ALTER TABLE "AttendanceImportSession" ADD COLUMN IF NOT EXISTS "isFinal" BOOLEAN NOT NULL DEFAULT false;`);
    console.log('[ensure-attendance-final-column] Column added successfully.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  // Never block app startup over this — worst case, the column stays
  // missing (as it already is) and the next deploy retries.
  console.error('[ensure-attendance-final-column] Failed:', err.message);
});
