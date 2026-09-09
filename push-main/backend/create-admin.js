const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash('password', 10);
  const user = await prisma.user.create({
    data: {
      fullName: 'Sanket Admin',
      email: 'sanket.rareprint@gmail.com',
      passwordHash: hash,
      role: 'ADMIN',
    }
  });
  console.log('Created:', user.email);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
