// One-off: normalize vendor names with stray spaces (e.g. "GANDHI CARD " ->
// "GANDHI CARD"), which made them fail Payment Verification's Vendor / Expense check.
//
// Dry run (default, changes nothing):  node scripts/fix-vendor-name-whitespace.js
// Apply the changes:                   node scripts/fix-vendor-name-whitespace.js --apply
require('dotenv/config');
const { Client } = require('pg');

const apply = process.argv.includes('--apply');
const normalize = s => s.trim().replace(/\s+/g, ' ');

(async () => {
  if (!process.env.DATABASE_URL) {
    console.error('No DATABASE_URL set — aborting.');
    process.exit(1);
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const vendors = (await client.query('SELECT id, name FROM "Vendor"')).rows;
    const toFix = vendors.filter(v => v.name && v.name !== normalize(v.name));

    console.log(apply ? 'APPLY MODE — changes will be saved.\n' : 'DRY RUN — nothing will be changed.\n');
    if (toFix.length === 0) {
      console.log('No vendor names need fixing.');
      return;
    }

    const safe = [];
    for (const v of toFix) {
      const newName = normalize(v.name);
      const clash = vendors.find(o => o.id !== v.id && o.name && normalize(o.name).toLowerCase() === newName.toLowerCase());
      if (clash) {
        console.log(`SKIP  ${JSON.stringify(v.name)} -> ${JSON.stringify(newName)}  (another vendor already named ${JSON.stringify(clash.name)})`);
      } else {
        console.log(`FIX   ${JSON.stringify(v.name)} -> ${JSON.stringify(newName)}`);
        safe.push({ ...v, newName });
      }
    }

    if (!apply) {
      console.log(`\n${safe.length} vendor name(s) would be fixed. Re-run with --apply to save.`);
      return;
    }

    await client.query('BEGIN');
    try {
      for (const v of safe) {
        // Guard on the old name so a concurrent edit is never overwritten.
        const r = await client.query('UPDATE "Vendor" SET name = $1 WHERE id = $2 AND name = $3', [v.newName, v.id, v.name]);
        if (r.rowCount !== 1) throw new Error(`Vendor ${v.id} changed since it was read — nothing saved`);
      }
      await client.query('COMMIT');
      console.log(`\nDone: ${safe.length} vendor name(s) fixed.`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('\nRolled back, nothing saved:', err.message);
      process.exitCode = 1;
    }
  } finally {
    await client.end();
  }
})();
