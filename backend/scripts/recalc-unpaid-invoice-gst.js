// One-off: re-split GST on existing UNPAID invoices now that products carry a
// GST rate (Product.gstRatePct). Order rates include GST, so each line total
// stays the same and GST is carved out of it — invoice totals, paid amounts
// and balances do NOT change, only the taxable/GST split does.
//
// Uses the exact same formula as the app (dist/src/common/inclusive-gst.js),
// so build first:  npm run build
//
// Picks invoices that are ISSUED, balanceAmount > 0, not test orders, and
// still at 0 GST (taxAmount = 0 and every line at 0%) — so it never touches
// an invoice twice and never touches paid invoices.
// For each changed invoice it posts two ADJUSTMENT ledger lines (Sales debit,
// Output GST credit) so the change stays auditable.
//
// Dry run by default (prints what would change). To write:
//   node scripts/recalc-unpaid-invoice-gst.js --apply
// backend/.env is PRODUCTION — set $env:DATABASE_URL to target another DB.
// Run only AFTER setting GST % on products (Admin > Database > Products).
require('dotenv/config');
const crypto = require('crypto');
const { Client } = require('pg');
const { splitInclusiveGst } = require('../dist/src/common/inclusive-gst');

const APPLY = process.argv.includes('--apply');
const round = (n) => Math.round(n * 100) / 100;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('[recalc-unpaid-invoice-gst] DATABASE_URL is not set — nothing done.');
    process.exit(1);
  }
  const host = (() => { try { return new URL(connectionString).host; } catch { return '?'; } })();
  const client = new Client({ connectionString });
  await client.connect();
  console.log(`[recalc-unpaid-invoice-gst] ${host} — ${APPLY ? 'APPLYING' : 'DRY RUN (add --apply to write)'}`);

  try {
    const { rows: invoices } = await client.query(`
      SELECT i.id, i."invoiceNumber", i."orderId", o."customerId", i."gstTreatment",
             i."taxableAmount", i."totalAmount", i."balanceAmount"
      FROM "Invoice" i JOIN "Order" o ON o.id = i."orderId"
      WHERE i.status = 'ISSUED' AND i."balanceAmount" > 0 AND i."taxAmount" = 0
        AND o."isTest" = false
        AND NOT EXISTS (SELECT 1 FROM "InvoiceItem" ii WHERE ii."invoiceId" = i.id AND ii."gstRatePct" > 0)
      ORDER BY i."invoiceNumber"`);

    let changed = 0;
    for (const inv of invoices) {
      const { rows: items } = await client.query(`
        SELECT ii.id, ii."productName", ii."lineTotal", COALESCE(p."gstRatePct", 0) AS rate
        FROM "InvoiceItem" ii LEFT JOIN "Product" p ON p.sku = ii.sku
        WHERE ii."invoiceId" = $1`, [inv.id]);

      const splits = items.map((it) => ({ it, split: splitInclusiveGst(Number(it.lineTotal), Number(it.rate), inv.gstTreatment) }));
      const sum = (k) => round(splits.reduce((s, x) => s + x.split[k], 0));
      const tax = sum('taxAmount');
      if (tax <= 0) continue;
      const newTaxable = round(Number(inv.taxableAmount) - tax);

      changed++;
      console.log(`  ${inv.invoiceNumber}: total ₹${Number(inv.totalAmount)} (unchanged) → taxable ₹${newTaxable} + GST ₹${tax}`);
      for (const { it, split } of splits) {
        if (split.taxAmount > 0) console.log(`      ${it.productName}: ₹${Number(it.lineTotal)} @ ${split.gstRatePct}% → taxable ₹${split.taxableAmount} + GST ₹${split.taxAmount}`);
      }
      if (!APPLY) continue;

      await client.query('BEGIN');
      try {
        for (const { it, split } of splits) {
          await client.query(
            `UPDATE "InvoiceItem" SET "taxableAmount"=$2, "gstRatePct"=$3, "cgstAmount"=$4, "sgstAmount"=$5, "igstAmount"=$6 WHERE id=$1`,
            [it.id, split.taxableAmount, split.gstRatePct, split.cgstAmount, split.sgstAmount, split.igstAmount],
          );
        }
        await client.query(
          `UPDATE "Invoice" SET "taxableAmount"=$2, "taxAmount"=$3, "cgstAmount"=$4, "sgstAmount"=$5, "igstAmount"=$6, "updatedAt"=now() WHERE id=$1`,
          [inv.id, newTaxable, tax, sum('cgstAmount'), sum('sgstAmount'), sum('igstAmount')],
        );
        const narration = `GST split out of rate (rate includes GST) for invoice ${inv.invoiceNumber}`;
        for (const [accountName, debit, credit] of [['Sales', tax, 0], ['Output GST', 0, tax]]) {
          await client.query(
            `INSERT INTO "AccountingLedgerEntry" (id, "entryType", "accountName", "debitAmount", "creditAmount", narration, "referenceType", "referenceId", "customerId", "orderId", "invoiceId")
             VALUES ($1, 'ADJUSTMENT', $2, $3, $4, $5, 'INVOICE', $6, $7, $8, $6)`,
            [crypto.randomUUID(), accountName, debit, credit, narration, inv.id, inv.customerId, inv.orderId],
          );
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
    }
    console.log(`[recalc-unpaid-invoice-gst] ${invoices.length} unpaid 0%-GST invoice(s) checked, ${changed} ${APPLY ? 'updated' : 'would change'}.`);
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error('[recalc-unpaid-invoice-gst] FAILED:', e.message); process.exit(1); });
