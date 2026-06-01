const path = require('path');

try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch {}

const { PrismaClient, OrderStatus } = require('@prisma/client');

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');

async function main() {
  const orders = await prisma.order.findMany({
    where: {
      status: OrderStatus.READY_FOR_DISPATCH,
      shipments: { none: {} },
      items: { some: { itemProductionStage: 'READY_FOR_DISPATCH' } },
    },
    select: { id: true, orderNumber: true },
    orderBy: { updatedAt: 'desc' },
  });

  console.log(`${apply ? 'Returning' : 'Would return'} ${orders.length} order(s) from Dispatch to sales ready list.`);
  for (const order of orders) console.log(`- ${order.orderNumber}`);

  if (!apply || orders.length === 0) return;

  await prisma.$transaction(
    orders.flatMap((order) => [
      prisma.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.APPROVED },
      }),
      prisma.statusLog.create({
        data: {
          orderId: order.id,
          fromStatus: OrderStatus.READY_FOR_DISPATCH,
          toStatus: OrderStatus.APPROVED,
          reason: 'Returned from dispatch queue for sales to resubmit COD/prepaid and courier amount',
        },
      }),
    ]),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
