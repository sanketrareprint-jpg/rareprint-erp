const path = require('path');
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch {}

const { PrismaClient, OrderStatus } = require('@prisma/client');
const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');

// Order numbers to reverse
const ORDER_NUMBERS = process.argv.filter(a => /^\d{4,}$/.test(a));
if (ORDER_NUMBERS.length === 0) {
  console.log('Usage: node reverse-dispatch.js [--apply] 1085 1061');
  process.exit(0);
}

async function main() {
  for (const orderNo of ORDER_NUMBERS) {
    const order = await prisma.order.findFirst({
      where: { orderNumber: orderNo },
      include: {
        shipments: { orderBy: { createdAt: 'desc' }, take: 1 },
        items: { select: { id: true, itemProductionStage: true } },
      },
    });

    if (!order) { console.log(`Order ${orderNo}: NOT FOUND`); continue; }

    const shipment = order.shipments[0];
    console.log(`\nOrder ${orderNo} (${order.id})`);
    console.log(`  Status: ${order.status}`);
    console.log(`  Shipment: ${shipment ? shipment.shipmentNumber + ' — ' + shipment.status : 'none'}`);

    if (!apply) continue;

    await prisma.$transaction(async (tx) => {
      // Delete shipment
      if (shipment) {
        await tx.shipment.delete({ where: { id: shipment.id } });
        console.log(`  ✅ Deleted shipment ${shipment.shipmentNumber}`);
      }

      // Restore order status to READY_FOR_DISPATCH
      await tx.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.READY_FOR_DISPATCH },
      });

      await tx.statusLog.create({
        data: {
          orderId: order.id,
          fromStatus: order.status,
          toStatus: OrderStatus.READY_FOR_DISPATCH,
          reason: 'Dispatch reversed manually — returned to Ready for Dispatch',
        },
      });

      console.log(`  ✅ Order restored to READY_FOR_DISPATCH`);
    });
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
