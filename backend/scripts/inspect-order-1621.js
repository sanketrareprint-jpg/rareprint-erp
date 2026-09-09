/**
 * inspect-order-1621.js — read-only diagnostic, no writes.
 * Prints OrderItem.productionNotes and InvoiceItem.productionNotes for
 * order/invoice 1621 side by side, to see exactly why the PDF note line
 * is still blank after the backfill.
 *
 * Usage: node scripts/inspect-order-1621.js
 */
const path = require('path');
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch {}

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const order = await prisma.order.findFirst({
    where: { orderNumber: '1621' },
    include: { items: { include: { product: true } } },
  });
  if (!order) { console.log('Order 1621 not found'); return; }
  console.log('ORDER', order.id, 'orderNumber=', order.orderNumber, 'status=', order.status);
  for (const i of order.items) {
    console.log('  OrderItem', i.id, i.product.name,
      'cancelledAt=', i.cancelledAt,
      'productionNotes=', JSON.stringify(i.productionNotes));
  }

  const invoice = await prisma.invoice.findUnique({
    where: { orderId: order.id },
    include: { items: true },
  });
  if (!invoice) { console.log('No invoice for order 1621'); return; }
  console.log('INVOICE', invoice.id, invoice.invoiceNumber, 'createdAt=', invoice.createdAt, 'updatedAt=', invoice.updatedAt);
  for (const i of invoice.items) {
    console.log('  InvoiceItem', i.id, i.productName,
      'productionNotes=', JSON.stringify(i.productionNotes));
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
