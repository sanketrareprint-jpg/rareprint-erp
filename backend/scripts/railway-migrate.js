const { spawnSync } = require('node:child_process');

const RECOVERABLE_MIGRATIONS = [
  '20260520000100_performance_indexes',
  '20260520000300_sheet_performance_indexes',
  '20260624000100_add_paper_type_to_product',
  '20260612000400_add_billing_fields_to_paper_po',
  // 2026-08-14: added defensively. The Dispatch "Courier Charges" tab went
  // down site-wide the same day this migration was introduced — every
  // Shipment/Order query built with `include` (which pulls every scalar
  // column, unlike a narrow `select`) started failing because
  // courierChargeActual/courierChargeQuoted didn't exist on the DB yet,
  // the same failure class as the 2026-08-08 pendingDispatchItemIds
  // incident (see ensure-all-columns.js header). Pre-resolving it here
  // stops `migrate deploy` from getting stuck retrying/failing on it if
  // _prisma_migrations ever drifts from reality again; ensure-all-columns.js
  // below is what actually guarantees the columns exist either way.
  '20260814120000_add_courier_charge_actual_quoted',
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: options.capture ? 'pipe' : 'inherit',
  });
  if (!options.allowFailure && result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

// Call the local prisma binary directly instead of going through `npx` —
// npx pays its own resolution overhead (checking local vs global, registry
// lookups) on every single invocation. With 5 separate prisma calls in this
// file, that overhead was adding up: the whole migrate+ensure phase was
// consistently taking 40-47s before the app even started booting.
const PRISMA_BIN = require('path').join(__dirname, '..', 'node_modules', '.bin', 'prisma');

for (const migration of RECOVERABLE_MIGRATIONS) {
  console.log(`Checking recoverable migration ${migration} before deploy...`);
  run(PRISMA_BIN, ['migrate', 'resolve', '--applied', migration], { allowFailure: true });
}

// allowFailure here on purpose: `migrate deploy` refuses to apply ANYTHING
// once _prisma_migrations has one stuck/drifted row in it — not just the
// migration that drifted, every migration after it too — and this file used
// to treat that a failure here as fatal, exiting the whole process right
// here before the app ever started. Best-available diagnosis for the
// 2026-08-14 incident (every Dispatch subtab erroring right after the
// courierChargeActual/courierChargeQuoted migration went out — all of them
// query Order/Shipment with a broad `include`, which pulls every scalar
// column, unlike the narrower `select`-based queries elsewhere that kept
// working): this step failed and took the app down with it, so the
// ensure-all-columns.js safety net two lines down never even got a chance to
// run and add the missing columns itself. A failure here is now a loud
// warning, not a boot-abort — the app keeps starting either way, and
// ensure-all-columns.js (which checks/adds columns directly via raw SQL,
// independent of _prisma_migrations state) is what actually guarantees
// Dispatch has what it needs to query successfully.
const migrateStatus = spawnSync(PRISMA_BIN, ['migrate', 'deploy'], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
  stdio: 'inherit',
}).status;
if (migrateStatus !== 0) {
  console.error(`[railway-migrate] WARNING: \`prisma migrate deploy\` exited with status ${migrateStatus} — falling through to ensure-all-columns.js instead of crashing the boot. Investigate _prisma_migrations for a stuck/failed row when you get a chance.`);
}

// Belt-and-suspenders check: migrate deploy can report success while a
// table/column is still missing if _prisma_migrations drifted from the real
// schema (see ensure-commission-override-table.js's original header for the
// full story). This used to be 6 separate `node scripts/ensure-x.js` child
// processes — each paid its own Node startup + DB-connect cost. Now it's one
// combined script, one connection, one process.
run('node', ['scripts/ensure-all-columns.js'], { allowFailure: true });

// Diagnostic: if this line never shows up in the deploy log, the hang is
// inside one of the run() calls above (a spawned child process not fully
// exiting) — not in `node dist/src/main.js` itself.
console.log('[railway-migrate] All steps complete, handing off to the app...');

// This script never called process.exit() before falling off the end of the
// file — relying on Node to exit on its own once the event loop empties.
// Confirmed via deploy logs: the line above always prints, but the next
// shell command (`node dist/src/main.js`, chained with &&) never runs,
// meaning this process wasn't actually terminating even though its JS had
// nothing left to do. Forcing it explicitly removes any ambiguity.
process.exit(0);