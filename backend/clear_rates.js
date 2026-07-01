const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.productRateSlab.count()
  .then(n => { console.log('Before:', n); return prisma.productRateSlab.deleteMany({}); })
  .then(r => { console.log('Deleted:', r.count, 'rows'); })
  .catch(e => console.error(e.message))
  .finally(() => prisma.$disconnect());
