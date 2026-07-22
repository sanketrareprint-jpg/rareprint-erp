// backend/dedupe-bank-transactions.js
//
// One-time cleanup for the "duplicate description entries" bug reported in
// the Bank Statement ledger.
//
// Root cause: migration 20260613000110_fix_bank_transaction_import_key
// backfilled the importKey column on old rows using a raw-SQL formula
// (md5 of txnDateTime+txnDate+valueDate+description+chequeNo+crDr+amount+balance).
// The application's buildImportKey() in bank-statement.service.ts uses a
// DIFFERENT formula (sha256 of only txnDate+crDr+amount+normalized description).
// Because the two formulas disagree, a transaction imported before that
// migration and the same transaction re-imported afterwards can end up with
// two different importKey values — which means neither the app-level dedup
// check nor the DB's @@unique([accountNumber, importKey]) constraint catches
// it as a duplicate, and it gets inserted as a second row. That's the
// literal duplicate you see in the Ledger tab.
//
// This script:
//   1. Recomputes today's importKey formula (byte-for-byte identical to
//      buildImportKey() in bank-statement.service.ts) for every existing row.
//   2. Groups rows by (accountNumber, recomputed key) — a group with more
//      than one row is a genuine duplicate (same date, credit/debit
//      direction, amount, and description).
//   3. Deletes every row in a group except the earliest (by createdAt, then
//      id) — the same "keep earliest" rule already used by this repo's
//      prior bank-dedup migrations.
//   4. Rewrites the importKey column on every surviving row to the
//      recomputed value, so the DB constraint and every future import use
//      one single, consistent formula going forward (this is what actually
//      prevents the bug from recurring).
//
// SAFE BY DEFAULT: running with no flags only REPORTS what it would do.
// Nothing is deleted or changed until you pass --apply.
//
//   node dedupe-bank-transactions.js            (dry run)
//   node dedupe-bank-transactions.js --apply     (actually clean up)
//
// Run this from a machine with DATABASE_URL pointing at the production
// database (the same way you'd run reset-password.js / create-admin.js).

const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

function normalizeText(raw) {
  return (raw ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
}
function moneyKey(amount) {
  return Number(amount).toFixed(2);
}
function dateKey(date) {
  if (!date) return '';
  return new Date(date).toISOString();
}
function buildImportKey(row) {
  const rawKey = [
    dateKey(row.txnDate),
    row.crDr,
    moneyKey(row.amount),
    normalizeText(row.description),
  ].join('|');
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

async function main() {
  console.log(
    APPLY
      ? '=== APPLY MODE — this will delete duplicate rows and update importKey values. ==='
      : '=== DRY RUN — no changes will be made. Re-run with --apply to actually clean up. ===',
  );

  const rows = await prisma.bankTransaction.findMany({
    select: {
      id: true,
      accountNumber: true,
      txnDate: true,
      crDr: true,
      amount: true,
      description: true,
      balance: true,
      importKey: true,
      createdAt: true,
    },
    orderBy: [{ accountNumber: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  });

  console.log(`Loaded ${rows.length} bank transactions.\n`);

  const groups = new Map(); // `${accountNumber}::${recomputedKey}` -> rows[]
  for (const row of rows) {
    const key = buildImportKey(row);
    const groupKey = `${row.accountNumber}::${key}`;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push({ ...row, correctKey: key });
  }

  let duplicateGroups = 0;
  let duplicateRows = 0;
  let keysToFix = 0;

  for (const [, groupRows] of groups) {
    const [keeper, ...dupes] = groupRows;

    if (dupes.length > 0) {
      duplicateGroups++;
      duplicateRows += dupes.length;
      const sameBalance = dupes.every((d) => Number(d.balance) === Number(keeper.balance));
      console.log(
        `Duplicate group [account ${keeper.accountNumber}] "${keeper.description.slice(0, 60)}" ` +
          `${dateKey(keeper.txnDate).slice(0, 10)} ${keeper.crDr} ${moneyKey(keeper.amount)}` +
          ` — keeping ${keeper.id}, deleting ${dupes.map((d) => d.id).join(', ')}` +
          (sameBalance ? ' (balances match — high confidence)' : ' (balances differ — please double-check before applying)'),
      );
      if (APPLY) {
        await prisma.bankTransaction.deleteMany({ where: { id: { in: dupes.map((d) => d.id) } } });
      }
    }

    if (keeper.importKey !== keeper.correctKey) {
      keysToFix++;
      if (APPLY) {
        await prisma.bankTransaction.update({
          where: { id: keeper.id },
          data: { importKey: keeper.correctKey },
        });
      }
    }
  }

  console.log(
    `\nSummary: ${duplicateGroups} duplicate group(s), ${duplicateRows} duplicate row(s) to delete, ` +
      `${keysToFix} importKey value(s) to correct.`,
  );
  console.log(
    APPLY
      ? 'Done — duplicates removed and importKey values are now consistent with the current import logic.'
      : 'Dry run complete — nothing was changed. Re-run with --apply to actually clean up.',
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
