import { PrismaClient } from '@prisma/client';
import { BUSINESS_RULES_SEED } from './src/business-rules/business-rules.seed';

const prisma = new PrismaClient();

async function main() {
  for (const rule of BUSINESS_RULES_SEED) {
    await prisma.businessRule.upsert({
      where: { ruleCode: rule.ruleCode },
      update: rule,
      create: rule,
    });
  }
  console.log('Seeded', BUSINESS_RULES_SEED.length, 'rules');
  await prisma.$disconnect();
}

main();
