const { spawnSync } = require('node:child_process');

const RECOVERABLE_MIGRATION = '20260520000100_performance_indexes';

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

console.log(`Checking recoverable migration ${RECOVERABLE_MIGRATION} before deploy...`);
run('npx', ['prisma', 'migrate', 'resolve', '--applied', RECOVERABLE_MIGRATION], {
  allowFailure: true,
});

run('npx', ['prisma', 'migrate', 'deploy']);
