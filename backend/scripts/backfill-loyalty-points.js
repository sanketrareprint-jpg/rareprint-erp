// Backfills loyalty points for every historical order — i.e. runs the exact
// same earn calculation the live system runs on new invoices (see
// LoyaltyService.earnForOrder / loyalty.calc.ts computeEarnPoints), but
// applied retroactively to orders invoiced before the loyalty feature
// existed (migration 20260718090000_add_loyalty_points).
//
// This is why so many rows on the Loyalty page show a real order # / value
// but "0 pts" and "Last Activity: —": those orders were approved/invoiced
// before the feature shipped, so earnForOrder was never called for them and
// no wallet/transaction exists. This script closes that gap once, for every
// eligible order since the start of the ERP.
//
// SAFE BY DEFAULT: running with no flags is a DRY RUN — it computes and
// prints what WOULD happen but writes nothing. Pass --apply to actually
// write wallets/transactions/order.loyaltyPointsEarned.
//
// Idempotent / resumable: eligibility excludes any order that already has
// an EARN transaction (CustomerLoyaltyTransaction has a unique(orderId,type)
// constraint too, enforced with ON CONFLICT DO NOTHING as a second line of
// defense), so re-running this after a partial run or after the live system
// has since caught up will only touch what's still missing.
//
// Deliberately does NOT send any WhatsApp "you earned points" notifications
// — this is bookkeeping for history, not a live event, and blasting
// thousands of old-order notifications would be spammy and pointless.
//
// Run from backend/:
//   node scripts/backfill-loyalty-points.js            (dry run, safe)
//   node scripts/backfill-loyalty-points.js --apply     (writes changes)

const { Client } = require('pg');

const APPLY = process.argv.includes('--apply');

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://postgres:cpwyjHacUIgnKYAgZqHSqSGOmMjfqqYc@monorail.proxy.rlwy.net:46355/railway';

const client = new Client({ connectionString });

// ── Mirrors CostTableService.matchingSlab/lineCostTotal exactly (no changes
// to that business logic here — just replicated for a standalone script) ──
function matchingSlab(slabs, quantity) {
  const candidates = slabs
    .filter((s) => s.minQuantity <= quantity && (s.maxQuantity == null || s.maxQuantity >= quantity))
    .sort((a, b) => b.minQuantity - a.minQuantity);
  return candidates[0] ?? null;
}

function lineCostTotal(item, costSlabsByProduct) {
  const slabs = costSlabsByProduct.get(item.productId) ?? [];
  const slab = matchingSlab(slabs, item.quantity);
  if (!slab) return null;
  const raw = Number(slab.unitPrice);
  const salePerUnit = Number(item.unitPrice);
  const costPerUnit = raw > salePerUnit ? raw / slab.minQuantity : raw;
  return costPerUnit * item.quantity;
}

function computeOrderGrossProfit(order, itemsByOrder, costSlabsByProduct) {
  const items = itemsByOrder.get(order.id) ?? [];
  const saleTotal = Number(order.grandTotal);
  let costTotal = 0;
  let hasMissingCost = false;
  for (const item of items) {
    const lineCost = lineCostTotal(item, costSlabsByProduct);
    if (lineCost == null) {
      hasMissingCost = true;
      continue;
    }
    costTotal += lineCost;
  }
  if (hasMissingCost) return { grossProfit: null, hasMissingCost: true };
  return { grossProfit: Number((saleTotal - costTotal).toFixed(2)), hasMissingCost: false };
}

// ── Mirrors loyalty.calc.ts computeEarnPoints exactly ──────────────────────
function computeEarnPoints({ baseAmount, discountPct, grossProfit, hasMissingCost, earnRatePct, gpRatePct, pointCap }) {
  if (hasMissingCost || grossProfit == null || grossProfit < 0) {
    return { points: 0, flagged: true, flagReason: hasMissingCost ? 'MISSING_COST' : 'NEGATIVE_GROSS_PROFIT' };
  }
  const capByEarnRate = Math.max(0, baseAmount) * (earnRatePct / 100);
  const raw = discountPct <= 5 ? capByEarnRate : Math.min(grossProfit * (gpRatePct / 100), capByEarnRate);
  const points = Math.max(0, Math.min(Math.floor(raw), pointCap));
  return { points, flagged: false };
}

// ── Mirrors WhatsAppService.normalizePhone exactly ──────────────────────────
function normalizePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
  if (digits.length > 10) return digits;
  return null;
}

async function main() {
  await client.connect();
  console.log(APPLY ? '=== APPLY MODE — writes will be made ===' : '=== DRY RUN — no writes will be made (pass --apply to commit) ===');

  // Thresholds — same SystemConfig keys/defaults as LoyaltyService.getThresholds()
  const cfgRows = await client.query(
    `SELECT key, value FROM "SystemConfig" WHERE key = ANY($1)`,
    [['loyalty_earn_rate_pct', 'loyalty_gp_rate_pct', 'loyalty_point_cap']],
  );
  const cfgMap = Object.fromEntries(cfgRows.rows.map((r) => [r.key, r.value]));
  const earnRatePct = Number(cfgMap['loyalty_earn_rate_pct'] ?? 5);
  const gpRatePct = Number(cfgMap['loyalty_gp_rate_pct'] ?? 10);
  const pointCap = Number(cfgMap['loyalty_point_cap'] ?? 2000);
  console.log(`Thresholds: earnRatePct=${earnRatePct} gpRatePct=${gpRatePct} pointCap=${pointCap}`);

  // Eligible orders: real orders (not test/sample), not cancelled, that were
  // actually invoiced (an Invoice exists — that's the "approved" moment the
  // live system hooks earnForOrder off of), and that don't already have an
  // EARN transaction (so re-runs and orders the live system has since
  // caught up on are automatically skipped).
  const { rows: orders } = await client.query(`
    SELECT o.id, o."orderNumber", o."orderDate", o."customerId", o.subtotal, o.discount, o."grandTotal",
           c.phone, c."businessName"
    FROM "Order" o
    JOIN "Customer" c ON c.id = o."customerId"
    JOIN "Invoice" i ON i."orderId" = o.id
    LEFT JOIN "CustomerLoyaltyTransaction" t ON t."orderId" = o.id AND t.type = 'EARN'
    WHERE COALESCE(o."isTest", false) = false
      AND COALESCE(o."isSample", false) = false
      AND o.status != 'CANCELLED'
      AND t.id IS NULL
    ORDER BY o."orderDate" ASC
  `);
  console.log(`Eligible orders (invoiced, not test/sample/cancelled, not yet earned): ${orders.length}`);

  if (orders.length === 0) {
    console.log('Nothing to backfill.');
    await client.end();
    return;
  }

  const orderIds = orders.map((o) => o.id);

  // Preload items + cost slabs once (avoids N+1 across thousands of orders)
  const { rows: items } = await client.query(
    `SELECT "orderId", "productId", quantity, "unitPrice" FROM "OrderItem" WHERE "orderId" = ANY($1)`,
    [orderIds],
  );
  const itemsByOrder = new Map();
  for (const it of items) {
    if (!itemsByOrder.has(it.orderId)) itemsByOrder.set(it.orderId, []);
    itemsByOrder.get(it.orderId).push({ productId: it.productId, quantity: it.quantity, unitPrice: it.unitPrice });
  }

  const { rows: slabs } = await client.query(`SELECT "productId", "minQuantity", "maxQuantity", "unitPrice" FROM "ProductCostSlab"`);
  const costSlabsByProduct = new Map();
  for (const s of slabs) {
    if (!costSlabsByProduct.has(s.productId)) costSlabsByProduct.set(s.productId, []);
    costSlabsByProduct.get(s.productId).push(s);
  }

  let processed = 0;
  let skippedNoPhone = 0;
  let flaggedMissingCost = 0;
  let flaggedNegativeGP = 0;
  let totalPointsCredited = 0;
  let errors = 0;
  const walletsSeen = new Set();
  const sample = [];

  for (const order of orders) {
    const phone = normalizePhone(order.phone);
    if (!phone) {
      skippedNoPhone++;
      continue;
    }

    const subtotal = Number(order.subtotal);
    const discount = Number(order.discount);
    const baseAmount = subtotal - discount;
    const discountPct = subtotal > 0 ? (discount / subtotal) * 100 : 0;

    const { grossProfit, hasMissingCost } = computeOrderGrossProfit(order, itemsByOrder, costSlabsByProduct);
    const calc = computeEarnPoints({ baseAmount, discountPct, grossProfit, hasMissingCost, earnRatePct, gpRatePct, pointCap });

    if (calc.flagged) {
      if (calc.flagReason === 'MISSING_COST') flaggedMissingCost++;
      else flaggedNegativeGP++;
    }

    walletsSeen.add(phone);
    processed++;
    totalPointsCredited += calc.points;
    if (sample.length < 15) {
      sample.push({ order: order.orderNumber, customer: order.businessName, points: calc.points, flagged: calc.flagged, flagReason: calc.flagReason ?? '' });
    }

    if (!APPLY) continue;

    try {
      await client.query('BEGIN');

      const walletRes = await client.query(
        `INSERT INTO "CustomerLoyaltyWallet" (id, phone, "customerId", points, "createdAt", "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, 0, NOW(), NOW())
         ON CONFLICT (phone) DO UPDATE SET "customerId" = $2, "updatedAt" = NOW()
         RETURNING id`,
        [phone, order.customerId],
      );
      const walletId = walletRes.rows[0].id;

      if (calc.points > 0) {
        await client.query(
          `UPDATE "CustomerLoyaltyWallet" SET points = points + $1, "updatedAt" = NOW() WHERE id = $2`,
          [calc.points, walletId],
        );
      }

      const reason = calc.flagged ? `[Backfill] Flagged: ${calc.flagReason}` : '[Backfill] Order invoiced (historical)';
      await client.query(
        `INSERT INTO "CustomerLoyaltyTransaction"
           (id, "walletId", "orderId", type, points, "baseAmount", "grossProfit", "discountPct", reason, "createdAt")
         VALUES (gen_random_uuid(), $1, $2, 'EARN', $3, $4, $5, $6, $7, NOW())
         ON CONFLICT ("orderId", type) DO NOTHING`,
        [walletId, order.id, calc.points, baseAmount, grossProfit, Number(discountPct.toFixed(2)), reason],
      );

      await client.query(`UPDATE "Order" SET "loyaltyPointsEarned" = $1 WHERE id = $2`, [calc.points, order.id]);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      errors++;
      console.error(`Error on order ${order.orderNumber}:`, err.message);
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Processed:              ${processed} / ${orders.length}`);
  console.log(`Skipped (no phone):     ${skippedNoPhone}`);
  console.log(`Flagged MISSING_COST:   ${flaggedMissingCost}`);
  console.log(`Flagged NEGATIVE_GP:    ${flaggedNegativeGP}`);
  console.log(`Distinct customers/wallets touched: ${walletsSeen.size}`);
  console.log(`Total points that ${APPLY ? 'were' : 'would be'} credited: ${totalPointsCredited}`);
  if (errors) console.log(`Errors: ${errors}`);
  console.log('\nSample (first 15):');
  console.table(sample);

  if (!APPLY) {
    console.log('\nThis was a DRY RUN — nothing was written. Re-run with --apply to commit these changes.');
  }

  await client.end();
}

main().catch((e) => {
  console.error('Fatal error:', e);
  client.end();
  process.exit(1);
});
