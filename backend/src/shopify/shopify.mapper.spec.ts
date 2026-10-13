// Shopify → ERP mapping rules (agreed 2026-10-12). If these fail after a
// change, Shopify orders will land in the ERP with wrong money, phone or
// payment data.
import { createHmac } from 'crypto';
import {
  classifyGateway, mapShopifyCheckout, mapShopifyOrder, normalizeShopifyPhone, paymentToRecord, verifyShopifyHmac,
} from './shopify.mapper';
import { splitInclusiveGst } from '../common/inclusive-gst';

const order = (over: any = {}) => ({
  id: 5550001,
  name: '#1001',
  created_at: '2026-10-12T10:00:00+05:30',
  updated_at: '2026-10-12T10:00:05+05:30',
  email: 'buyer@example.com',
  phone: '+91 98765-43210',
  financial_status: 'paid',
  payment_gateway_names: ['Razorpay Secure (UPI, Cards, Wallets, NetBanking)'],
  taxes_included: true,
  total_price: '1229.00',
  checkout_token: 'tok-abc',
  note_attributes: [{ name: 'GSTIN', value: '27aaacr1234f1z5' }],
  tax_lines: [{ title: 'CGST', rate: 0.09, price: '178.98' }],
  shipping_address: { name: 'Asha Patil', address1: '12 MG Road', city: 'Pune', province: 'Maharashtra', zip: '411001', phone: '09876543210' },
  billing_address: { name: 'Asha Patil', company: 'Patil Prints', city: 'Pune', province: 'Maharashtra', zip: '411001' },
  line_items: [
    {
      id: 1, title: 'Dr. File', variant_title: 'Art Card 300 GSM / 1000 pcs', sku: 'DRFILE-300', quantity: 2, price: '600.00',
      grams: 500, discount_allocations: [{ amount: '100.00' }],
      properties: [{ name: 'Custom text', value: 'Dr. Asha' }, { name: 'Artwork', value: 'https://cdn.example.com/a.pdf' }, { name: '_hidden', value: '' }],
    },
  ],
  shipping_lines: [{ price: '129.00', discount_allocations: [] }],
  ...over,
});

describe('Shopify mapper', () => {
  it('maps lines: discount on the line, total = price × qty − discount; properties kept', () => {
    const m = mapShopifyOrder(order());
    expect(m.orderNumber).toBe('SH-1001');
    expect(m.lines).toHaveLength(1);
    expect(m.lines[0]).toMatchObject({ quantity: 2, unitPrice: 600, lineDiscount: 100, lineTotal: 1100 });
    expect(m.lines[0].artworkNotes).toBe('Custom text: Dr. Asha | Artwork: https://cdn.example.com/a.pdf');
    expect(m.lines[0].productionNotes).toBe('Dr. File — Art Card 300 GSM / 1000 pcs | SKU DRFILE-300');
  });

  it('shipping is separate from item total and totals reconcile with Shopify', () => {
    const m = mapShopifyOrder(order());
    expect(m.itemsTotal).toBe(1100);
    expect(m.shippingCharge).toBe(129);
    expect(m.totalsMismatch).toBe(0);
    expect(m.notes).not.toContain('⚠');
  });

  it('GST is carved out by the ERP rate + state, not Shopify tax lines', () => {
    // 1100 incl. 18%, Maharashtra → CGST+SGST
    expect(splitInclusiveGst(1100, 18, 'INTRA_STATE')).toEqual({
      gstRatePct: 18, taxableAmount: 932.2, taxAmount: 167.8, cgstAmount: 83.9, sgstAmount: 83.9, igstAmount: 0,
    });
    // Shopify's (wrong) CGST-only lines are kept for reference only
    expect(mapShopifyOrder(order()).shopifyData.taxLines).toEqual([{ title: 'CGST', rate: 0.09, price: '178.98' }]);
  });

  it('customer: phone normalised to 10 digits, GSTIN from note attributes, company kept', () => {
    const { customer } = mapShopifyOrder(order());
    expect(customer.phone).toBe('9876543210');
    expect(customer.gstin).toBe('27AAACR1234F1Z5');
    expect(customer.company).toBe('Patil Prints');
    expect(customer.state).toBe('Maharashtra');
    expect(customer.pincode).toBe('411001');
  });

  it.each([
    ['+91 98765 43210', '9876543210'],
    ['098765-43210', '9876543210'],
    ['919876543210', '9876543210'],
    ['12345', null],
    [null, null],
  ])('normalizeShopifyPhone(%p) = %p', (input, out) => {
    expect(normalizeShopifyPhone(input)).toBe(out);
  });

  it('gateways and which payments get recorded', () => {
    expect(classifyGateway(['Razorpay Secure'])).toBe('RAZORPAY');
    expect(classifyGateway(['Cash on Delivery (COD)'])).toBe('COD');
    expect(classifyGateway(['manual'])).toBe('MANUAL');
    expect(paymentToRecord('RAZORPAY', 'paid', 1229, null)).toBe(1229);
    expect(paymentToRecord('COD', 'paid', 1229, null)).toBeNull();
    expect(paymentToRecord('MANUAL', 'pending', 1229, null)).toBeNull();
    expect(paymentToRecord('MANUAL', 'paid', 1229, '0.00')).toBe(1229);
    expect(paymentToRecord('RAZORPAY', 'partially_paid', 1229, '614.50')).toBe(614.5);
    expect(paymentToRecord('RAZORPAY', 'pending', 1229, null)).toBeNull();
  });

  it('removed line items (current_quantity 0) are dropped and discount scales', () => {
    const m = mapShopifyOrder(order({
      line_items: [
        { ...order().line_items[0], current_quantity: 1 },
        { id: 2, title: 'Pen', quantity: 5, current_quantity: 0, price: '20.00' },
      ],
    }));
    expect(m.lines).toHaveLength(1);
    expect(m.lines[0]).toMatchObject({ quantity: 1, lineDiscount: 50, lineTotal: 550 });
  });

  it('a status-only update keeps the same content hash; an item edit changes it', () => {
    const a = mapShopifyOrder(order());
    const b = mapShopifyOrder(order({ financial_status: 'refunded', updated_at: '2026-10-13T00:00:00Z' }));
    const c = mapShopifyOrder(order({ line_items: [{ ...order().line_items[0], quantity: 3 }] }));
    expect(b.contentHash).toBe(a.contentHash);
    expect(c.contentHash).not.toBe(a.contentHash);
  });

  it('flags a total that does not reconcile', () => {
    expect(mapShopifyOrder(order({ total_price: '1500.00' })).notes).toContain('⚠ Shopify total');
  });

  it('checkout mapping keeps phone, value and recovery URL', () => {
    const c = mapShopifyCheckout({
      token: 't1', id: 99, email: '', phone: null, total_price: '450.00', updated_at: '2026-10-12T10:00:00Z',
      abandoned_checkout_url: 'https://rareprint.in/r/1',
      shipping_address: { first_name: 'Ravi', last_name: 'K', phone: '+91-91234 56789' },
      line_items: [{ title: 'Keychain', quantity: 3, price: '150.00', properties: [] }],
    });
    expect(c).toMatchObject({ token: 't1', phone: '9123456789', email: null, customerName: 'Ravi K', cartValue: 450, recoveryUrl: 'https://rareprint.in/r/1' });
  });

  it('HMAC verification accepts the real signature only', () => {
    const body = Buffer.from(JSON.stringify(order()));
    const sig = createHmac('sha256', 's3cret').update(body).digest('base64');
    expect(verifyShopifyHmac(body, sig, 's3cret')).toBe(true);
    expect(verifyShopifyHmac(body, sig, 'other')).toBe(false);
    expect(verifyShopifyHmac(Buffer.from(body.toString() + ' '), sig, 's3cret')).toBe(false);
    expect(verifyShopifyHmac(body, undefined, 's3cret')).toBe(false);
  });
});
