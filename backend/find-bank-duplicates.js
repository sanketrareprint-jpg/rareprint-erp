// backend/find-bank-duplicates.js
//
// READ-ONLY diagnostic. Does not delete or change anything.
//
// dedupe-bank-transactions.js only flags two rows as duplicates if they
// match on the EXACT same instant (full date+time), credit/debit direction,
// amount, and description. That correctly found and removed one duplicate,
// but rows like the "RPAY-POS/MANAS AGRO INDUSTRIES AChandrapur, -1,000.00"
// pair are still showing up as two separate ledger lines. This script finds
// every group of transactions that match on DAY (not exact time) + direction
// + amount + description, and prints their full raw fields side by side —
// including the exact stored timestamp, srl, session, and balance — so we
// can see WHY they weren't caught: either (a) they're genuinely the same
// transaction stored with two slightly different timestamps [a real import
// bug, safe to merge], or (b) they're two real, separate charges that
// happened to occur on the same day for the same amount [not a bug — e.g. a
// POS terminal double-swipe — should NOT be merged].
//
// Run:
//   node find-bank-duplicates.js

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function normalizeText(raw) {
  return (raw ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
}
function moneyKey(amount) {
  return Number(amount).toFixed(2);
}
// Day-level key in IST, not exact timestamp — deliberately looser than
// buildImportKey() in bank-statement.service.ts so we can see near-matches
// that the strict importKey formula does not currently catch.
function dayKeyIst(date) {
  const d = new Date(date);
  const ist = new Date(d.getTime() + 330 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

async function main() {
  const rows = await prisma.bankTransaction.findMany({
    select: {
      id: true,
      sessionId: true,
      accountNumber: true,
      srl: true,
      txnDate: true,
      txnDateTime: true,
      valueDate: true,
      description: true,
      crDr: true,
      amount: true,
      balance: true,
      importKey: true,
      createdAt: true,
    },
    orderBy: [{ accountNumber: 'asc' }, { txnDate: 'asc' }, { id: 'asc' }],
  });

  console.log(`Loaded ${rows.length} bank transactions.\n`);

  const groups = new Map();
  for (const row of rows) {
    const key = [
      row.accountNumber,
      dayKeyIst(row.txnDate),
      row.crDr,
      moneyKey(row.amount),
      normalizeText(row.description),
    ].join('::');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  let found = 0;
  for (const [key, groupRows] of groups) {
    if (groupRows.length < 2) continue;
    found++;
    console.log(`\n=== Possible duplicate group #${found} (${groupRows.length} rows) ===`);
    console.log(`Key: ${key}`);
    for (const r of groupRows) {
      console.log(
        `  id=${r.id}  srl=${r.srl}  sessionId=${r.sessionId}\n` +
          `    txnDate=${new Date(r.txnDate).toISOString()}  txnDateTime=${r.txnDateTime ? new Date(r.txnDateTime).toISOString() : 'null'}  valueDate=${new Date(r.valueDate).toISOString()}\n` +
          `    balance=${moneyKey(r.balance)}  importKey=${r.importKey}\n` +
          `    createdAt=${new Date(r.createdAt).toISOString()}`,
      );
    }
  }

  console.log(`\n${found === 0 ? 'No' : found} possible duplicate group(s) found (day-level match, looser than the strict importKey check).`);
  if (found > 0) {
    console.log(
      'Review each group above: if txnDate/txnDateTime/balance are identical between rows, ' +
        'it is almost certainly the same transaction stored twice (safe to merge). ' +
        'If timestamps or balances genuinely differ, it may be two real separate transactions ' +
        '(e.g. a POS double-charge) and should NOT be auto-merged — worth confirming with the bank statement directly.',
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
