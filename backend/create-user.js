const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const p = new PrismaClient();

async function main() {
  const users = [
    { fullName: 'Sanket Admin', email: 'sanket.rareprint@gmail.com', role: 'ADMIN', password: 'Admin@1234' },
    { fullName: 'Accounts Manager', email: 'accounts@rareprint.com', role: 'ACCOUNTS', password: 'Accounts@1234' },
    { fullName: 'Sales Agent', email: 'agent@rareprint.com', role: 'SALES_AGENT', password: 'Agent@1234' },
    { fullName: 'Production Manager', email: 'production@rareprint.com', role: 'PRODUCTION', password: 'Production@1234' },
    { fullName: 'Dispatch Manager', email: 'dispatch@rareprint.com', role: 'DISPATCH', password: 'Dispatch@1234' },
  ];

  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 10);
    await p.user.create({
      data: {
        fullName: u.fullName,
        email: u.email,
        passwordHash: hash,
        role: u.role,
      }
    });
    console.log('Created:', u.email, '| Password:', u.password);
  }
}

main()
  .catch(console.error)
  .finally(() => p.$disconnect());