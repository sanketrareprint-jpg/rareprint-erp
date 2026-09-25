/**
 * inspect-order-1695.js — READ-ONLY diagnostic, no writes.
 * Dumps order 1695 (Sri Ganesh dental clinic) items, products, pricing,
 * invoice, payments, sheet/jobwork links — to plan a 250→300 GSM change.
 *
 * Usage: node scripts/inspect-order-1695.js
 */
const path = require('path');
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch {}

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const order = await prisma.order.findFirst({
    where: { orderNumber: '1695' },
    include: {
      customer: true,
      items: {
        include: {
          product: { include: { category: true } },
          sheetItems: true,
          jobWorks: true,
          commissionOverride: true,
        },
      },
      payments: true,
    },
  });
  if (!order) { console.log('Order 1695 NOT FOUND'); return; }

  console.log('ORDER', order.id, 'no=', order.orderNumber, 'status=', order.status,
    'customer=', order.customer?.name, order.customer?.id);
  console.log('  totals: sub=', String(order.subtotal), 'disc=', String(order.discountAmount ?? ''),
    'tax=', String(order.taxAmount ?? ''), 'total=', String(order.totalAmount),
    'paid=', String(order.paidAmount ?? ''), 'balance=', String(order.balanceAmount ?? ''));
  console.log('  createdAt=', order.createdAt, 'updatedAt=', order.updatedAt);
  console.log('  ALL ORDER FIELDS:', JSON.stringify(order, (k, v) => (k === 'items' || k === 'payments' || k === 'customer' ? undefined : v), 2));

  for (const it of order.items) {
    console.log('\n  ITEM', it.id);
    console.log('    product=', it.product.name, '| sku=', it.product.sku, '| id=', it.product.id);
    console.log('    gsm=', it.product.gsm, 'paperType=', it.product.paperType,
      'size=', it.product.sizeInches, 'openSize=', it.product.openSizeInches,
      'sides=', it.product.sides, 'printingType=', it.product.printingType,
      'category=', it.product.category?.name, it.product.categoryId);
    console.log('    qty=', it.quantity, 'unitPrice=', String(it.unitPrice),
      'lineDiscount=', String(it.lineDiscount), 'taxPct=', String(it.taxRatePct),
      'taxAmount=', String(it.taxAmount), 'lineTotal=', String(it.lineTotal));
    console.log('    prodCategory=', it.productionCategory, 'stage=', it.itemProductionStage,
      'dispatchedAt=', it.dispatchedAt, 'cancelledAt=', it.cancelledAt);
    console.log('    artworkNotes=', JSON.stringify(it.artworkNotes));
    console.log('    productionNotes=', JSON.stringify(it.productionNotes));
    console.log('    customFields=', JSON.stringify(it.customFields));
    console.log('    sheetItems=', it.sheetItems.length, it.sheetItems.map(s => s.id + ':' + s.sheetId).join(','));
    console.log('    jobWorks=', it.jobWorks.length, it.jobWorks.map(j => j.id + ':' + j.status + ':' + String(j.cost)).join(','));
    console.log('    commissionOverride=', it.commissionOverride ? JSON.stringify(it.commissionOverride) : 'none');
  }

  console.log('\n  PAYMENTS:', order.payments.length);
  for (const p of order.payments) {
    console.log('   ', p.id, String(p.amount), p.method, p.verificationStatus, p.paymentDate);
  }

  const invoice = await prisma.invoice.findUnique({
    where: { orderId: order.id },
    include: { items: true },
  });
  if (!invoice) console.log('\n  NO INVOICE');
  else {
    console.log('\n  INVOICE', invoice.id, invoice.invoiceNumber, 'status=', invoice.status,
      'total=', String(invoice.totalAmount), 'createdAt=', invoice.createdAt);
    for (const i of invoice.items) {
      console.log('   InvoiceItem', i.id, '|', i.productName, '| qty=', i.quantity,
        '| unit=', String(i.unitPrice), '| line=', String(i.lineTotal),
        '| desc=', JSON.stringify(i.description ?? null));
    }
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
