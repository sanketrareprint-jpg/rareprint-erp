// One-off helper: promotes an existing user to ADMIN, by email. Written for
// the SaaS test-customer walkthrough (2026-09-18) — the test account
// (abc@gmail.com) was created through /signup with its default role
// (SALES_AGENT), which hides Cost Table from the sidebar and is rejected by
// the create-product endpoint's admin check. Promoting the existing account
// avoids losing the test order already created under it.
//
// Usage: node scripts/promote-test-admin.js <email>
// (reads DATABASE_URL from the environment, same convention as the other
// scripts in this folder)

require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

// SAME SAFETY GUARD as the other scripts in this folder — see
// provision-new-customer-migrate.js's header comment for why this exists.
const PRODUCTION_HOST_FRAGMENT = 'monorail.proxy.rlwy.net';

const databaseUrl = process.env.DATABASE_URL || '';
if (databaseUrl.includes(PRODUCTION_HOST_FRAGMENT)) {
  console.error(
    `[promote-test-admin] REFUSING TO RUN: DATABASE_URL points at what looks like RarePrint's own production database (host contains "${PRODUCTION_HOST_FRAGMENT}"). This script is only for disposable SaaS test customer databases. Stopping before touching anything.`
  );
  process.exit(1);
}
if (!databaseUrl) {
  console.error('[promote-test-admin] REFUSING TO RUN: DATABASE_URL is not set at all.');
  process.exit(1);
}

const email = process.argv[2];
if (!email) {
  console.error('[promote-test-admin] Usage: node scripts/promote-test-admin.js <email>');
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

async function main() {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`[promote-test-admin] No user found with email "${email}".`);
    process.exit(1);
  }
  const updated = await prisma.user.update({
    where: { email },
    data: { role: 'ADMIN' },
  });
  console.log(`[promote-test-admin] "${updated.email}" is now role ${updated.role} (was ${user.role}).`);
  console.log('[promote-test-admin] Log out and back in on the frontend to pick up the new role.');
}

main()
  .catch((err) => {
    console.error('[promote-test-admin] FATAL:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
