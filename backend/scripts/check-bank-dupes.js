const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const all = await prisma.bankTransaction.findMany({
    select: {
      id: true,
      accountNumber: true,
      srl: true,
      txnDate: true,
      crDr: true,
      amount: true,
      description: true,
      reconcileStatus: true,
      importKey: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Total transactions in DB: ${all.length}`);

  // Group by real transaction identity (stable fields only — NO srl)
  // srl is a per-export row counter and changes between overlapping re-exports,
  // so including it here would hide cross-srl duplicates (the actual bug).
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
  const totalExtra = dupGroups.reduce((s, g) => s + g.length - 1, 0);

  console.log(`Duplicate groups  : ${dupGroups.length}`);
  console.log(`Extra (dupe) rows : ${totalExtra}`);

  if (dupGroups.length === 0) {
    console.log('\n✅ No duplicates found.');
    return;
  }

  console.log('\n── Details ──');
  for (const group of dupGroups) {
    const g0 = group[0];
    console.log(`\n  Date: ${g0.txnDate?.toISOString().slice(0, 10)}  ${g0.crDr}  ₹${g0.amount}  SRL:${g0.srl}`);
    console.log(`  Desc: ${g0.description?.slice(0, 70)}`);
    group.forEach(r =>
      console.log(`    id=${r.id}  status=${r.reconcileStatus.padEnd(16)}  imported=${r.createdAt?.toISOString().slice(0, 10)}  key=${r.importKey.slice(0, 12)}…`)
    );
  }

  // Summary by status
  const statusCount = {};
  dupGroups.forEach(g => g.slice(1).forEach(r => {
    statusCount[r.reconcileStatus] = (statusCount[r.reconcileStatus] || 0) + 1;
  }));
  console.log('\n── Extra rows by reconcileStatus ──');
  Object.entries(statusCount).sort((a,b) => b[1]-a[1]).forEach(([s, c]) => console.log(`  ${s.padEnd(20)}: ${c}`));
}

main().catch(console.error).finally(() => prisma.$disconnect());
