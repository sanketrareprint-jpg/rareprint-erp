/**
 * One-time script: rename orders 10589→1207, 10590→1208, 10591→1209
 * Run from project root: node fix-order-numbers.js
 */
const { PrismaClient } = require('./backend/node_modules/@prisma/client');
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL || require('fs').readFileSync('./backend/.env', 'utf8').match(/DATABASE_URL="([^"]+)"/)?.[1] } },
});

async function main() {
  const renames = [
    { from: '10589', to: '1210' },
    { from: '10590', to: '1211' },
  ];

  for (const { from, to } of renames) {
    const order = await prisma.order.findUnique({ where: { orderNumber: from } });
    if (!order) { console.log(`Order ${from} not found — skipping`); continue; }

    const conflict = await prisma.order.findUnique({ where: { orderNumber: to } });
    if (conflict) { console.log(`Order number ${to} already taken — skipping ${from}`); continue; }

    await prisma.order.update({ where: { orderNumber: from }, data: { orderNumber: to } });
    console.log(`✅ Renamed ${from} → ${to}`);
  }

  console.log('Done.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
