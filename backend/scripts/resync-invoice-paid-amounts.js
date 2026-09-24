/**
 * resync-invoice-paid-amounts.js
 *
 * One-off repair for invoices whose paidAmount/balanceAmount drifted from
 * their order's VERIFIED payments. Root cause (fixed 2026-09-24): posting a
 * Bigship COD remittance (RemittanceService.postRecord) and deleting a
 * verified payment (AccountsService.deletePayment) changed which payments
 * were verified without updating Invoice.paidAmount — so the invoice PDF and
 * Billing > Parties showed those orders as unpaid / wrong balance.
 *
 * What it does, per invoice:
 *   A. Verified payments <= invoice total: set paidAmount = verified total,
 *      balanceAmount = totalAmount - paidAmount (same rule verifyPayment uses).
 *   B. Verified payments  > invoice total (COURIER FREIGHT CASE): the excess
 *      is courier freight the customer paid in cash on delivery, which Bigship
 *      bundled into the remittance and which was posted as a goods payment
 *      before RemittanceService.postRecord started excluding it (confirmed
 *      with Sanket, 2026-09-24). Same correction postRecord now applies to new
 *      remittances:
 *        - reduce the order's POSTED remittance payment(s) by the excess
 *          (newest first; manual/advance payments are never touched), and
 *          append an audit note with the original amount to each one;
 *        - record the excluded freight on the matching COURIER shipment's
 *          courierChargeCollected (matched by AWB) when that is still empty;
 *        - then resync the invoice as in A (balance becomes 0) and the order's
 *          paymentStatus.
 *      Skipped and reported if the excess is larger than the remittance
 *      payments themselves (then it can't be COD freight).
 *   C. POSTED remittance payments on invoiced orders with no PAYMENT_IN
 *      ledger entry get the same two ledger rows verifyPayment writes
 *      (entryDate = payment verifiedAt; amount = the corrected amount).
 * RemittanceRecord rows (the courier's own report) are never modified.
 * Each invoice is corrected in its own transaction. Safe to re-run: a second
 * run finds nothing to change.
 *
 * Dry-run first (shows what WOULD change, writes nothing):
 *   node scripts/resync-invoice-paid-amounts.js
 * Apply:
 *   node scripts/resync-invoice-paid-amounts.js --apply
 * Apply, but leave every over-paid invoice (case B) untouched:
 *   node scripts/resync-invoice-paid-amounts.js --apply --non-negative-only
 * Treat only excesses up to N as freight (larger ones left for review):
 *   node scripts/resync-invoice-paid-amounts.js --apply --max-freight=3000
 *
 * NOTE: backend/.env points at LIVE PRODUCTION. Set $env:DATABASE_URL in the
 * shell first to target a different database (dotenv won't override it).
 */

const path = require('path');
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch {}

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set — refusing to run.');
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const APPLY = process.argv.includes('--apply');
const NON_NEGATIVE_ONLY = process.argv.includes('--non-negative-only');
// --max-freight=N: over-paid invoices whose excess is above N are left for
// review instead of treated as freight (an excess bigger than any plausible
// courier charge is more likely a double payment than freight).
const maxFreightArg = process.argv.find((a) => a.startsWith('--max-freight='));
const MAX_FREIGHT = maxFreightArg ? Number(maxFreightArg.split('=')[1]) : null;
// --freight-from-courier-box: for over-paid invoices, exclude only the
// courier charge the team typed into Dispatch > Courier Charges (sum of the
// order's COURIER shipments' courierChargeCollected, capped at the excess),
// instead of treating the whole excess as freight. Any remainder is left as
// a real (negative-balance) overpayment. Cut from COD remittance payments
// first, then from other payments, newest first. Added 2026-09-24 for the 11
// invoices held back from the first run (Sanket's call).
const FREIGHT_FROM_BOX = process.argv.includes('--freight-from-courier-box');
// --only=1203,1209,...: restrict to these invoice numbers.
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const ONLY = onlyArg ? new Set(onlyArg.split('=')[1].split(',').map((s) => s.trim()).filter(Boolean)) : null;
const TODAY = new Date().toISOString().slice(0, 10);

const toPaise = (n) => Math.round(Number(n) * 100) / 100;
const normalizeAwb = (raw) => String(raw ?? '').trim().replace(/\.0+$/, '');

// Splits `excess` across remittance payments, newest first. Returns null when
// the remittance payments can't cover it (then it isn't COD freight).
function allocateExcess(excess, remittancePayments) {
  const sorted = [...remittancePayments].sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate));
  return allocateInOrder(excess, sorted);
}

// Same as allocateExcess, but takes the payments already in the order they
// should be cut from.
function allocateInOrder(excess, orderedPayments) {
  let remaining = excess;
  const cuts = [];
  for (const p of orderedPayments) {
    if (remaining <= 0) break;
    const cut = toPaise(Math.min(Number(p.amount), remaining));
    if (cut > 0) cuts.push({ payment: p, cut, newAmount: toPaise(Number(p.amount) - cut) });
    remaining = toPaise(remaining - cut);
  }
  return remaining > 0 ? null : cuts;
}

async function main() {
  const host = (() => { try { return new URL(process.env.DATABASE_URL).host; } catch { return '?'; } })();
  console.log(`Database: ${host}   Mode: ${APPLY ? 'APPLY' : 'DRY-RUN (no writes)'}${NON_NEGATIVE_ONLY ? '   (--non-negative-only)' : ''}\n`);

  const postedRecords = await prisma.remittanceRecord.findMany({
    where: { matchStatus: 'POSTED', postedPaymentId: { not: null } },
    select: { postedPaymentId: true },
  });
  const remittancePaymentIds = new Set(postedRecords.map((r) => r.postedPaymentId));

  const invoices = await prisma.invoice.findMany({
    include: {
      order: {
        select: {
          id: true,
          orderNumber: true,
          isTest: true,
          grandTotal: true,
          customer: { select: { businessName: true } },
          payments: { where: { verificationStatus: 'VERIFIED' } },
          shipments: { where: { dispatchType: 'COURIER' }, select: { id: true, awbNumber: true, courierChargeCollected: true } },
        },
      },
    },
  });

  const resyncOnly = [];     // case A
  const freightFixes = [];   // case B
  const skipped = [];        // case B that can't be explained by remittance payments
  for (const inv of invoices) {
    const verifiedTotal = toPaise(inv.order.payments.reduce((s, p) => s + Number(p.amount), 0));
    const total = toPaise(inv.totalAmount);
    // Only invoices whose stored paid amount is out of sync (i.e. hit by the
    // remittance/delete bug). Invoices already over-paid and in sync predate
    // this bug and are a separate matter — never touched here.
    if (verifiedTotal === toPaise(inv.paidAmount)) continue;
    if (ONLY && !ONLY.has(inv.invoiceNumber)) continue;
    if (verifiedTotal > total && FREIGHT_FROM_BOX) {
      const excess = toPaise(verifiedTotal - total);
      const box = toPaise(inv.order.shipments.reduce((s, sh) => s + (sh.courierChargeCollected == null ? 0 : Number(sh.courierChargeCollected)), 0));
      const freight = toPaise(Math.min(box, excess));
      if (freight <= 0) {
        resyncOnly.push({ inv, verifiedTotal, storedPaid: toPaise(inv.paidAmount), newBalance: toPaise(total - verifiedTotal) });
        continue;
      }
      const byNewest = (a, b) => new Date(b.paymentDate) - new Date(a.paymentDate);
      const ordered = [
        ...inv.order.payments.filter((p) => remittancePaymentIds.has(p.id)).sort(byNewest),
        ...inv.order.payments.filter((p) => !remittancePaymentIds.has(p.id)).sort(byNewest),
      ];
      const cuts = allocateInOrder(freight, ordered);
      freightFixes.push({ inv, excess: freight, cuts, storedPaid: toPaise(inv.paidAmount), newBalance: toPaise(total - (verifiedTotal - freight)) });
      continue;
    }
    if (verifiedTotal > total) {
      if (NON_NEGATIVE_ONLY) { skipped.push({ inv, reason: 'over-paid (left for review: --non-negative-only)' }); continue; }
      const excess = toPaise(verifiedTotal - total);
      if (MAX_FREIGHT != null && excess > MAX_FREIGHT) { skipped.push({ inv, reason: `excess ₹${excess} is above --max-freight=${MAX_FREIGHT} — too large to assume it is courier freight` }); continue; }
      const remittancePayments = inv.order.payments.filter((p) => remittancePaymentIds.has(p.id));
      const cuts = allocateExcess(excess, remittancePayments);
      if (!cuts) {
        skipped.push({ inv, reason: `excess ₹${excess} is more than its COD remittance payments (₹${toPaise(remittancePayments.reduce((s, p) => s + Number(p.amount), 0))})` });
        continue;
      }
      freightFixes.push({ inv, excess, cuts, storedPaid: toPaise(inv.paidAmount) });
    } else {
      resyncOnly.push({ inv, verifiedTotal, storedPaid: toPaise(inv.paidAmount), newBalance: toPaise(total - verifiedTotal) });
    }
  }

  console.log(`Invoices checked: ${invoices.length}`);
  console.log(`\nA. Resync paid/balance only: ${resyncOnly.length}`);
  for (const d of resyncOnly) {
    console.log(`  Invoice ${d.inv.invoiceNumber} — ${d.inv.order.customer.businessName.trim()}: paid ₹${d.storedPaid} → ₹${d.verifiedTotal}, balance ₹${toPaise(d.inv.balanceAmount)} → ₹${d.newBalance}`);
  }
  console.log(`\nB. Courier freight excluded from COD payment, then resynced to balance ₹0: ${freightFixes.length} (total freight ₹${toPaise(freightFixes.reduce((s, f) => s + f.excess, 0))})`);
  for (const f of freightFixes) {
    const parts = f.cuts.map((c) => `payment ${c.payment.referenceNumber ?? c.payment.id} ₹${toPaise(c.payment.amount)} → ₹${c.newAmount}`).join('; ');
    console.log(`  Invoice ${f.inv.invoiceNumber} — ${f.inv.order.customer.businessName.trim()}: invoice ₹${toPaise(f.inv.totalAmount)}, freight ₹${f.excess} [${parts}]${f.newBalance != null ? ` → balance ₹${f.newBalance}` : ''}`);
  }
  console.log(`\nSkipped (not changed): ${skipped.length}`);
  for (const s of skipped) console.log(`  Invoice ${s.inv.invoiceNumber} — ${s.inv.order.customer.businessName.trim()}: ${s.reason}`);

  if (APPLY) {
    for (const d of resyncOnly) {
      await prisma.invoice.update({ where: { id: d.inv.id }, data: { paidAmount: d.verifiedTotal, balanceAmount: d.newBalance } });
    }
    for (const f of freightFixes) {
      await prisma.$transaction(async (tx) => {
        for (const c of f.cuts) {
          const note = `[${TODAY} correction] ₹${c.cut} courier freight excluded from this payment (was ₹${toPaise(c.payment.amount)}) — customer paid freight in COD; recorded under Dispatch > Courier Charges instead.`;
          await tx.payment.update({
            where: { id: c.payment.id },
            data: { amount: c.newAmount, notes: c.payment.notes ? `${c.payment.notes}\n${note}` : note },
          });
          const shipment = f.inv.order.shipments.find((s) => s.awbNumber && normalizeAwb(s.awbNumber) === normalizeAwb(c.payment.referenceNumber));
          if (!FREIGHT_FROM_BOX && shipment && shipment.courierChargeCollected == null) {
            await tx.shipment.update({ where: { id: shipment.id }, data: { courierChargeCollected: c.cut, courierChargeUpdatedAt: new Date() } });
          }
        }
        const verified = await tx.payment.findMany({ where: { orderId: f.inv.orderId, verificationStatus: 'VERIFIED' }, select: { amount: true } });
        const paid = toPaise(verified.reduce((s, p) => s + Number(p.amount), 0));
        await tx.invoice.update({ where: { id: f.inv.id }, data: { paidAmount: paid, balanceAmount: toPaise(Number(f.inv.totalAmount) - paid) } });
        const grandTotal = toPaise(f.inv.order.grandTotal);
        await tx.order.update({
          where: { id: f.inv.orderId },
          data: { paymentStatus: paid >= grandTotal ? 'PAID' : paid > 0 ? 'PARTIALLY_PAID' : 'PENDING' },
        });
      });
    }
  }

  // ── C. Ledger entries — computed AFTER B so amounts are the corrected ones ──
  const payments = await prisma.payment.findMany({
    where: { id: { in: Array.from(remittancePaymentIds) }, verificationStatus: 'VERIFIED', order: { invoice: { isNot: null } } },
    include: { paymentAccount: { select: { name: true } }, order: { select: { customerId: true, invoice: true } } },
  });
  const existingLedger = await prisma.accountingLedgerEntry.findMany({
    where: { referenceType: 'PAYMENT', referenceId: { in: payments.map((p) => p.id) } },
    select: { referenceId: true },
  });
  const hasLedger = new Set(existingLedger.map((e) => e.referenceId));
  const skippedOrderIds = new Set(skipped.map((s) => s.inv.orderId));
  const missingLedger = payments.filter((p) => !hasLedger.has(p.id) && Number(p.amount) > 0 && !skippedOrderIds.has(p.orderId));
  console.log(`\nC. COD payments given missing ledger entries: ${missingLedger.length}${APPLY ? '' : ' (amounts shown before any freight correction above)'}`);

  if (!APPLY) {
    console.log('\nDry-run only — nothing written. Re-run with --apply to make these changes.');
    return;
  }

  for (const p of missingLedger) {
    const inv = p.order.invoice;
    const common = {
      entryDate: p.verifiedAt ?? p.paymentDate,
      entryType: 'PAYMENT_IN',
      referenceType: 'PAYMENT',
      referenceId: p.id,
      customerId: p.order.customerId,
      orderId: p.orderId,
      invoiceId: inv.id,
    };
    await prisma.accountingLedgerEntry.createMany({
      data: [
        { ...common, accountName: p.paymentAccount.name, debitAmount: p.amount, creditAmount: 0, narration: `Payment received for invoice ${inv.invoiceNumber}` },
        { ...common, accountName: 'Customer Receivable', debitAmount: 0, creditAmount: p.amount, narration: `Receivable adjusted for invoice ${inv.invoiceNumber}` },
      ],
    });
  }
  console.log(`\nApplied: ${resyncOnly.length} invoice(s) resynced, ${freightFixes.length} freight correction(s), ${missingLedger.length} payment(s) given ledger entries.`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
