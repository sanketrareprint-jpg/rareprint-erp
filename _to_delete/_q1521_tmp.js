require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const p = new PrismaClient({ adapter });
(async () => {
  const order = await p.order.findFirst({
    where: { orderNumber: '1521' },
    include: {
      items: { include: { product: true, jobWorks: true, sheetItems: { include: { sheet: true } } } },
    },
  });
  console.log(JSON.stringify(order, null, 2));
  await p.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
