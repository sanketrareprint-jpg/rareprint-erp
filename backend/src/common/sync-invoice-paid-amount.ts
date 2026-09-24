// backend/src/common/sync-invoice-paid-amount.ts
//
// Recomputes an order's Invoice.paidAmount/balanceAmount from its VERIFIED
// Payment rows — the same rule AccountsService.verifyPayment() applies when
// Accounts verifies a receipt. Needed by the other paths that change which
// payments are verified WITHOUT going through verifyPayment():
//   - RemittanceService.postRecord() (Bigship COD remittance auto-verifies)
//   - AccountsService.deletePayment() (a verified payment can be deleted)
// Root-caused 2026-09-24: both used to leave Invoice.paidAmount stale, so the
// invoice PDF / Parties ledger showed COD orders as unpaid even after the
// remittance was posted. No-op when the order has no invoice yet (the
// invoice picks up verified payments itself when it's created at approval).
import { Prisma } from '@prisma/client';

type Db = Pick<Prisma.TransactionClient, 'payment' | 'invoice'>;

function toPaise(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function syncInvoicePaidAmount(db: Db, orderId: string) {
  const invoice = await db.invoice.findUnique({ where: { orderId } });
  if (!invoice) return null;

  const verifiedPayments = await db.payment.findMany({
    where: { orderId, verificationStatus: 'VERIFIED' },
    select: { amount: true },
  });
  const totalPaid = toPaise(verifiedPayments.reduce((sum, p) => sum + Number(p.amount), 0));

  return db.invoice.update({
    where: { id: invoice.id },
    data: {
      paidAmount: totalPaid,
      balanceAmount: toPaise(Number(invoice.totalAmount) - totalPaid),
    },
  });
}
