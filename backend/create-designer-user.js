// One-off script to create the Designer account.
// Run this AFTER deploying deploy-designer-role.ps1 (the DESIGNER enum
// value must exist in the production database first, or this insert will
// fail with an invalid-enum-value error).
//
// Usage (from backend/, on your machine, with production DATABASE_URL
// available the same way `npx prisma migrate deploy` picks it up):
//   node create-designer-user.js

require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const bcrypt = require('bcrypt');

// Prisma ORM v7 needs a driver adapter passed explicitly (no `url` in
// schema.prisma's datasource block) — same wiring as
// backend/src/prisma/prisma.service.ts.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const p = new PrismaClient({ adapter });

async function main() {
  const fullName = 'Designer';
  const email = 'designer.rareprint@gmail.com';
  const password = 'Design123';

  const hash = await bcrypt.hash(password, 10);
  const user = await p.user.create({
    data: {
      fullName,
      email,
      passwordHash: hash,
      role: 'DESIGNER',
    },
  });
  console.log('Created:', user.email, '| Password:', password, '| id:', user.id);
}

main()
  .catch(console.error)
  .finally(() => p.$disconnect());
