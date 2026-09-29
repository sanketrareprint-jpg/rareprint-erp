import { AccountingNoteStatus, Prisma, PurchaseBillStatus } from '@prisma/client';

// What we owe vendors = non-cancelled purchase bills' unpaid balance
//   − "on account" payments: no bill picked (the bill is optional on the
//     payment form) or made against a bill later cancelled — these never
//     reach any bill's paidAmount
//   − ISSUED vendor credit/debit notes (createAccountingNote debits Vendor
//     Payable for both types).
// Shared by Accounts' Payable card (AccountsService.getAccountingSummary)
// and Billing > Sundry Creditors (BillingService.listCreditors) so the two
// always agree. Read-only: no bill/payment record is changed.
export const LIVE_PURCHASE_BILL_WHERE = {
  status: { not: PurchaseBillStatus.CANCELLED },
} satisfies Prisma.PurchaseBillWhereInput;

export const ON_ACCOUNT_VENDOR_PAYMENT_WHERE = {
  OR: [{ purchaseBillId: null }, { purchaseBill: { status: PurchaseBillStatus.CANCELLED } }],
} satisfies Prisma.VendorPaymentWhereInput;

export const PAYABLE_VENDOR_NOTE_WHERE = {
  status: AccountingNoteStatus.ISSUED,
} satisfies Prisma.AccountingNoteWhereInput;
