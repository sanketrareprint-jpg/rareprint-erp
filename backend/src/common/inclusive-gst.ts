// Order rates are entered INCLUDING GST (confirmed by Sanket 2026-09-28):
// 60,000 × ₹0.75 = ₹45,000 is what the customer pays, and at 18% that
// ₹45,000 is split into taxable ₹38,135.59 + GST ₹6,864.41. The rate comes
// from Product.gstRatePct. taxableAmount + taxAmount always equals the
// line total exactly, so invoice totals, balances and payments are unchanged.
//
// Kept as a plain function (no Nest/Prisma imports) so the one-off
// scripts/recalc-unpaid-invoice-gst.js can reuse it from dist/ instead of
// duplicating the formula.
export function splitInclusiveGst(lineTotal: number, gstRatePct: number, gstTreatment: string) {
  const round = (n: number) => Math.round(n * 100) / 100;
  const gross = round(Number(lineTotal) || 0);
  const rate = Number.isFinite(gstRatePct) && gstRatePct > 0 ? gstRatePct : 0;
  const taxAmount = round((gross * rate) / (100 + rate));
  const taxableAmount = round(gross - taxAmount);
  // Same state rule as AccountsService.splitGst: only INTER_STATE is IGST.
  if (gstTreatment === 'INTER_STATE') {
    return { gstRatePct: rate, taxableAmount, taxAmount, cgstAmount: 0, sgstAmount: 0, igstAmount: taxAmount };
  }
  const half = round(taxAmount / 2);
  return { gstRatePct: rate, taxableAmount, taxAmount, cgstAmount: half, sgstAmount: round(taxAmount - half), igstAmount: 0 };
}
