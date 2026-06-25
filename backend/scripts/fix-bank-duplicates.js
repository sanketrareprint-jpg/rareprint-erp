/**
 * fix-bank-duplicates.js
 *
 * Two jobs in one script:
 *
 * JOB 1 — Recompute importKey for all existing records using the new stable
 *          formula (srl + txnDate + crDr + amount + description).
 *          Old keys included `balance` and `txnDateTime` which caused the same
 *          real transaction to get different keys on re-upload → duplicates.
 *
 * JOB 2 — After recomputing, find any (accountNumber, importKey) collisions
 *          (= real duplicates). Keep the VERIFIED one; if none is verified,
 *          keep the one with the best reconcileStatus. Delete the rest.
 *
 * Dry run (shows what will change, deletes nothing):
 *   node scripts/fix-bank-duplicates.js
 *
 * Apply:
 *   node scripts/fix-bank-duplicates.js --apply
 */

const { PrismaClient } = require('@prisma/client');
const { createHash } = require('crypto');

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

// ── Same stable formula as the updated service ───────────────────────────────
function moneyKey(amount) {
  return Number(amount).toFixed(2);
}
function dateKey(date) {
  if (!date) return '';
  return new Date(date).toISOString();
}
function normalizeText(raw) {
  return (raw ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
}
function buildImportKey(row) {
  const rawKey = [
    String(row.srl),
    dateKey(row.txnDate),
    row.crDr,
    moneyKey(row.amount),
    normalizeText(row.description),
  ].join('|');
  return createHash('sha256').update(rawKey).digest('hex');
}

// Status priority: higher = keep
const STATUS_PRIORITY = {
  VERIFIED: 5,
  MATCHED_PAYMENT: 4,
  MATCHED_VENDOR: 3,
  MATCHED_EXPENSE: 2,
  MANUAL_REVIEW: 1,
  UNMATCHED: 0,
};

async function main() {
  console.log(APPLY ? '⚡ APPLYING changes...' : '🔍 DRY RUN — pass --apply to commit\n');

  // ── JOB 1: Recompute importKeys ───────────────────────────────────────────
  const all = await prisma.bankTransaction.findMany({
    select: {
      id: true,
      srl: true,
      txnDate: true,
      crDr: true,
      amount: true,
      description: true,
      importKey: true,
      accountNumber: true,
    },
  });

  console.log(`Total transactions: ${all.length}`);

  const toUpdate = all
    .map(r => ({ ...r, newKey: buildImportKey(r) }))
    .filter(r => r.newKey !== r.importKey);

  console.log(`\nJOB 1 — importKey recompute needed: ${toUpdate.length} rows`);
  if (toUpdate.length > 0 && !APPLY) {
    console.log('  (first 5 samples)');
    toUpdate.slice(0, 5).forEach(r =>
      console.log(`  id=${r.id}  old=${r.importKey.slice(0,12)}…  new=${r.newKey.slice(0,12)}…`)
    );
  }

  if (APPLY && toUpdate.length > 0) {
    // Single raw SQL update — recomputes all keys at once using the new formula.
    // Avoids 4900 individual round-trips.
    const result = await prisma.$executeRaw`
      UPDATE "BankTransaction"
      SET "importKey" = encode(sha256(
        (
          "srl"::text || '|' ||
          to_char("txnDate", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') || '|' ||
          "crDr"::text || '|' ||
          to_char("amount", 'FM9999999999990.00') || '|' ||
          upper(regexp_replace(trim("description"), '\s+', ' ', 'g'))
        )::bytea
      ), 'hex')
    `;
    console.log(`  ✓ Updated ${result} importKeys via SQL`);
  }

  // ── JOB 2: Find & remove unverified duplicates ────────────────────────────
  // Re-fetch after updates (or use current state for dry run)
  const current = await prisma.bankTransaction.findMany({
    select: {
      id: true,
      accountNumber: true,
      importKey: true,
      reconcileStatus: true,
      txnDate: true,
      crDr: true,
      amount: true,
      description: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  // Group by (accountNumber, importKey)
  const groups = new Map();
  for (const r of current) {
    const key = `${r.accountNumber}|||${r.importKey}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  const dupGroups = [...groups.values()].filter(g => g.length > 1);
  console.log(`\nJOB 2 — Duplicate groups found: ${dupGroups.length}`);

  const toDelete = [];
  for (const group of dupGroups) {
    // Sort: verified/best status first, then earliest import
    group.sort((a, b) => {
      const pa = STATUS_PRIORITY[a.reconcileStatus] ?? 0;
      const pb = STATUS_PRIORITY[b.reconcileStatus] ?? 0;
      if (pb !== pa) return pb - pa;
      return new Date(a.createdAt) - new Date(b.createdAt);
    });
    const [keep, ...remove] = group;
    remove.forEach(r => {
      if (r.reconcileStatus !== 'VERIFIED') {
        toDelete.push(r);
        if (!APPLY) {
          console.log(`  DELETE id=${r.id}  status=${r.reconcileStatus}  date=${r.txnDate?.toISOString().slice(0,10)}  amt=${r.amount}  keep=${keep.id}`);
        }
      } else {
        console.log(`  ⚠ SKIP — id=${r.id} is VERIFIED, manual review needed`);
      }
    });
  }

  console.log(`\nUnverified duplicates to delete: ${toDelete.length}`);

  if (APPLY && toDelete.length > 0) {
    const ids = toDelete.map(r => r.id);
    const result = await prisma.bankTransaction.deleteMany({ where: { id: { in: ids } } });
    console.log(`  ✓ Deleted ${result.count} duplicate transactions`);
  }

  if (!APPLY) {
    console.log('\n✅ Dry run complete. Run with --apply to make changes.');
  } else {
    console.log('\n🎉 Done! importKeys recomputed, unverified duplicates removed.');
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
