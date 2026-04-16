const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const p = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash('password123', 10);
  
  // Update all users with plain text passwords
  await p.user.update({
    where: { email: 'vaishali.rareprint@gmail.com' },
    data: { passwordHash: hash }
  });
  console.log('Password reset to: password123');
}

main()
  .catch(console.error)
  .finally(() => p.$disconnect());