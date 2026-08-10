/**
 * find-profit-anomalies.js
 *
 * READ-ONLY diagnostic. Dashboard is showing a huge negative "Today's
 * Profit" (-3.6L gross on only 45.8K of sales) and a deeply negative
 * "This Month Profit" too — a loss that size relative to sales isn't
 * possible from real pricing, it means at least one order/product is
 * hitting a wildly inflated computed cost.
 *
 * Reproduces the exact cost calculation used by
 * cost-table.service.ts::lineCostTotal() (the function behind the
 * Dashboard's profit KPIs), per order line, and flags any line where the
 * computed cost is disproportionate to the sale price — pinpointing the
 * exact order + product + Cost Table slab responsible instead of just the
 * aggregate number.
 *
 * Usage (read-only, never writes anything):
 *   node scripts/find-profit-anomalies.js                # today + this month
 *   node scripts/find-profit-anomalies.js --month=2026-08 # a specific month
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const monthArg = process.argv.find((a) => a.startsWith('--month='));

function istDayRange(d = new Date()) {
  const istOffsetMs = 330 * 60 * 1000;
  const ist = new Date(d.getTime() + istOffsetMs);
  const start = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - istOffsetMs);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

function istMonthRange(monthStr) {
  const istOffsetMs = 330 * 60 * 1000;
  let y, m;
  if (monthStr) {
    [y, m] = monthStr.split('-').map(Number);
    m -= 1;
  } else {
    const ist = new Date(Date.now() + istOffsetMs);
    y = ist.getUTCFullYear();
    m = ist.getUTCMonth();
  }
  return {
    start: new Date(Date.UTC(y, m, 1) - istOffsetMs),
    end: new Date(Date.UTC(y, m + 1, 1) - istOffsetMs),
  };
}

const matchSlab = (slabs, qty) =>
  slabs.filter((s) => s.minQuantity <= qty && (s.maxQuantity == null || s.maxQuantity >= qty))
       .sort((a, b) => b.minQuantity - a.minQuantity)[0] ?? null;

async function scanRange(label, start, end) {
  const orders = await prisma.order.findMany({
    where: { orderDate: { gte: start, lt: end }, status: { not: 'CANCELLED' }, isSample: false },
    include: {
      salesAgent: { select: { fullName: true } },
      items: { include: { product: { include: { category: true, costSlabs: true } } } },
    },
    orderBy: { orderDate: 'desc' },
  });

  console.log(`\n=== ${label}: scanning ${orders.length} orders ===`);

  let totalSale = 0, totalCost = 0;
  const anomalies = [];

  for (const order of orders) {
    for (const item of order.items) {
      const lineTotal = Number(item.lineTotal);
      const salePerUnit = Number(item.unitPrice);
      totalSale += lineTotal;
      const slab = matchSlab(item.product?.costSlabs ?? [], item.quantity);
      if (!slab) continue; // matches profitRows(): missing cost -> excluded from aggregate, not counted as loss
      const raw = Number(slab.unitPrice);
      const costPerUnit = raw > salePerUnit ? raw / slab.minQuantity : raw;
      const lineCost = costPerUnit * item.quantity;
      totalCost += lineCost;

      // Flag anything where cost blows past sale by more than 2x, or the
      // computed per-unit cost is more than 5x the per-unit sale price --
      // both are strong signals of a bad slab entry (e.g. a batch-total
      // price stored under a tiny minQuantity, or a stray extra zero).
      const costToSaleRatio = lineTotal > 0 ? lineCost / lineTotal : (lineCost > 0 ? Infinity : 0);
      const perUnitRatio = salePerUnit > 0 ? costPerUnit / salePerUnit : (costPerUnit > 0 ? Infinity : 0);
      if (costToSaleRatio > 2 || perUnitRatio > 5) {
        anomalies.push({
          orderNumber: order.orderNumber,
          orderDate: order.orderDate.toISOString().slice(0, 10),
          agent: order.salesAgent?.fullName ?? 'Unknown',
          product: item.product?.name ?? 'Unknown',
          quantity: item.quantity,
          salePerUnit,
          lineTotal,
          matchedSlab: { minQuantity: slab.minQuantity, maxQuantity: slab.maxQuantity, unitPrice: raw },
          computedCostPerUnit: Number(costPerUnit.toFixed(2)),
          computedLineCost: Number(lineCost.toFixed(2)),
          costToSaleRatio: Number(costToSaleRatio.toFixed(1)),
        });
      }
    }
  }

  console.log(`Total sale: Rs.${totalSale.toFixed(0)}  |  Total computed cost: Rs.${totalCost.toFixed(0)}  |  Gross: Rs.${(totalSale - totalCost).toFixed(0)}`);

  if (anomalies.length === 0) {
    console.log('No disproportionate lines found in this range.');
    return;
  }
  console.log(`\nFound ${anomalies.length} anomalous line(s):`);
  for (const a of anomalies) {
    console.log(
      `\n  Order ${a.orderNumber} (${a.orderDate}) — ${a.agent}\n` +
      `    Product: "${a.product}"  qty ${a.quantity}  sale/unit Rs.${a.salePerUnit}  line total Rs.${a.lineTotal}\n` +
      `    Matched Cost Table slab: minQty=${a.matchedSlab.minQuantity} maxQty=${a.matchedSlab.maxQuantity ?? 'null'} unitPrice=Rs.${a.matchedSlab.unitPrice}\n` +
      `    Computed cost/unit: Rs.${a.computedCostPerUnit}  ->  line cost Rs.${a.computedLineCost}  (${a.costToSaleRatio}x the sale price)`,
    );
  }
}

async function main() {
  if (monthArg) {
    const { start, end } = istMonthRange(monthArg.split('=')[1]);
    await scanRange(`Month ${monthArg.split('=')[1]}`, start, end);
  } else {
    const today = istDayRange();
    await scanRange('Today', today.start, today.end);
    const month = istMonthRange();
    await scanRange('This month', month.start, month.end);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
