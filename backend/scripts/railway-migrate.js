const { spawnSync } = require('node:child_process');

const RECOVERABLE_MIGRATIONS = [
  '20260520000100_performance_indexes',
  '20260520000300_sheet_performance_indexes',
  '20260624000100_add_paper_type_to_product',
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
  run('npx', ['prisma', 'migrate', 'resolve', '--applied', migration], {
    allowFailure: true,
  });
}

run('npx', ['prisma', 'migrate', 'deploy']);
