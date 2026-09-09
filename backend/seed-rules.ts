import { PrismaClient } from '@prisma/client';
import { BUSINESS_RULES_SEED } from './src/business-rules/business-rules.seed';
import { DEFAULT_TENANT_ID } from './src/common/tenant';

const prisma = new PrismaClient();

async function main() {
  for (const rule of BUSINESS_RULES_SEED) {
    await prisma.businessRule.upsert({
      where: { tenantId_ruleCode: { tenantId: DEFAULT_TENANT_ID, ruleCode: rule.ruleCode } },
      update: rule,
      create: { ...rule, tenantId: DEFAULT_TENANT_ID },
    });
  }
  console.log('Seeded', BUSINESS_RULES_SEED.length, 'rules');
  await prisma.$disconnect();
}

main();
