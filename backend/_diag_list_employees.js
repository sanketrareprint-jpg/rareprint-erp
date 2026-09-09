require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

(async () => {
  const employees = await prisma.employee.findMany({
    select: { id: true, employeeCode: true, fullName: true, biometricId: true, status: true, department: true },
    orderBy: { employeeCode: 'asc' },
  });
  console.log(JSON.stringify(employees, null, 2));
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
