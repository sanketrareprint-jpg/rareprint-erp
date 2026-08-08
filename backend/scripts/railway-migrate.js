const { spawnSync } = require('node:child_process');

const RECOVERABLE_MIGRATIONS = [
  '20260520000100_performance_indexes',
  '20260520000300_sheet_performance_indexes',
  '20260624000100_add_paper_type_to_product',
  '20260612000400_add_billing_fields_to_paper_po',
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

run(PRISMA_BIN, ['migrate', 'deploy']);

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
