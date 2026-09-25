/**
 * Diagnostic (READ-ONLY, makes NO changes): invoice 1545 (INDIA MEDICAL
 * STORE) shows "Received: ₹0.00" / "Balance: ₹5,800.00" / "Current Balance:
 * ₹3,400.00" on the generated PDF, even though the customer made two
 * payments (₹500 + ₹2,400 = ₹2,900) and the Dispatch/Book Shipment modal
 * correctly shows Paid ₹2,900 / Balance ₹2,900.
 *
 * Code-level findings so far (from billing.service.ts / accounts.service.ts
 * / orders.service.ts):
 *
 * 1. Invoice.paidAmount / Invoice.balanceAmount are a CACHED snapshot, not
 *    computed live. They're set once at invoice creation
 *    (createInvoiceAndLedger, from VERIFIED payments only) and only ever
 *    refreshed afterwards by accounts.service.ts's verifyPayment() -- which
 *    re-syncs them from the sum of that order's VERIFIED payments, but only
 *    runs when an Accounts user clicks "Verify" on a specific payment in the
 *    Pending Payments queue.
 *
 * 2. orders.service.ts's addPayment() -- the function that records a new
 *    payment against an order -- creates the Payment row (default status:
 *    PENDING_VERIFICATION) and updates Order.paymentStatus, but NEVER
 *    touches the linked Invoice. So a payment that is added but never run
 *    through the Accounts verification queue will never reach
 *    Invoice.paidAmount, no matter how long it sits there.
 *
 * 3. dispatch.service.ts's paymentCredit()/paymentBalanceDue() (which feed
 *    the Book Shipment modal's Paid/Balance fields) sum ALL of the order's
 *    payments with NO verificationStatus filter -- so that modal shows a
 *    payment as "paid" immediately on entry, verified or not. This is a
 *    DIFFERENT definition of "paid" than the invoice uses.
 *
 * This script checks, against the real production data, which of these
 * explains order 1545, and also checks the customer's OTHER invoices to
 * explain the "Current Balance: 3,400" figure (billing.service.ts's
 * getPartyLedger() sums (totalAmount - paidAmount) across ALL of the
 * customer's invoices in date order -- so it's a cumulative figure, not
 * this invoice's own balance, and it inherits the exact same staleness
 * bug from every other invoice in the chain).
 *
 * Schema-drift note: uses raw SQL throughout (same reason as the existing
 * diagnose-order-1574-cod.js -- avoids Prisma's typed client touching the
 * not-yet-migrated tenantId column).
 *
 * Run from the backend/ folder:
 *   node diagnose-invoice-1545-payment-sync.js
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const ORDER_NUMBER = '1545';

function money(n) {
  return Number(n ?? 0).toFixed(2);
}

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const orders = await prisma.$queryRaw`
      SELECT o.id AS "orderId", o."orderNumber", o."customerId", o."grandTotal",
             o.status, o."paymentStatus"
      FROM "Order" o
      WHERE o."orderNumber" = ${ORDER_NUMBER}
    `;
    if (orders.length === 0) {
      console.log(`Order ${ORDER_NUMBER} not found.`);
      return;
    }
    const order = orders[0];

    console.log('=== ORDER', ORDER_NUMBER, '===');
    console.log('id:', order.orderId, ' status:', order.status, ' paymentStatus:', order.paymentStatus);
    console.log('grandTotal:', money(order.grandTotal));
    console.log();

    const payments = await prisma.$queryRaw`
      SELECT id, amount, method, "verificationStatus", "paymentDate", "verifiedAt", "createdAt"
      FROM "Payment"
      WHERE "orderId" = ${order.orderId}
      ORDER BY "paymentDate" ASC
    `;
    console.log('=== PAYMENTS ON THIS ORDER ===');
    let liveVerifiedTotal = 0;
    let liveAllTotal = 0;
    for (const p of payments) {
      liveAllTotal += Number(p.amount);
      if (p.verificationStatus === 'VERIFIED') liveVerifiedTotal += Number(p.amount);
      console.log(
        `  ₹${money(p.amount)} via ${p.method} | status: ${p.verificationStatus} | recorded: ${p.createdAt?.toISOString?.()} | verifiedAt: ${p.verifiedAt?.toISOString?.() ?? '(never verified)'}`
      );
    }
    if (payments.length === 0) console.log('  (no payment rows found)');
    console.log();
    console.log('Sum of ALL payments (what Dispatch/Book Shipment shows):', money(liveAllTotal));
    console.log('Sum of VERIFIED payments only:', money(liveVerifiedTotal));
    console.log();

    const invoices = await prisma.$queryRaw`
      SELECT id, "invoiceNumber", "issueDate", "totalAmount", "paidAmount", "balanceAmount"
      FROM "Invoice"
      WHERE "orderId" = ${order.orderId}
    `;
    if (invoices.length === 0) {
      console.log('No Invoice row exists for this order (order was never approved/invoiced?).');
      return;
    }
    const invoice = invoices[0];
    console.log('=== INVOICE', invoice.invoiceNumber, '(the PDF you looked at) ===');
    console.log('totalAmount:', money(invoice.totalAmount));
    console.log('paidAmount (stored, what the PDF prints as "Received"):', money(invoice.paidAmount));
    console.log('balanceAmount (stored, what the PDF prints as "Balance"):', money(invoice.balanceAmount));
    console.log();
    console.log('--- Diagnosis for THIS invoice ---');
    if (Number(invoice.paidAmount) === liveVerifiedTotal) {
      console.log('Invoice.paidAmount MATCHES the live verified-payment sum.');
      if (liveVerifiedTotal === 0 && liveAllTotal > 0) {
        console.log('=> Both payments are still PENDING_VERIFICATION. The invoice is correctly');
        console.log('   showing ₹0 received by the code\'s own (intentional) rule: only Accounts-');
        console.log('   verified money counts as "Received" on the invoice. This is NOT a sync bug --');
        console.log('   it is waiting on someone to click Verify in Accounts > Pending Payments.');
      } else {
        console.log('=> No desync found for this invoice specifically.');
      }
    } else {
      console.log(`Invoice.paidAmount (${money(invoice.paidAmount)}) does NOT match the live verified sum (${money(liveVerifiedTotal)}).`);
      console.log('=> This invoice is genuinely out of sync -- confirms the addPayment()/verifyPayment() gap.');
    }
    console.log();

    // ── Customer-wide ledger (explains "Current Balance") ──────────────────
    const customerInvoices = await prisma.$queryRaw`
      SELECT i.id, i."invoiceNumber", i."issueDate", i."totalAmount", i."paidAmount", i."balanceAmount",
             i."orderId"
      FROM "Invoice" i
      JOIN "Order" o ON o.id = i."orderId"
      WHERE o."customerId" = ${order.customerId} AND COALESCE(o."isTest", false) = false
      ORDER BY i."issueDate" ASC
    `;
    console.log('=== ALL INVOICES FOR THIS CUSTOMER (oldest first) -- drives "Current Balance" ===');
    let runningBalance = 0;
    for (const inv of customerInvoices) {
      runningBalance += Number(inv.totalAmount) - Number(inv.paidAmount);

      const invPayments = await prisma.$queryRaw`
        SELECT COALESCE(SUM(amount), 0) AS "verifiedSum"
        FROM "Payment"
        WHERE "orderId" = ${inv.orderId} AND "verificationStatus" = 'VERIFIED'
      `;
      const liveVerified = Number(invPayments[0].verifiedSum);
      const flag = Number(inv.paidAmount) !== liveVerified ? '  <-- OUT OF SYNC (stored paidAmount != live verified payments)' : '';

      console.log(
        `  ${inv.invoiceNumber} (${inv.issueDate?.toISOString?.().slice(0, 10)}): total ${money(inv.totalAmount)}, stored paid ${money(inv.paidAmount)}, live verified ${money(liveVerified)}, running balance after this invoice: ${money(runningBalance)}${flag}`
      );
    }
    console.log();
    console.log('Final running balance (= this invoice\'s "Current Balance" on the PDF):', money(runningBalance));
    console.log();
    console.log('If any row above is flagged OUT OF SYNC, that invoice\'s stale paidAmount is');
    console.log('what is pulling "Current Balance" away from this invoice\'s own Balance figure.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exitCode = 1;
});
