/**
 * clear-sales-rates.js
 * Deletes ALL rows from ProductRateSlab (sales rates) in the ERP database.
 * Run from: C:\Users\ZEB\Desktop\print-erp-clean\backend\
 *   > node ..\clear-sales-rates.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const before = await prisma.productRateSlab.count();
  console.log(`ProductRateSlab rows before: ${before}`);

  const result = await prisma.productRateSlab.deleteMany({});
  console.log(`Deleted: ${result.count} rows`);

  const after = await prisma.productRateSlab.count();
  console.log(`ProductRateSlab rows after: ${after}`);
}

main()
  .catch((e) => {
    console.error('Error:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
