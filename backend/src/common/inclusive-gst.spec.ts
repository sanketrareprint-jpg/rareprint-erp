import { splitInclusiveGst } from './inclusive-gst';

// Order rates include GST — the line total never changes, GST is carved out.
describe('splitInclusiveGst', () => {
  it('invoice 1717: 60,000 × ₹0.75 at 18%, inter-state (UP) → IGST', () => {
    const s = splitInclusiveGst(45000, 18, 'INTER_STATE');
    expect(s).toEqual({ gstRatePct: 18, taxableAmount: 38135.59, taxAmount: 6864.41, cgstAmount: 0, sgstAmount: 0, igstAmount: 6864.41 });
  });

  it('intra-state splits into CGST + SGST that add back exactly', () => {
    const s = splitInclusiveGst(1001, 5, 'INTRA_STATE');
    expect(s.taxAmount).toBe(47.67);
    expect(s.taxableAmount).toBe(953.33);
    expect(s.cgstAmount + s.sgstAmount).toBeCloseTo(s.taxAmount, 2);
    expect(s.igstAmount).toBe(0);
  });

  it('taxable + GST always equals the line total', () => {
    for (const [total, rate] of [[45000, 28], [0.01, 18], [12345.67, 12], [999.99, 5]]) {
      const s = splitInclusiveGst(total, rate, 'INTRA_STATE');
      expect(Math.round((s.taxableAmount + s.taxAmount) * 100) / 100).toBe(total);
    }
  });

  it('0% or missing rate leaves the line untouched', () => {
    expect(splitInclusiveGst(45000, 0, 'INTRA_STATE')).toMatchObject({ taxableAmount: 45000, taxAmount: 0, gstRatePct: 0 });
    expect(splitInclusiveGst(45000, NaN, 'INTRA_STATE')).toMatchObject({ taxableAmount: 45000, taxAmount: 0 });
  });
});
