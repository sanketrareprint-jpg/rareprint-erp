/**
 * add-courier-charges-to-invoices.js
 *
 * One-off backfill for "bill the courier charge taken from the customer on
 * their invoice" (2026-09-26, resumed 2026-09-28). New orders get this
 * automatically (common/sync-invoice-courier-charge.ts); this brings past
 * orders in line.
 *
 * Per invoiced order, in one transaction:
 *   0. Duplicate parcels: before 2026-09-28 every parcel booked from one Book
 *      Shipment submission got a copy of the order's courier charge (e.g.
 *      order 1067: ₹900 on 4 parcels = ₹3,600). Parcels whose charge equals
 *      the order's Book Shipment charge (Order.courierChargeQuoted) now count
 *      once: the first keeps it, the others are set to ₹0. Different amounts
 *      are separate charges and are kept. The order's courierChargeQuoted is
 *      then cleared once a parcel carries it, so a later parcel can't copy it
 *      again (same rule dispatch.service.ts bookItems now follows).
 *   1. Restore payments that had the courier part cut out, now that the
 *      invoice asks for it:
 *        a. the 2026-09-24/25 correction (resync-invoice-paid-amounts.js) —
 *           note "[date correction] ₹X courier freight excluded from this
 *           payment (was ₹Y)" → amount back to Y (the first "was" = original);
 *        b. Bigship COD remittances posted with the courier part excluded —
 *           note "(of which ₹X was courier charge collected from customer,
 *           excluded from this payment …)" → amount + X.
 *      An audit note is appended; if the payment already has PAYMENT_IN
 *      ledger rows, an adjustment pair is added for the difference.
 *   2. If step 1a removed freight but the order's courier box
 *      (Shipment.courierChargeCollected) is still empty, fill the first
 *      COURIER shipment with the amount that was removed (Sanket confirmed
 *      those amounts were courier charges).
 *   3. Invoice.courierCharge = sum of COURIER shipments' courierChargeCollected;
 *      totalAmount and balanceAmount move by the difference, and the charge's
 *      18% GST (it INCLUDES GST) moves taxable/tax/CGST/SGST/IGST — same rule
 *      and ledger lines as sync-invoice-courier-charge.ts.
 *   4. Invoice.paidAmount = sum of VERIFIED payments; balanceAmount moves by
 *      the change (so credit-note / loyalty adjustments already applied to the
 *      balance are kept).
 * Order.grandTotal is never touched (commission/loyalty/sales exclude courier).
 * Safe to re-run: restored payments carry a marker and are skipped; invoices
 * already in sync are unchanged.
 *
 * Uses the app's own GST split (dist/), so build first:  npm run build
 *   node scripts/add-courier-charges-to-invoices.js            (dry run, prints before/after)
 *   node scripts/add-courier-charges-to-invoices.js --apply    (writes)
 *   add --csv=<file> to also write the full before/after list as CSV
 *
 * backend/.env is PRODUCTION — set $env:DATABASE_URL to target another DB.
 */
const path = require('path');
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true }); } catch {}
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { courierGstSplit, COURIER_GST_RATE_PCT } = require('../dist/src/common/sync-invoice-courier-charge');

if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set — refusing to run.'); process.exit(1); }
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const APPLY = process.argv.includes('--apply');
const csvArg = process.argv.find((a) => a.startsWith('--csv='));
const TODAY = new Date().toISOString().slice(0, 10);
const RESTORED_MARKER = 'courier now billed on invoice';
const toPaise = (n) => Math.round(Number(n) * 100) / 100;

const CORRECTION_RE = /\[\d{4}-\d{2}-\d{2} correction\] ₹([\d.]+) courier freight excluded from this payment \(was ₹([\d.]+)\)/g;
const REMITTANCE_RE = /\(of which ₹([\d.]+) was courier charge collected from customer, excluded from this payment/;

// What a payment's amount should be restored to, or null if it wasn't cut.
function restorePlan(p) {
  const notes = p.notes ?? '';
  if (notes.includes(RESTORED_MARKER)) return null;
  const corrections = [...notes.matchAll(CORRECTION_RE)];
  if (corrections.length > 0) {
    const original = toPaise(corrections[0][2]);
    const cut = toPaise(corrections.reduce((s, m) => s + Number(m[1]), 0));
    return { kind: 'correction', original, cut };
  }
  const rem = notes.match(REMITTANCE_RE);
  if (rem) {
    const cut = toPaise(rem[1]);
    return { kind: 'remittance', original: toPaise(Number(p.amount) + cut), cut };
  }
  return null;
}

// Step 0: parcels that are copies of the order's one Book Shipment charge.
function duplicatePlan(order) {
  const quoted = order.courierChargeQuoted != null ? toPaise(order.courierChargeQuoted) : null;
  if (!quoted) return { dupIds: [], clearQuoted: false };
  const carrying = order.shipments.filter((s) => s.courierChargeCollected != null && toPaise(s.courierChargeCollected) === quoted);
  return { dupIds: carrying.slice(1).map((s) => s.id), clearQuoted: carrying.length > 0 };
}

async function main() {
  const host = (() => { try { return new URL(process.env.DATABASE_URL).host; } catch { return '?'; } })();
  console.log(`Database: ${host}   Mode: ${APPLY ? 'APPLY' : 'DRY-RUN (no writes)'}   Courier GST: ${COURIER_GST_RATE_PCT}% (included in the charge)\n`);
  // Invoice.courierCharge is added by scripts/ensure-invoice-courier-charge-column.js.
  // A dry run works without it (treated as 0); --apply requires it.
  const hasCourierColumn = (await prisma.$queryRawUnsafe(
    `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Invoice' AND column_name='courierCharge'`,
  )).length > 0;
  if (APPLY && !hasCourierColumn) {
    console.error('Invoice.courierCharge column missing — run scripts/ensure-invoice-courier-charge-column.js first.');
    process.exit(1);
  }
  if (!hasCourierColumn) console.log("(Invoice.courierCharge column not added yet — treating every invoice's current courier charge as ₹0)\n");

  const invoices = await prisma.invoice.findMany({
    select: {
      id: true, invoiceNumber: true, orderId: true, totalAmount: true, paidAmount: true, balanceAmount: true,
      gstTreatment: true, taxableAmount: true, taxAmount: true, cgstAmount: true, sgstAmount: true, igstAmount: true,
      ...(hasCourierColumn ? { courierCharge: true } : {}),
      order: {
        select: {
          id: true, orderNumber: true, customerId: true, isTest: true, courierChargeQuoted: true, customer: { select: { businessName: true } },
          payments: { select: { id: true, amount: true, notes: true, verificationStatus: true, paymentAccount: { select: { name: true } } } },
          shipments: { where: { dispatchType: 'COURIER' }, orderBy: { createdAt: 'asc' }, select: { id: true, courierChargeCollected: true } },
        },
      },
    },
  });

  const rows = [];
  for (const inv of invoices) {
    const payments = inv.order.payments;
    const restores = payments.map((p) => ({ p, plan: restorePlan(p) })).filter((r) => r.plan);
    const correctionCut = toPaise(restores.filter((r) => r.plan.kind === 'correction').reduce((s, r) => s + r.plan.cut, 0));

    const dup = duplicatePlan(inv.order);
    const shipmentsAfterDedupe = inv.order.shipments.map((s) => (dup.dupIds.includes(s.id) ? { ...s, courierChargeCollected: 0 } : s));
    const boxBefore = toPaise(shipmentsAfterDedupe.reduce((s, sh) => s + Number(sh.courierChargeCollected ?? 0), 0));
    const duplicateRemoved = toPaise(inv.order.shipments.reduce((s, sh) => s + Number(sh.courierChargeCollected ?? 0), 0) - boxBefore);
    const fillBox = boxBefore === 0 && correctionCut > 0;
    const noShipmentToFill = fillBox && inv.order.shipments.length === 0;
    const courierAfter = fillBox && !noShipmentToFill ? correctionCut : boxBefore;

    const verifiedAfter = toPaise(payments.reduce((s, p) => {
      if (p.verificationStatus !== 'VERIFIED') return s;
      const r = restores.find((x) => x.p.id === p.id);
      return s + (r ? r.plan.original : Number(p.amount));
    }, 0));

    const courierBefore = toPaise(inv.courierCharge ?? 0);
    const totalBefore = toPaise(inv.totalAmount);
    const paidBefore = toPaise(inv.paidAmount);
    const balanceBefore = toPaise(inv.balanceAmount);
    const courierDiff = toPaise(courierAfter - courierBefore);
    const totalAfter = toPaise(totalBefore + courierDiff);
    const paidDiff = toPaise(verifiedAfter - paidBefore);
    const balanceAfter = toPaise(balanceBefore + courierDiff - paidDiff);
    const gstBefore = courierGstSplit(courierBefore, inv.gstTreatment);
    const gstAfter = courierGstSplit(courierAfter, inv.gstTreatment);
    const gstDelta = (k) => toPaise(gstAfter[k] - gstBefore[k]);

    if (restores.length === 0 && courierDiff === 0 && paidDiff === 0 && dup.dupIds.length === 0 && !dup.clearQuoted) continue;
    rows.push({ inv, restores, dup, duplicateRemoved, fillBox: fillBox && !noShipmentToFill, noShipmentToFill, correctionCut, courierBefore, courierAfter, courierDiff, courierGst: gstAfter.taxAmount, gstDelta, verifiedAfter, paidDiff, totalBefore, totalAfter, paidBefore, balanceBefore, balanceAfter });
  }

  const billing = rows.filter((r) => r.courierDiff !== 0 || r.paidDiff !== 0 || r.restores.length > 0);
  const zero = billing.filter((r) => r.balanceAfter === 0);
  const owing = billing.filter((r) => r.balanceAfter > 0);
  const excess = billing.filter((r) => r.balanceAfter < 0);
  const dups = rows.filter((r) => r.dup.dupIds.length > 0);
  console.log(`Invoices checked: ${invoices.length}   Invoice totals/payments changing: ${billing.length}`);
  console.log(`  payments restored: ${rows.reduce((s, r) => s + r.restores.length, 0)} (24-25 Sept corrections: ${rows.reduce((s, r) => s + r.restores.filter((x) => x.plan.kind === 'correction').length, 0)}, COD postings: ${rows.reduce((s, r) => s + r.restores.filter((x) => x.plan.kind === 'remittance').length, 0)})`);
  console.log(`  empty courier boxes filled: ${rows.filter((r) => r.fillBox).length}${rows.some((r) => r.noShipmentToFill) ? `   (no courier shipment to fill: ${rows.filter((r) => r.noShipmentToFill).map((r) => r.inv.invoiceNumber).join(', ')})` : ''}`);
  console.log(`  courier charges added to invoices: ₹${toPaise(rows.reduce((s, r) => s + r.courierDiff, 0))} (of which GST ₹${toPaise(rows.reduce((s, r) => s + r.gstDelta('taxAmount'), 0))})`);
  console.log(`  duplicate parcel charges removed: ${dups.reduce((s, r) => s + r.dup.dupIds.length, 0)} parcel(s) on ${dups.length} order(s), ₹${toPaise(dups.reduce((s, r) => s + r.duplicateRemoved, 0))}`);
  console.log(`  leftover Book Shipment charge cleared on ${rows.filter((r) => r.dup.clearQuoted).length} order(s)`);
  console.log(`  balance after: ₹0 → ${zero.length}   still owing → ${owing.length}   excess → ${excess.length}\n`);

  const line = (r) => `  ${r.inv.invoiceNumber.padEnd(6)} ${r.inv.order.customer.businessName.trim().slice(0, 30).padEnd(30)} total ₹${r.totalBefore} → ₹${r.totalAfter} (courier ₹${r.courierAfter}, GST ₹${r.courierGst}) | received ₹${r.paidBefore} → ₹${r.verifiedAfter} | balance ₹${r.balanceBefore} → ₹${r.balanceAfter}${r.fillBox ? ' | box filled' : ''}${r.dup.dupIds.length ? ` | ${r.dup.dupIds.length} duplicate parcel(s) −₹${r.duplicateRemoved}` : ''}${r.inv.order.isTest ? ' | TEST' : ''}`;
  if (dups.length) { console.log('Orders with a courier charge copied onto several parcels (counted once now):'); dups.forEach((r) => console.log(line(r))); console.log(); }
  if (owing.length) { console.log('Still owing after the change:'); owing.forEach((r) => console.log(line(r))); console.log(); }
  if (excess.length) { console.log('Excess received after the change:'); excess.forEach((r) => console.log(line(r))); console.log(); }

  if (csvArg) {
    const file = csvArg.split('=')[1];
    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const header = 'invoice,customer,total_before,courier_charge,courier_gst_included,total_after,received_before,received_after,balance_before,balance_after,payments_restored,courier_box_filled,duplicate_parcels_zeroed,duplicate_amount_removed';
    const body = billing.concat(rows.filter((r) => !billing.includes(r))).map((r) => [r.inv.invoiceNumber, r.inv.order.customer.businessName.trim(), r.totalBefore, r.courierAfter, r.courierGst, r.totalAfter, r.paidBefore, r.verifiedAfter, r.balanceBefore, r.balanceAfter, r.restores.length, r.fillBox ? 'yes' : '', r.dup.dupIds.length || '', r.duplicateRemoved || ''].map(esc).join(','));
    fs.writeFileSync(file, [header, ...body].join('\n'));
    console.log(`Full list written to ${file}\n`);
  }

  if (!APPLY) { console.log('Dry-run only — nothing written. Re-run with --apply to make these changes.'); return; }

  for (const r of rows) {
    await prisma.$transaction(async (tx) => {
      for (const id of r.dup.dupIds) {
        await tx.shipment.update({ where: { id }, data: { courierChargeCollected: 0, courierChargeUpdatedAt: new Date() } });
      }
      if (r.dup.clearQuoted) {
        await tx.order.update({ where: { id: r.inv.order.id }, data: { courierChargeQuoted: null } });
      }
      for (const { p, plan } of r.restores) {
        const diff = toPaise(plan.original - Number(p.amount));
        const note = `[${TODAY} restored] ₹${diff} courier charge put back (was ₹${toPaise(p.amount)}) — ${RESTORED_MARKER}.`;
        await tx.payment.update({ where: { id: p.id }, data: { amount: plan.original, notes: p.notes ? `${p.notes}\n${note}` : note } });
        const hasLedger = await tx.accountingLedgerEntry.count({ where: { referenceType: 'PAYMENT', referenceId: p.id } });
        if (hasLedger > 0 && diff !== 0) {
          const common = { entryType: 'PAYMENT_IN', referenceType: 'PAYMENT', referenceId: p.id, customerId: r.inv.order.customerId, orderId: r.inv.orderId, invoiceId: r.inv.id };
          await tx.accountingLedgerEntry.createMany({
            data: [
              { ...common, accountName: p.paymentAccount.name, debitAmount: diff, creditAmount: 0, narration: `Courier charge restored to payment for invoice ${r.inv.invoiceNumber}` },
              { ...common, accountName: 'Customer Receivable', debitAmount: 0, creditAmount: diff, narration: `Receivable adjusted for invoice ${r.inv.invoiceNumber} (courier charge restored)` },
            ],
          });
        }
      }
      if (r.fillBox) {
        await tx.shipment.update({ where: { id: r.inv.order.shipments[0].id }, data: { courierChargeCollected: r.correctionCut, courierChargeUpdatedAt: new Date() } });
      }
      await tx.invoice.update({
        where: { id: r.inv.id },
        data: {
          courierCharge: r.courierAfter, totalAmount: r.totalAfter, paidAmount: r.verifiedAfter, balanceAmount: r.balanceAfter,
          taxableAmount: toPaise(Number(r.inv.taxableAmount) + r.gstDelta('taxableAmount')),
          taxAmount: toPaise(Number(r.inv.taxAmount) + r.gstDelta('taxAmount')),
          cgstAmount: toPaise(Number(r.inv.cgstAmount) + r.gstDelta('cgstAmount')),
          sgstAmount: toPaise(Number(r.inv.sgstAmount) + r.gstDelta('sgstAmount')),
          igstAmount: toPaise(Number(r.inv.igstAmount) + r.gstDelta('igstAmount')),
        },
      });
      if (r.courierDiff !== 0) {
        // Same balanced set as sync-invoice-courier-charge.ts.
        const common = {
          referenceType: 'INVOICE', referenceId: r.inv.id, customerId: r.inv.order.customerId, orderId: r.inv.orderId, invoiceId: r.inv.id,
          narration: `Courier charges on invoice ${r.inv.invoiceNumber} set to ₹${r.courierAfter} incl. ${COURIER_GST_RATE_PCT}% GST (was ₹${r.courierBefore})`,
        };
        const up = r.courierDiff > 0;
        const taxablePart = Math.abs(r.gstDelta('taxableAmount'));
        const gstPart = Math.abs(r.gstDelta('taxAmount'));
        await tx.accountingLedgerEntry.createMany({
          data: [
            { ...common, entryType: up ? 'DEBIT_NOTE' : 'CREDIT_NOTE', accountName: 'Customer Receivable', debitAmount: up ? Math.abs(r.courierDiff) : 0, creditAmount: up ? 0 : Math.abs(r.courierDiff) },
            { ...common, entryType: 'ADJUSTMENT', accountName: 'Courier Charges', debitAmount: up ? 0 : taxablePart, creditAmount: up ? taxablePart : 0 },
            ...(gstPart > 0 ? [{ ...common, entryType: 'GST', accountName: 'Output GST', debitAmount: up ? 0 : gstPart, creditAmount: up ? gstPart : 0 }] : []),
          ],
        });
      }
    });
  }
  console.log(`Applied to ${rows.length} invoice(s).`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
