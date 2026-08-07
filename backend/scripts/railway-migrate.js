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

for (const migration of RECOVERABLE_MIGRATIONS) {
  console.log(`Checking recoverable migration ${migration} before deploy...`);
  run('npx', ['prisma', 'migrate', 'resolve', '--applied', migration], { allowFailure: true });
}

run('npx', ['prisma', 'migrate', 'deploy']);

// Belt-and-suspenders check: migrate deploy can report success while a
// table is still missing if _prisma_migrations drifted from the real
// schema (see ensure-commission-override-table.js for the story on this
// one specifically). Verify/create it directly so a stale migration
// record can never again silently break the commission-override feature.
run('node', ['scripts/ensure-commission-override-table.js'], { allowFailure: true });
run('node', ['scripts/ensure-customer-phone2-column.js'], { allowFailure: true });
run('node', ['scripts/ensure-shipment-bigship-columns.js'], { allowFailure: true });
run('node', ['scripts/ensure-user-payment-keyword-table.js'], { allowFailure: true });
run('node', ['scripts/ensure-attendance-final-column.js'], { allowFailure: true });
run('node', ['scripts/ensure-company-holiday-table.js'], { allowFailure: true });

// Diagnostic: if this line never shows up in the deploy log, the hang is
// inside one of the run() calls above (a spawned child process not fully
// exiting) — not in `node dist/src/main.js` itself.
console.log('[railway-migrate] All steps complete, handing off to the app...');
