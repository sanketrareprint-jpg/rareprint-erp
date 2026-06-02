const path = require('path');
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch {}

const { PrismaClient, OrderStatus } = require('@prisma/client');
const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');

async function main() {
  const orders = await prisma.order.findMany({
    where: {
      status: OrderStatus.APPROVED,
      items: { some: { itemProductionStage: 'READY_FOR_DISPATCH' } },
      statusLogs: {
        some: {
          fromStatus: OrderStatus.READY_FOR_DISPATCH,
          toStatus: OrderStatus.APPROVED,
          reason: { contains: 'Returned from dispatch queue' },
        },
      },
    },
    select: { id: true, orderNumber: true },
  });

  console.log(`${apply ? 'Fixing' : 'Would fix'} ${orders.length} order(s) back to READY_FOR_DISPATCH.`);
  for (const o of orders) console.log(`  - ${o.orderNumber}`);
  if (!apply || orders.length === 0) return;

  await prisma.$transaction(
    orders.flatMap((o) => [
      prisma.order.update({ where: { id: o.id }, data: { status: OrderStatus.READY_FOR_DISPATCH } }),
      prisma.statusLog.create({
        data: {
          orderId: o.id,
          fromStatus: OrderStatus.APPROVED,
          toStatus: OrderStatus.READY_FOR_DISPATCH,
          reason: 'Corrected: restored to READY_FOR_DISPATCH so sales can submit for dispatch approval',
        },
      }),
    ])
  );
  console.log('Done.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
