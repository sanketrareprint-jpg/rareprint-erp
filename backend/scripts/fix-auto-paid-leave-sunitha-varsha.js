// One-off RarePrint data fix (2026-10-22): give SUNITHA PETKAR (RP18) and
// VARSHA TAMGADE (RP20) 16h automatic monthly paid leave.
//
// They were meant to be on the 16h list from the start, but the old name rule
// in hr.service.ts looked for "SUNITA" and "WARSHA", so both got 14h.
// Requires migration 20261022120000_add_employee_automatic_paid_leave_hours.
//
// Matches on employeeCode AND exact fullName, so on any other deployment it
// finds nothing and changes nothing. Dry run by default; pass --apply to write.
//
//   node scripts/fix-auto-paid-leave-sunitha-varsha.js           (dry run)
//   node scripts/fix-auto-paid-leave-sunitha-varsha.js --apply
require('dotenv/config');
const { Client } = require('pg');

const TARGETS = [
  { employeeCode: 'RP18', fullName: 'SUNITHA PETKAR' },
  { employeeCode: 'RP20', fullName: 'VARSHA TAMGADE' },
];
const HOURS = 16;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('No DATABASE_URL set — nothing done.');
    process.exit(1);
  }
  const apply = process.argv.includes('--apply');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    for (const t of TARGETS) {
      const { rows } = await client.query(
        'SELECT id, "automaticPaidLeaveHours" FROM "Employee" WHERE "employeeCode" = $1 AND upper("fullName") = $2',
        [t.employeeCode, t.fullName],
      );
      if (rows.length !== 1) {
        console.log(`${t.employeeCode} ${t.fullName}: not found — skipped`);
        continue;
      }
      const before = Number(rows[0].automaticPaidLeaveHours);
      if (before === HOURS) {
        console.log(`${t.employeeCode} ${t.fullName}: already ${HOURS}h`);
        continue;
      }
      await client.query('UPDATE "Employee" SET "automaticPaidLeaveHours" = $1 WHERE id = $2', [HOURS, rows[0].id]);
      console.log(`${t.employeeCode} ${t.fullName}: ${before}h -> ${HOURS}h${apply ? '' : ' (dry run)'}`);
    }
    await client.query(apply ? 'COMMIT' : 'ROLLBACK');
    console.log(apply ? 'Committed.' : 'Dry run — rolled back. Re-run with --apply to write.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
