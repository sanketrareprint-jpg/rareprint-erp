import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const gstAccount = await prisma.paymentAccount.findFirst({
  where: { name: { contains: 'GST', mode: 'insensitive' } }
});
console.log('GST Account:', gstAccount?.id, gstAccount?.name);

const payments = await prisma.payment.findMany({
  where: {
    verificationStatus: 'VERIFIED',
    verifiedAt: {
      gte: new Date('2026-06-05T00:00:00+05:30'),
      lt:  new Date('2026-06-06T00:00:00+05:30'),
    },
    paymentAccountId: gstAccount.id,
  },
  select: { id: true }
});
const ids = payments.map(p => p.id);
console.log('Payments to revert:', ids.length);

// Reset matched bank transactions to MANUAL_REVIEW
const bankReset = await prisma.bankTransaction.updateMany({
  where: { matchedPaymentId: { in: ids }, reconcileStatus: 'MATCHED_PAYMENT' },
  data: { reconcileStatus: 'MANUAL_REVIEW', matchedPaymentId: null }
});
console.log('Bank txns reset:', bankReset.count);

// Revert payments to PENDING_VERIFICATION
const payReset = await prisma.payment.updateMany({
  where: { id: { in: ids } },
  data: { verificationStatus: 'PENDING_VERIFICATION', verifiedById: null, verifiedAt: null }
});
console.log('Payments reverted:', payReset.count);

await prisma.$disconnect();
