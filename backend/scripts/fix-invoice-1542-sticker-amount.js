/**
 * fix-invoice-1542-sticker-amount.js
 *
 * One-off: invoice RP/2026-27/1542 (MAHARASHTRA MEDICAL STORE) — the
 * "STICKER 1*0.75" line (20000 PCS) was billed at ₹2,500 and should be
 * ₹3,000 (₹0.15/pc). The order is already dispatched, so neither the
 * super-admin item edit nor an upsell can be used (both refuse dispatched
 * orders) — this script applies the same changes those paths would:
 *
 *   - OrderItem: unitPrice 0.15, lineTotal 3000
 *   - Order: subtotal / grandTotal +500, paymentStatus recomputed with the
 *     same rule as OrdersService.superAdminEditItem
 *   - InvoiceItem (the sticker line): unitPrice / taxableAmount / lineTotal
 *   - Invoice: subtotal / taxableAmount / totalAmount / balanceAmount +500
 *     (paidAmount untouched — money received doesn't change)
 *   - Ledger: one DEBIT_NOTE on "Customer Receivable" for +500, same shape as
 *     AccountsService.reconcileInvoiceToRemainingItems' increase branch
 *   - StatusLog: audit entry with before/after (status itself unchanged)
 *
 * The sticker line is billed at 0% GST, so no GST amounts change; the script
 * refuses to run if that line's GST rate is anything but 0. It also refuses if
 * the current numbers don't match what's expected (₹2,500 line), so running it
 * twice is a no-op.
 *
 * HOW TO RUN (from your own machine, needs real DATABASE_URL to Railway):
 *   cd backend
 *   node scripts/fix-invoice-1542-sticker-amount.js           # dry run — shows what would change
 *   node scripts/fix-invoice-1542-sticker-amount.js --apply   # actually applies it
 */

require('dotenv/config');

const { PrismaClient, Prisma } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

if (!process.env.DATABASE_URL) {
  console.error('No DATABASE_URL set — refusing to run.');
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Stored without the "RP/2026-27/" prefix the PDF adds.
const INVOICE_NUMBER = '1542';
const QUANTITY = 20000;
const OLD_LINE_TOTAL = 2500;
const NEW_UNIT_PRICE = 0.15;
const NEW_LINE_TOTAL = 3000;
const INCREASE = NEW_LINE_TOTAL - OLD_LINE_TOTAL;
const SUPER_ADMIN_EMAIL = 'sanket.rareprint@gmail.com';
const apply = process.argv.includes('--apply');

const money = (n) => Math.round(Number(n) * 100) / 100;

async function main() {
  // Explicit selects (and `select: { id: true }` on every write below) so the
  // script never touches columns the local Prisma client knows about but the
  // live DB may not have yet (e.g. uncommitted schema work).
  const invoice = await prisma.invoice.findUnique({
    where: { invoiceNumber: INVOICE_NUMBER },
    select: {
      id: true, subtotal: true, taxableAmount: true, totalAmount: true, paidAmount: true, balanceAmount: true, courierCharge: true,
      items: { select: { id: true, productName: true, sku: true, quantity: true, unitPrice: true, taxableAmount: true, gstRatePct: true, lineTotal: true } },
      order: {
        select: {
          id: true, orderNumber: true, customerId: true, status: true, subtotal: true, grandTotal: true, paymentStatus: true,
          customer: { select: { businessName: true } },
          payments: { select: { amount: true } },
          items: { select: { id: true, quantity: true, unitPrice: true, lineTotal: true, cancelledAt: true, product: { select: { name: true } } } },
        },
      },
    },
  });
  if (!invoice) return console.log(`Invoice ${INVOICE_NUMBER} not found — nothing done.`);
  const order = invoice.order;

  console.log(`Invoice ${INVOICE_NUMBER} → order ${order.orderNumber} (${order.customer?.businessName}), status ${order.status}`);
  console.log(`Order: subtotal=${order.subtotal} grandTotal=${order.grandTotal} paymentStatus=${order.paymentStatus}`);
  console.log(`Invoice: subtotal=${invoice.subtotal} taxable=${invoice.taxableAmount} total=${invoice.totalAmount} paid=${invoice.paidAmount} balance=${invoice.balanceAmount} courier=${invoice.courierCharge}`);
  for (const i of order.items) {
    console.log(`  order item ${i.id}: ${i.product?.name} qty=${i.quantity} unitPrice=${i.unitPrice} lineTotal=${i.lineTotal}${i.cancelledAt ? ' (cancelled)' : ''}`);
  }
  for (const i of invoice.items) {
    console.log(`  invoice item ${i.id}: ${i.productName} sku=${i.sku} qty=${i.quantity} unitPrice=${i.unitPrice} taxable=${i.taxableAmount} gst=${i.gstRatePct}% lineTotal=${i.lineTotal}`);
  }

  const orderItems = order.items.filter((i) => !i.cancelledAt && i.quantity === QUANTITY);
  if (orderItems.length !== 1) return console.log(`\nExpected exactly one ${QUANTITY}-qty order item, found ${orderItems.length} — stopping.`);
  const orderItem = orderItems[0];
  if (money(orderItem.lineTotal) === NEW_LINE_TOTAL) return console.log('\nOrder item is already ₹3,000 — nothing to do.');
  if (money(orderItem.lineTotal) !== OLD_LINE_TOTAL) return console.log(`\nOrder item lineTotal is ${orderItem.lineTotal}, expected ${OLD_LINE_TOTAL} — stopping.`);

  const invoiceItems = invoice.items.filter((i) => i.quantity === QUANTITY && money(i.lineTotal) === OLD_LINE_TOTAL);
  if (invoiceItems.length !== 1) return console.log(`\nExpected exactly one matching ₹${OLD_LINE_TOTAL} invoice line, found ${invoiceItems.length} — stopping.`);
  const invoiceItem = invoiceItems[0];
  if (Number(invoiceItem.gstRatePct) !== 0) return console.log(`\nInvoice line GST is ${invoiceItem.gstRatePct}%, not 0% — this script only handles 0% GST. Stopping.`);

  const newOrderSubtotal = money(Number(order.subtotal) + INCREASE);
  const newGrandTotal = money(Number(order.grandTotal) + INCREASE);
  // Same rule as OrdersService.superAdminEditItem.
  const totalPaid = order.payments.reduce((s, p) => s + Number(p.amount), 0);
  let paymentStatus = 'PENDING';
  if (totalPaid > 0) paymentStatus = totalPaid >= newGrandTotal ? 'PAID' : 'PARTIALLY_PAID';

  const newInvoice = {
    subtotal: money(Number(invoice.subtotal) + INCREASE),
    taxableAmount: money(Number(invoice.taxableAmount) + INCREASE),
    totalAmount: money(Number(invoice.totalAmount) + INCREASE),
    balanceAmount: money(Number(invoice.balanceAmount) + INCREASE),
  };

  console.log('\nWould change:');
  console.log(`  order item: unitPrice ${orderItem.unitPrice} → ${NEW_UNIT_PRICE}, lineTotal ${orderItem.lineTotal} → ${NEW_LINE_TOTAL}`);
  console.log(`  order: subtotal ${order.subtotal} → ${newOrderSubtotal}, grandTotal ${order.grandTotal} → ${newGrandTotal}, paymentStatus ${order.paymentStatus} → ${paymentStatus}`);
  console.log(`  invoice line: unitPrice ${invoiceItem.unitPrice} → ${NEW_UNIT_PRICE}, taxable ${invoiceItem.taxableAmount} → ${NEW_LINE_TOTAL}, lineTotal ${invoiceItem.lineTotal} → ${NEW_LINE_TOTAL}`);
  console.log(`  invoice: subtotal ${invoice.subtotal} → ${newInvoice.subtotal}, taxable ${invoice.taxableAmount} → ${newInvoice.taxableAmount}, total ${invoice.totalAmount} → ${newInvoice.totalAmount}, balance ${invoice.balanceAmount} → ${newInvoice.balanceAmount}`);
  console.log(`  ledger: DEBIT_NOTE Customer Receivable ₹${INCREASE}`);

  if (!apply) return console.log('\nDry run only — re-run with --apply to make the change.');

  const superAdmin = await prisma.user.findFirst({ where: { email: SUPER_ADMIN_EMAIL }, select: { id: true } });
  const narration = `Manual price correction — invoice ${INVOICE_NUMBER} increased by ₹${INCREASE}`;
  const before = { unitPrice: Number(orderItem.unitPrice), lineTotal: Number(orderItem.lineTotal), invoiceTotal: Number(invoice.totalAmount) };
  const after = { unitPrice: NEW_UNIT_PRICE, lineTotal: NEW_LINE_TOTAL, invoiceTotal: newInvoice.totalAmount };

  await prisma.$transaction(async (tx) => {
    await tx.orderItem.update({
      where: { id: orderItem.id },
      data: { unitPrice: new Prisma.Decimal(NEW_UNIT_PRICE), lineTotal: new Prisma.Decimal(NEW_LINE_TOTAL) },
      select: { id: true },
    });
    await tx.order.update({
      where: { id: order.id },
      data: { subtotal: new Prisma.Decimal(newOrderSubtotal), grandTotal: new Prisma.Decimal(newGrandTotal), paymentStatus },
      select: { id: true },
    });
    await tx.invoiceItem.update({
      where: { id: invoiceItem.id },
      data: {
        unitPrice: new Prisma.Decimal(NEW_UNIT_PRICE),
        taxableAmount: new Prisma.Decimal(NEW_LINE_TOTAL),
        lineTotal: new Prisma.Decimal(NEW_LINE_TOTAL),
      },
      select: { id: true },
    });
    await tx.invoice.update({ where: { id: invoice.id }, data: newInvoice, select: { id: true } });
    await tx.accountingLedgerEntry.create({
      data: {
        entryType: 'DEBIT_NOTE',
        accountName: 'Customer Receivable',
        debitAmount: INCREASE,
        creditAmount: 0,
        narration,
        referenceType: 'INVOICE',
        referenceId: invoice.id,
        customerId: order.customerId,
        orderId: order.id,
        invoiceId: invoice.id,
      },
      select: { id: true },
    });
    await tx.statusLog.create({
      data: {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: order.status,
        changedById: superAdmin?.id ?? null,
        reason: `${narration}: ${orderItem.product?.name} — before ${JSON.stringify(before)} → after ${JSON.stringify(after)}`,
        metadata: { eventType: 'MANUAL_PRICE_CORRECTION', itemId: orderItem.id, invoiceItemId: invoiceItem.id, before, after },
      },
      select: { id: true },
    });
  });

  console.log('\nDone.');
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
