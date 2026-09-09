require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const rows = await prisma.shipment.findMany({
    where: { dispatchType: 'COURIER', courierChargeActual: null },
    select: { shipmentNumber: true, awbNumber: true, carrierName: true, notes: true, createdAt: true },
    take: 10,
    orderBy: { createdAt: 'desc' },
  });
  for (const r of rows) console.log(JSON.stringify(r, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });