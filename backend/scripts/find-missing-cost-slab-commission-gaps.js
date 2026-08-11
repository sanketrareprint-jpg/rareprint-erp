/**
 * find-missing-cost-slab-commission-gaps.js
 *
 * READ-ONLY diagnostic. Finds every order line (across all agents, all time)
 * where the product has NO ProductCostSlab covering that line's exact
 * quantity — the same gap that caused Aakansha Totawar's commission to show
 * 9.5% instead of 10% on order 9172060026 (STICKER 1x0.75 90gsm Single,
 * qty 20,000 had no cost slab, so the line's commission silently went to $0).
 *
 * That bug is now fixed in cost-table.service.ts (commit 1918120): a
 * missing-cost-slab line now falls back to the normal flat commission when
 * priced rate-to-rate, and only stays $0 (flagged "needs manual review")
 * when there's a real >5% discount with no cost data to verify margin on.
 * Since commission is computed live (not stored) except for CommissionOverride
 * rows, this fix already self-corrects every past order the next time its
 * agent's commission sheet is viewed — no backfill needed.
 *
 * This script just tells you the SCOPE: which products/quantities still lack
 * a Cost Table entry, so Accounts can fill the real gaps rather than relying
 * on the fallback indefinitely, and which specific past orders were affected.
 *
 * Usage (read-only, no --apply flag — never writes anything):
 *   node scripts/find-missing-cost-slab-commission-gaps.js
 *   node scripts/find-missing-cost-slab-commission-gaps.js --month=2026-08   (optional filter)
 */

const path = require('path');
// Without this, DATABASE_URL is undefined when run manually outside Railway's
// own env (Railway injects it directly; a local/manual run only has it in
// .env) — the script would then fail to connect instead of quietly no-op'ing,
// since PrismaPg below requires a real connection string up front.
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch {}

// Prisma ORM v7 removed the `url` field from schema.prisma's datasource block —
// PrismaClient now needs a driver adapter passed explicitly instead of reading
// a connection string implicitly. Same pattern as prisma.service.ts /
// diagnose-stuck-dispatch-orders.js. See https://pris.ly/d/prisma7-client-config
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const monthArg = process.argv.find((a) => a.startsWith('--month='));
const monthFilter = monthArg ? monthArg.split('=')[1] : null; // "YYYY-MM"

const matchSlab = (slabs, qty) =>
  slabs.filter((s) => s.minQuantity <= qty && (s.maxQuantity == null || s.maxQuantity >= qty))
       .sort((a, b) => b.minQuantity - a.minQuantity)[0] ?? null;

async function main() {
  const where = { status: { not: 'CANCELLED' }, isSample: false };
  if (monthFilter) {
    const [y, m] = monthFilter.split('-').map(Number);
    where.orderDate = { gte: new Date(y, m - 1, 1), lt: new Date(y, m, 1) };
  }

  const orders = await prisma.order.findMany({
    where,
    include: {
      salesAgent: { select: { fullName: true, salesAgentCategory: true } },
      items: { include: { product: { include: { category: true, costSlabs: true, rateSlabs: true } } } },
    },
    orderBy: { orderDate: 'desc' },
  });

  console.log(`Scanning ${orders.length} orders${monthFilter ? ` in ${monthFilter}` : ' (all time)'}...\n`);

  const affectedLines = [];
  const gapsByProduct = new Map(); // productName -> Set of quantities seen without cost slab

  for (const order of orders) {
    if (!order.salesAgentId) continue;
    for (const item of order.items) {
      const costSlabs = item.product?.costSlabs ?? [];
      const rateSlabs = item.product?.rateSlabs ?? [];
      const costSlab = matchSlab(costSlabs, item.quantity);
      if (costSlab) continue; // fine, has cost coverage

      const rateSlab = matchSlab(rateSlabs, item.quantity);
      const lineTotal = Number(item.lineTotal);
      const rateAmt = rateSlab ? Number(rateSlab.rateAmount) : lineTotal;
      const discountPct = rateAmt > 0 ? Math.max(0, ((rateAmt - lineTotal) / rateAmt) * 100) : 0;
      const wasRateToRate = discountPct <= 5;

      affectedLines.push({
        orderNumber: order.orderNumber,
        orderDate: order.orderDate.toISOString().slice(0, 10),
        agent: order.salesAgent?.fullName ?? 'Unknown',
        product: item.product?.name ?? 'Unknown',
        quantity: item.quantity,
        lineTotal,
        discountPct: Number(discountPct.toFixed(1)),
        impact: wasRateToRate
          ? 'FIXED by patch — was wrongly $0, now falls back to flat commission'
          : 'STILL $0 — real discount, no cost data to verify margin, needs manual review/cost entry',
      });

      const key = item.product?.name ?? 'Unknown';
      if (!gapsByProduct.has(key)) gapsByProduct.set(key, new Set());
      gapsByProduct.get(key).add(item.quantity);
    }
  }

  console.log(`Found ${affectedLines.length} order lines with no matching Cost Table slab:\n`);
  for (const l of affectedLines) {
    console.log(
      `  Order ${l.orderNumber} (${l.orderDate}) — ${l.agent} — "${l.product}" qty ${l.quantity} — ` +
      `₹${l.lineTotal.toFixed(0)}, disc ${l.discountPct}% — ${l.impact}`,
    );
  }

  console.log(`\n── Cost Table gaps by product (fill these to stop relying on the fallback) ──`);
  for (const [product, qtys] of gapsByProduct.entries()) {
    console.log(`  ${product}: missing cost slab for quantities [${[...qtys].sort((a, b) => a - b).join(', ')}]`);
  }

  const stillZero = affectedLines.filter((l) => l.impact.startsWith('STILL'));
  console.log(`\nSummary: ${affectedLines.length} lines affected, ${affectedLines.length - stillZero.length} auto-fixed by the patch, ${stillZero.length} still need manual review (real discount + no cost data).`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
