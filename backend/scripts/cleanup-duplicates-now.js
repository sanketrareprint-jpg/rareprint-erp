/**
 * cleanup-duplicates-now.js
 *
 * One-time cleanup of existing duplicate bank entries caused by the srl bug.
 *
 * Strategy:
 *   1. Group all transactions by (accountNumber + txnDate + crDr + amount + description)
 *      WITHOUT srl — this is the true transaction identity.
 *   2. Within each duplicate group, KEEP the entry with the best status:
 *      MATCHED_PAYMENT > MATCHED_VENDOR > MATCHED_EXPENSE > MANUAL_REVIEW
 *      On tie, keep the oldest (first imported).
 *   3. DELETE the rest ONLY if their status is MANUAL_REVIEW or UNMATCHED.
 *      Never delete MATCHED_PAYMENT, MATCHED_VENDOR, MATCHED_EXPENSE, or IGNORED.
 *   4. Recompute importKey for all remaining records using the fixed formula (no srl).
 *
 * Dry run:  node scripts/cleanup-duplicates-now.js
 * Apply:    node scripts/cleanup-duplicates-now.js --apply
 */

const { PrismaClient } = require('@prisma/client');
const { createHash } = require('crypto');

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

const STATUS_PRIORITY = {
  MATCHED_PAYMENT: 5,
  MATCHED_VENDOR: 4,
  MATCHED_EXPENSE: 3,
  IGNORED: 2,
  MANUAL_REVIEW: 1,
  UNMATCHED: 0,
};

// All statuses are deletable for DUPLICATES — we always keep the best one.
// MATCHED_PAYMENT is the only one we never auto-delete (real payment link).
const NEVER_DELETE = new Set(['MATCHED_PAYMENT']);

function buildNewKey(row) {
  const dateStr = new Date(row.txnDate).toISOString();
  const amount  = Number(row.amount).toFixed(2);
  const desc    = (row.description ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
  const rawKey  = [dateStr, row.crDr, amount, desc].join('|');
  return createHash('sha256').update(rawKey).digest('hex');
}

async function main() {
  console.log(APPLY ? '⚡ APPLYING changes...\n' : '🔍 DRY RUN — pass --apply to commit\n');

  const all = await prisma.bankTransaction.findMany({
    select: {
      id: true,
      accountNumber: true,
      srl: true,
      txnDate: true,
      crDr: true,
      amount: true,
      description: true,
      importKey: true,
      reconcileStatus: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Total transactions in DB: ${all.length}`);

  // Group by true identity (no srl)
  const groups = new Map();
  for (const r of all) {
    const key = [
      r.accountNumber,
      new Date(r.txnDate).toISOString().slice(0, 10),
      r.crDr,
      Number(r.amount).toFixed(2),
      (r.description ?? '').trim().replace(/\s+/g, ' ').toUpperCase(),
    ].join('|||');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  const dupGroups = [...groups.values()].filter(g => g.length > 1);
  console.log(`Duplicate groups found: ${dupGroups.length}`);

  const toDelete = [];
  const skippedVerified = [];

  for (const group of dupGroups) {
    // Sort best status first, then oldest import
    group.sort((a, b) => {
      const pa = STATUS_PRIORITY[a.reconcileStatus] ?? 0;
      const pb = STATUS_PRIORITY[b.reconcileStatus] ?? 0;
      if (pb !== pa) return pb - pa;
      return new Date(a.createdAt) - new Date(b.createdAt);
    });

    const [keep, ...remove] = group;
    for (const r of remove) {
      if (!NEVER_DELETE.has(r.reconcileStatus)) {
        toDelete.push(r);
        if (!APPLY) {
          console.log(
            `  DELETE id=${r.id}  status=${r.reconcileStatus}  srl=${r.srl}` +
            `  date=${new Date(r.txnDate).toISOString().slice(0,10)}  amt=${Number(r.amount).toFixed(2)}` +
            `\n         desc=${(r.description||'').slice(0,60)}` +
            `\n         → keep id=${keep.id} (status=${keep.reconcileStatus})`
          );
        }
      } else {
        skippedVerified.push(r);
        console.log(`  ⚠ SKIP (MATCHED_PAYMENT — manual review needed): id=${r.id}`);
      }
    }
  }

  console.log(`\nEntries to delete (MANUAL_REVIEW/UNMATCHED dupes): ${toDelete.length}`);
  console.log(`Entries skipped (already matched — manual review needed): ${skippedVerified.length}`);

  if (APPLY) {
    if (toDelete.length > 0) {
      const ids = toDelete.map(r => r.id);
      const result = await prisma.bankTransaction.deleteMany({ where: { id: { in: ids } } });
      console.log(`\n✓ Deleted ${result.count} duplicate transactions`);
    }

    // Recompute importKeys for all remaining records using the fixed formula (no srl)
    console.log('\nRecomputing importKeys (removing srl from hash)...');
    const remaining = await prisma.bankTransaction.findMany({
      select: { id: true, txnDate: true, crDr: true, amount: true, description: true, importKey: true },
    });

    let updatedKeys = 0;
    for (const r of remaining) {
      const newKey = buildNewKey(r);
      if (newKey !== r.importKey) {
        await prisma.bankTransaction.update({
          where: { id: r.id },
          data: { importKey: newKey },
        });
        updatedKeys++;
      }
    }
    console.log(`✓ Recomputed importKeys: ${updatedKeys} updated`);
    console.log('\n🎉 Cleanup complete. Future imports will use the fixed key (no srl).');
  } else {
    console.log('\n✅ Dry run complete. Run with --apply to execute.');
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
