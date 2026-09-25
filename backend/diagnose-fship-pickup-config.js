/**
 * Read-only diagnostic (makes NO changes): prints exactly which pickup
 * addresses are registered with Fship in Settings > Carrier Config, so we
 * can see whether the pickup point you're actually selecting on the
 * Dispatch page (e.g. "RAZA ENVELOP FACTORY 3") has ever been registered
 * as an Fship pickup address at all.
 *
 * Why this matters: dispatch.service.ts's getWarehouses() merges Bigship's
 * warehouse list with Fship's configured pickup addresses into one dropdown
 * -- but a Bigship-sourced entry has NO Fship address id attached unless it
 * ALSO happens to appear in fship.pickupAddresses. If you pick a pickup
 * that only exists on the Bigship side, there is literally no Fship
 * address id for it, and the code falls back to the FIRST configured Fship
 * pickup address instead (see the pickAddressId fallback chain in
 * bookItems()) -- which is why it always books from the same one address
 * regardless of what you picked. This isn't fixable in code alone; Fship
 * has to actually have that pickup address registered on their side first.
 *
 * Run from the backend/ folder:
 *   node diagnose-fship-pickup-config.js
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const rows = await prisma.$queryRaw`
      SELECT key, value FROM "SystemConfig" WHERE key = 'carrier_config'
    `;
    if (rows.length === 0) {
      console.log('No carrier_config row found in SystemConfig -- carrier config is running on defaults only.');
      return;
    }
    const cfg = JSON.parse(rows[0].value);

    console.log('=== FSHIP PICKUP ADDRESSES CONFIGURED (Settings > Carrier Config) ===');
    const addrs = cfg.fship?.pickupAddresses ?? [];
    if (addrs.length === 0) {
      console.log('(none configured!)');
    } else {
      addrs.forEach((a, i) => console.log(`  [${i}] id=${a.id}  name="${a.name}"  pincode=${a.pincode}`));
    }
    console.log();
    console.log('Global fship.pickupAddressId fallback:', cfg.fship?.pickupAddressId ?? '(not set)');
    console.log('Global fship.pickupPincode fallback:', cfg.fship?.pickupPincode ?? '(not set)');
    console.log();
    console.log('=> Whichever address is at index [0] above is what any Fship booking');
    console.log('   silently falls back to when the pickup you selected on the Dispatch');
    console.log('   page has no matching Fship address id.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exitCode = 1;
});
