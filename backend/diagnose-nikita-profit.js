/**
 * diagnose-nikita-profit.js
 *
 * Read-only. Reproduces the exact per-line grossProfit calculation from
 * CostTableService.getAgentCommissionSheet (backend/src/cost-table/cost-table.service.ts)
 * for one sales agent + month, and prints every line item's numbers so the
 * one causing an absurd total (e.g. Nikita Paul's -144.5L for Aug 2026) is
 * obvious. Change AGENT_NAME_CONTAINS / YEAR / MONTH below to check someone else.
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const AGENT_NAME_CONTAINS = 'Nikita';
const YEAR = 2026;
const MONTH = 8; // August

const matchSlab = (slabs, qty) =>
  slabs.filter((s) => s.minQuantity <= qty && (s.maxQuantity == null || s.maxQuantity >= qty))
       .sort((a, b) => b.minQuantity - a.minQuantity)[0] ?? null;

(async () => {
  const agent = await prisma.user.findFirst({ where: { fullName: { contains: AGENT_NAME_CONTAINS, mode: 'insensitive' } } });
  if (!agent) { console.log(`No user matching "${AGENT_NAME_CONTAINS}"`); await prisma.$disconnect(); return; }
  console.log(`Agent: ${agent.fullName} (${agent.id})\n`);

  const from = new Date(YEAR, MONTH - 1, 1);
  const to = new Date(YEAR, MONTH, 1);

  const orders = await prisma.order.findMany({
    where: { salesAgentId: agent.id, status: { not: 'CANCELLED' }, orderDate: { gte: from, lt: to }, isSample: false, isTest: false, isParcelBooking: false },
    orderBy: { orderDate: 'asc' },
    include: { items: { include: { product: { select: { id: true, name: true, gsm: true, sizeInches: true } } } } },
  });

  console.log(`${orders.length} order(s) found for ${YEAR}-${String(MONTH).padStart(2, '0')}\n`);

  const productIds = Array.from(new Set(orders.flatMap((o) => o.items.map((i) => i.productId))));
  const costSlabs = await prisma.productCostSlab.findMany({ where: { productId: { in: productIds } } });
  const costMap = new Map();
  for (const s of costSlabs) { const arr = costMap.get(s.productId) ?? []; arr.push(s); costMap.set(s.productId, arr); }

  let totalGrossProfit = 0;
  for (const order of orders) {
    for (const item of order.items) {
      const slabs = costMap.get(item.productId) ?? [];
      const costSlab = matchSlab(slabs, item.quantity);
      const lineTotal = Number(item.lineTotal);
      const unitPrice = Number(item.unitPrice);
      let costPerUnit = null, costItemTotal = null, grossProfit = null;
      if (costSlab) {
        const rawCost = Number(costSlab.unitPrice);
        costPerUnit = rawCost > unitPrice ? rawCost / costSlab.minQuantity : rawCost;
        costItemTotal = costPerUnit * item.quantity;
        grossProfit = lineTotal - costItemTotal;
        totalGrossProfit += grossProfit;
      }
      const flag = grossProfit !== null && Math.abs(grossProfit) > 50000 ? '  <<<< SUSPICIOUS' : '';
      console.log(
        `Order #${order.orderNumber}  ${item.product?.name ?? '?'} (${item.product?.sizeInches ?? '?'}, ${item.product?.gsm ?? '?'}gsm)  ` +
        `qty=${item.quantity}  unitPrice=${unitPrice}  lineTotal=${lineTotal}  ` +
        (costSlab
          ? `costSlab[unitPrice=${Number(costSlab.unitPrice)}, minQty=${costSlab.minQuantity}, maxQty=${costSlab.maxQuantity}]  costPerUnit=${costPerUnit}  costItemTotal=${costItemTotal}  grossProfit=${grossProfit}${flag}`
          : `NO COST SLAB MATCHED (hasCost=false, excluded from grossProfit sum)`)
      );
    }
  }
  console.log(`\nTotal grossProfit (sum of all matched lines): ${totalGrossProfit}`);

  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
