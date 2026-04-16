const { PrismaClient } = require('@prisma/client');

const p = new PrismaClient();

async function main() {
  const users = await p.user.findMany();
  console.log('Total users:', users.length);
  users.forEach(u => console.log(u.email, u.role));
}

main()
  .catch(console.error)
  .finally(() => p.$disconnect());