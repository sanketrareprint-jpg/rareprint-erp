// Bills the courier charge taken from the customer on their invoice
// (requested 2026-09-26, resumed 2026-09-28: "add the courier charges in the
// invoice of customer so the amount extra taken from customer will settle").
// The charge is the sum of the order's COURIER shipments'
// courierChargeCollected — filled from Book Shipment and editable in
// Dispatch > Courier Charges.
//
// Invoice.courierCharge is INCLUDED in Invoice.totalAmount but kept as its own
// field, so a later change can be applied as a difference, and so
// Order.grandTotal (commission, loyalty, sales totals) never includes courier
// money. Like the order lines, the charge INCLUDES GST — at a flat
// COURIER_GST_RATE_PCT (Sanket, 2026-09-28) — which is carved out into the
// invoice's taxable/tax/CGST/SGST/IGST (see courierGstSplit).
//
// The balance is moved by the same difference (not recomputed as
// total - paid) so credit/debit-note and loyalty-redemption adjustments
// already applied to balanceAmount are kept. Each change posts a balanced
// ledger set: Customer Receivable (DEBIT_NOTE/CREDIT_NOTE) against Courier
// Charges (taxable part) and Output GST (GST part).
//
// Call it wherever courierChargeCollected changes and after an invoice is
// created. No-op when the order has no invoice yet (creation picks it up) or
// when nothing changed.
import { LedgerEntryType, Prisma } from '@prisma/client';
import { splitInclusiveGst } from './inclusive-gst';

export const COURIER_GST_RATE_PCT = 18;
// SAC for courier services — gives the courier line its own row in the
// invoice's tax summary and the GST Summary instead of being lumped with
// products that have no HSN (which showed a blended rate, e.g. 3.1%).
export const COURIER_SAC = '996812';

type Db = Pick<Prisma.TransactionClient, 'invoice' | 'shipment' | 'accountingLedgerEntry'>;

const toPaise = (n: number) => Math.round(n * 100) / 100;

// Taxable + GST parts of a courier charge (which includes GST).
export function courierGstSplit(courierCharge: number, gstTreatment: string) {
  return splitInclusiveGst(courierCharge, COURIER_GST_RATE_PCT, gstTreatment);
}

export async function courierChargeForOrder(db: Pick<Prisma.TransactionClient, 'shipment'>, orderId: string): Promise<number> {
  const shipments = await db.shipment.findMany({
    where: { orderId, dispatchType: 'COURIER' },
    select: { courierChargeCollected: true },
  });
  return toPaise(shipments.reduce((sum, s) => sum + Number(s.courierChargeCollected ?? 0), 0));
}

export async function syncInvoiceCourierCharge(db: Db, orderId: string) {
  const invoice = await db.invoice.findUnique({
    where: { orderId },
    select: {
      id: true, invoiceNumber: true, courierCharge: true, gstTreatment: true,
      totalAmount: true, balanceAmount: true, taxableAmount: true, taxAmount: true,
      cgstAmount: true, sgstAmount: true, igstAmount: true,
      order: { select: { customerId: true } },
    },
  });
  if (!invoice) return null;

  const courier = await courierChargeForOrder(db, orderId);
  const previous = toPaise(Number(invoice.courierCharge ?? 0));
  const diff = toPaise(courier - previous);
  if (diff === 0) return invoice;

  const before = courierGstSplit(previous, invoice.gstTreatment);
  const after = courierGstSplit(courier, invoice.gstTreatment);
  const delta = (k: 'taxableAmount' | 'taxAmount' | 'cgstAmount' | 'sgstAmount' | 'igstAmount') => toPaise(after[k] - before[k]);

  const updated = await db.invoice.update({
    where: { id: invoice.id },
    data: {
      courierCharge: courier,
      totalAmount: toPaise(Number(invoice.totalAmount) + diff),
      balanceAmount: toPaise(Number(invoice.balanceAmount) + diff),
      taxableAmount: toPaise(Number(invoice.taxableAmount) + delta('taxableAmount')),
      taxAmount: toPaise(Number(invoice.taxAmount) + delta('taxAmount')),
      cgstAmount: toPaise(Number(invoice.cgstAmount) + delta('cgstAmount')),
      sgstAmount: toPaise(Number(invoice.sgstAmount) + delta('sgstAmount')),
      igstAmount: toPaise(Number(invoice.igstAmount) + delta('igstAmount')),
    },
  });

  const narration = `Courier charges on invoice ${invoice.invoiceNumber} set to ₹${courier} incl. ${COURIER_GST_RATE_PCT}% GST (was ₹${previous})`;
  const common = { referenceType: 'INVOICE', referenceId: invoice.id, customerId: invoice.order.customerId, orderId, invoiceId: invoice.id, narration };
  // Positive amount → goes on the side that increases with the charge.
  const line = (entryType: LedgerEntryType, accountName: string, amount: number, increaseIsDebit: boolean) => {
    const debit = increaseIsDebit === amount > 0;
    return { ...common, entryType, accountName, debitAmount: debit ? Math.abs(amount) : 0, creditAmount: debit ? 0 : Math.abs(amount) };
  };
  await db.accountingLedgerEntry.createMany({
    data: [
      line(diff > 0 ? LedgerEntryType.DEBIT_NOTE : LedgerEntryType.CREDIT_NOTE, 'Customer Receivable', diff, true),
      line(LedgerEntryType.ADJUSTMENT, 'Courier Charges', delta('taxableAmount'), false),
      ...(delta('taxAmount') !== 0 ? [line(LedgerEntryType.GST, 'Output GST', delta('taxAmount'), false)] : []),
    ],
  });

  return updated;
}
