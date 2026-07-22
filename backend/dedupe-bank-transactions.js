// backend/dedupe-bank-transactions.js
//
// One-time cleanup for duplicate entries in the Bank Statement ledger.
//
// Root cause of PASS 1 duplicates: migration
// 20260613000110_fix_bank_transaction_import_key backfilled the importKey
// column on old rows using a raw-SQL formula (md5 of several fields). The
// application's buildImportKey() in bank-statement.service.ts uses a
// DIFFERENT formula (sha256 of only txnDate+crDr+amount+normalized
// description). Because the two formulas disagree, a transaction imported
// before that migration and the same transaction re-imported afterwards can
// end up with two different importKey values, so neither the app-level
// dedup check nor the DB's @@unique([accountNumber, importKey]) constraint
// catches it — it gets inserted as a second row.
//
// PASS 2 catches a looser case: two rows that match on calendar day (IST) +
// credit/debit direction + amount + description + running balance, but
// whose exact stored timestamp differs (so PASS 1's exact-instant hash
// doesn't consider them the same transaction). Requiring the balance to
// match too is what makes this safe: two genuinely separate real
// transactions cannot both leave the account at the exact same running
// balance, so a day+amount+description+balance match is strong evidence
// it's the same transaction recorded twice — not two coincidentally similar
// payments (e.g. two real, different payments to the same vendor on the
// same day would leave two DIFFERENT balances, and are correctly left
// alone).
//
// This script:
//   1. PASS 1 — recomputes today's importKey formula for every row and
//      removes exact-instant duplicates (byte-for-byte identical hash).
//   2. PASS 2 — among whatever survives PASS 1, removes same-day /
//      same-direction / same-amount / same-description / same-balance
//      duplicates.
//   3. In both passes, keeps the earliest row (by createdAt, then id) and
//      deletes the rest.
//   4. Rewrites the importKey column on every final surviving row to the
//      recomputed value, so the DB constraint and every future import use
//      one single, consistent formula going forward.
//
// SAFE BY DEFAULT: running with no flags only REPORTS what it would do.
// Nothing is deleted or changed until you pass --apply.
//
//   node dedupe-bank-transactions.js            (dry run)
//   node dedupe-bank-transactions.js --apply     (actually clean up)
//
// Run this from a machine with DATABASE_URL pointing at the production
// database (the same way you'd run reset-password.js / create-admin.js).
// Safe to re-run any time — if there's nothing left to clean up, it just
// reports zero duplicates.

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
// Calendar day in IST — deliberately looser than the exact-instant key
// below, used only for PASS 2's same-day matching.
function dayKeyIst(date) {
  const d = new Date(date);
  const ist = new Date(d.getTime() + 330 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
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

function groupBy(rows, keyFn) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
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

  const toDelete = new Set();

  // ── PASS 1: exact-instant duplicates (recomputed importKey match) ──────────
  console.log('--- Pass 1: exact-match duplicates (same instant, direction, amount, description) ---');
  const pass1Groups = groupBy(rows, (r) => `${r.accountNumber}::${buildImportKey(r)}`);
  let pass1Groups_count = 0;
  let pass1Rows_count = 0;
  for (const [, groupRows] of pass1Groups) {
    if (groupRows.length < 2) continue;
    pass1Groups_count++;
    const [keeper, ...dupes] = groupRows;
    pass1Rows_count += dupes.length;
    console.log(
      `  [account ${keeper.accountNumber}] "${keeper.description.slice(0, 60)}" ${dateKey(keeper.txnDate).slice(0, 10)} ${keeper.crDr} ${moneyKey(keeper.amount)}` +
        ` — keeping ${keeper.id}, deleting ${dupes.map((d) => d.id).join(', ')}`,
    );
    dupes.forEach((d) => toDelete.add(d.id));
  }
  console.log(`Pass 1: ${pass1Groups_count} group(s), ${pass1Rows_count} row(s) to delete.\n`);

  // ── PASS 2: same-day + same-balance duplicates among Pass 1 survivors ─────
  console.log('--- Pass 2: same-day duplicates (day, direction, amount, description, AND balance all match) ---');
  const survivingAfterPass1 = rows.filter((r) => !toDelete.has(r.id));
  const pass2Groups = groupBy(
    survivingAfterPass1,
    (r) => `${r.accountNumber}::${dayKeyIst(r.txnDate)}::${r.crDr}::${moneyKey(r.amount)}::${normalizeText(r.description)}::${moneyKey(r.balance)}`,
  );
  let pass2Groups_count = 0;
  let pass2Rows_count = 0;
  for (const [, groupRows] of pass2Groups) {
    if (groupRows.length < 2) continue;
    pass2Groups_count++;
    const [keeper, ...dupes] = groupRows;
    pass2Rows_count += dupes.length;
    console.log(
      `  [account ${keeper.accountNumber}] "${keeper.description.slice(0, 60)}" ${dayKeyIst(keeper.txnDate)} ${keeper.crDr} ${moneyKey(keeper.amount)} bal=${moneyKey(keeper.balance)}` +
        ` — keeping ${keeper.id}, deleting ${dupes.map((d) => d.id).join(', ')}`,
    );
    dupes.forEach((d) => toDelete.add(d.id));
  }
  console.log(`Pass 2: ${pass2Groups_count} group(s), ${pass2Rows_count} row(s) to delete.\n`);

  // ── Apply deletions ────────────────────────────────────────────────────────
  if (APPLY && toDelete.size > 0) {
    await prisma.bankTransaction.deleteMany({ where: { id: { in: [...toDelete] } } });
  }

  // ── Rewrite importKey on every final surviving row to the current formula ─
  const survivors = rows.filter((r) => !toDelete.has(r.id));
  let keysToFix = 0;
  for (const row of survivors) {
    const correctKey = buildImportKey(row);
    if (row.importKey !== correctKey) {
      keysToFix++;
      if (APPLY) {
        await prisma.bankTransaction.update({ where: { id: row.id }, data: { importKey: correctKey } });
      }
    }
  }

  console.log(
    `\nTotal: ${toDelete.size} duplicate row(s) to delete across both passes, ${keysToFix} importKey value(s) to correct.`,
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
