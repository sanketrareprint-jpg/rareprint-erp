// Pure Shopify → ERP mapping (no Nest/Prisma imports) so the money and
// matching rules can be unit-tested with real payloads — see
// shopify.mapper.spec.ts. ShopifyService does the database work.
//
// Money rules (agreed with Sanket 2026-10-12):
//  - Shopify prices INCLUDE GST, same as ERP order rates, so a Shopify line's
//    discounted total is the ERP lineTotal as is. GST is NOT taken from
//    Shopify's tax lines (the store is misconfigured — CGST only); the invoice
//    carves GST out of each line using the matched product's own gstRatePct
//    (the generic "Shopify Item" product is 18%), and picks CGST+SGST vs IGST
//    from the customer's state (see AccountsService.gstTreatmentForState).
//    Shopify's tax lines are kept in Order.shopifyData for reference only.
//  - Shopify discounts are already allocated per line (discount_allocations),
//    so they go on OrderItem.lineDiscount and Order.discount stays 0.
//  - Shipping charged to the customer goes to Order.courierChargeQuoted — the
//    existing "courier charge taken from customer" field — never into
//    grandTotal (the ERP keeps courier money out of grandTotal; see
//    common/sync-invoice-courier-charge.ts).
import { createHmac, timingSafeEqual } from 'crypto';

export const SHOPIFY_ORDER_NUMBER_PREFIX = 'SH-';
export const SHOPIFY_GENERIC_PRODUCT_SKU = 'SHOPIFY-ITEM';
export const SHOPIFY_GENERIC_GST_RATE_PCT = 18;
export const SHOPIFY_LEAD_TAG = 'shopify-abandoned';

export type ShopifyGateway = 'RAZORPAY' | 'COD' | 'MANUAL' | 'OTHER';

export interface MappedLine {
  title: string;
  variantTitle: string | null;
  sku: string | null;
  quantity: number;
  unitPrice: number;
  lineDiscount: number;
  lineTotal: number;
  grams: number | null;
  properties: { name: string; value: string }[];
  productionNotes: string;
  artworkNotes: string | null;
}

export interface MappedCustomer {
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  shippingAddress: string | null;
  billingAddress: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
}

export interface MappedOrder {
  shopifyOrderId: string;
  orderNumber: string;
  shopifyName: string;
  orderDate: Date;
  updatedAt: string | null;
  isTest: boolean;
  customer: MappedCustomer;
  lines: MappedLine[];
  itemsTotal: number;
  shippingCharge: number;
  totalPrice: number;
  totalsMismatch: number;
  gateway: ShopifyGateway;
  financialStatus: string | null;
  cancelledAt: string | null;
  checkoutToken: string | null;
  // Hash of what decides items/amounts — used to tell a real Shopify edit
  // from a status-only update.
  contentHash: string;
  notes: string;
  shopifyData: Record<string, any>;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: any): string | null => {
  const s = v == null ? '' : String(v).trim();
  return s ? s : null;
};

// Shopify signs the raw body with HMAC-SHA256 and sends it base64-encoded.
export function verifyShopifyHmac(rawBody: Buffer | undefined, header: string | undefined, secret: string): boolean {
  if (!rawBody || !header || !secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  let given: Buffer;
  try {
    given = Buffer.from(header, 'base64');
  } catch {
    return false;
  }
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Strip +91 / leading 0 / spaces / dashes etc. by keeping digits only, then
// compare on the last 10 digits (an Indian mobile number). Fewer than 10
// digits isn't a usable phone.
export function normalizeShopifyPhone(value: any): string | null {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : null;
}

export function classifyGateway(gatewayNames: any): ShopifyGateway {
  const names: string[] = (Array.isArray(gatewayNames) ? gatewayNames : [gatewayNames])
    .map((g) => String(g ?? '').toLowerCase());
  if (names.some((g) => g.includes('razorpay'))) return 'RAZORPAY';
  if (names.some((g) => g.includes('cash on delivery') || /\bcod\b/.test(g))) return 'COD';
  if (names.some((g) => g.includes('manual'))) return 'MANUAL';
  return 'OTHER';
}

// Amount to record as a (pending-verification) Payment, or null for none.
// COD is never recorded here — that money arrives via courier remittance.
// "manual" and other gateways count only once Shopify says fully paid.
export function paymentToRecord(gateway: ShopifyGateway, financialStatus: string | null, totalPrice: number, totalOutstanding: any): number | null {
  if (gateway === 'COD') return null;
  if (financialStatus === 'paid') return totalPrice > 0 ? totalPrice : null;
  if (gateway === 'RAZORPAY' && financialStatus === 'partially_paid' && totalOutstanding != null) {
    const paid = round2(totalPrice - num(totalOutstanding));
    return paid > 0 ? paid : null;
  }
  return null;
}

const GSTIN_RE = /\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]\b/;

function findGstin(order: any): string | null {
  for (const attr of order?.note_attributes ?? []) {
    if (/gst/i.test(String(attr?.name ?? ''))) {
      const match = String(attr?.value ?? '').toUpperCase().match(GSTIN_RE);
      if (match) return match[0];
    }
  }
  for (const company of [order?.billing_address?.company, order?.shipping_address?.company]) {
    const match = String(company ?? '').toUpperCase().match(GSTIN_RE);
    if (match) return match[0];
  }
  return null;
}

function addressText(a: any): string | null {
  if (!a) return null;
  return [a.address1, a.address2, a.city, a.province, a.zip].map(str).filter(Boolean).join(', ') || null;
}

function personName(...candidates: any[]): string | null {
  for (const c of candidates) {
    if (!c) continue;
    const name = str(c.name) ?? str([c.first_name, c.last_name].filter(Boolean).join(' '));
    if (name) return name;
  }
  return null;
}

function formatProperties(properties: any): { name: string; value: string }[] {
  if (!Array.isArray(properties)) return [];
  return properties
    .map((p: any) => ({ name: String(p?.name ?? '').trim(), value: String(p?.value ?? '').trim() }))
    .filter((p) => p.name && p.value);
}

export function mapLineItems(lineItems: any[]): MappedLine[] {
  const lines: MappedLine[] = [];
  for (const li of lineItems ?? []) {
    const originalQty = Math.trunc(num(li?.quantity));
    // current_quantity drops when an item is removed by an order edit.
    const quantity = li?.current_quantity != null ? Math.trunc(num(li.current_quantity)) : originalQty;
    if (quantity <= 0) continue;
    const unitPrice = round2(num(li?.price));
    const allocated = (li?.discount_allocations ?? []).reduce((s: number, d: any) => s + num(d?.amount), 0);
    // An allocation covers the original quantity; scale it if some was removed.
    const lineDiscount = round2(originalQty > 0 ? (allocated * quantity) / originalQty : allocated);
    const title = str(li?.title) ?? str(li?.name) ?? 'Shopify item';
    const variantTitle = str(li?.variant_title);
    const sku = str(li?.sku);
    const properties = formatProperties(li?.properties);
    lines.push({
      title,
      variantTitle,
      sku,
      quantity,
      unitPrice,
      lineDiscount,
      lineTotal: round2(unitPrice * quantity - lineDiscount),
      grams: li?.grams != null ? num(li.grams) : null,
      properties,
      productionNotes: [variantTitle ? `${title} — ${variantTitle}` : title, sku ? `SKU ${sku}` : null].filter(Boolean).join(' | '),
      artworkNotes: properties.length ? properties.map((p) => `${p.name}: ${p.value}`).join(' | ') : null,
    });
  }
  return lines;
}

export function mapShippingCharge(order: any): number {
  return round2((order?.shipping_lines ?? []).reduce((sum: number, s: any) => {
    if (s?.discounted_price != null) return sum + num(s.discounted_price);
    const discount = (s?.discount_allocations ?? []).reduce((d: number, a: any) => d + num(a?.amount), 0);
    return sum + num(s?.price) - discount;
  }, 0));
}

export function mapShopifyOrder(order: any): MappedOrder {
  const id = str(order?.id);
  if (!id) throw new Error('Shopify order has no id');
  const shopifyName = str(order?.name) ?? `#${str(order?.order_number) ?? id}`;
  const orderNumber = `${SHOPIFY_ORDER_NUMBER_PREFIX}${shopifyName.replace(/^#/, '').trim()}`;

  const ship = order?.shipping_address ?? null;
  const bill = order?.billing_address ?? null;
  const addr = ship ?? bill ?? {};
  const name = personName(order?.customer, ship, bill) ?? str(order?.email) ?? `Shopify customer ${shopifyName}`;
  const customer: MappedCustomer = {
    name,
    company: str(bill?.company) ?? str(ship?.company),
    phone: normalizeShopifyPhone(order?.phone)
      ?? normalizeShopifyPhone(order?.customer?.phone)
      ?? normalizeShopifyPhone(ship?.phone)
      ?? normalizeShopifyPhone(bill?.phone),
    email: str(order?.email) ?? str(order?.contact_email) ?? str(order?.customer?.email),
    gstin: findGstin(order),
    shippingAddress: addressText(ship),
    billingAddress: addressText(bill),
    city: str(addr.city),
    state: str(addr.province),
    pincode: str(addr.zip),
  };
  // A GSTIN-only company field isn't a business name.
  if (customer.company && GSTIN_RE.test(customer.company.toUpperCase())) customer.company = null;

  const lines = mapLineItems(order?.line_items ?? []);
  const itemsTotal = round2(lines.reduce((s, l) => s + l.lineTotal, 0));
  const shippingCharge = mapShippingCharge(order);
  const totalPrice = round2(num(order?.current_total_price ?? order?.total_price));
  const totalsMismatch = round2(totalPrice - (itemsTotal + shippingCharge));
  const gatewayNames: string[] = Array.isArray(order?.payment_gateway_names)
    ? order.payment_gateway_names
    : (order?.gateway ? [order.gateway] : []);
  const gateway = classifyGateway(gatewayNames);
  const financialStatus = str(order?.financial_status);
  const discountCodes = (order?.discount_codes ?? []).map((d: any) => ({ code: str(d?.code), amount: num(d?.amount), type: str(d?.type) }));
  const noteAttributes = (order?.note_attributes ?? []).map((a: any) => ({ name: str(a?.name), value: str(a?.value) }));
  const tags = str(order?.tags);
  const fulfillments = (order?.fulfillments ?? []).map((f: any) => ({
    id: str(f?.id),
    status: str(f?.status),
    trackingCompany: str(f?.tracking_company),
    trackingNumbers: (f?.tracking_numbers ?? (f?.tracking_number ? [f.tracking_number] : [])).map(String),
    trackingUrls: (f?.tracking_urls ?? (f?.tracking_url ? [f.tracking_url] : [])).map(String),
    createdAt: str(f?.created_at),
  }));

  const gatewayLabel = gatewayNames.join(', ') || 'unknown';
  const notes = [
    `Shopify order ${shopifyName}${str(order?.source_name) ? ` (${order.source_name})` : ''}`,
    `Payment: ${gatewayLabel} — ${financialStatus ?? 'unknown'}`,
    shippingCharge > 0 ? `Shipping charged on Shopify: ₹${shippingCharge.toFixed(2)} (pre-filled as courier charge)` : null,
    discountCodes.length ? `Discount codes: ${discountCodes.map((d: any) => `${d.code} (₹${d.amount})`).join(', ')}` : null,
    str(order?.note) ? `Customer note: ${order.note}` : null,
    noteAttributes.length ? `Attributes: ${noteAttributes.map((a: any) => `${a.name}=${a.value}`).join('; ')}` : null,
    tags ? `Tags: ${tags}` : null,
    order?.taxes_included === false ? '⚠ Shopify says prices EXCLUDE tax — check totals' : null,
    Math.abs(totalsMismatch) > 0.01 ? `⚠ Shopify total ₹${totalPrice.toFixed(2)} ≠ items + shipping ₹${(itemsTotal + shippingCharge).toFixed(2)} — check` : null,
  ].filter(Boolean).join(' | ');

  const contentHash = createHmac('sha256', 'shopify-content')
    .update(JSON.stringify({
      lines: lines.map((l) => [l.title, l.variantTitle, l.sku, l.quantity, l.lineTotal, l.properties]),
      shippingCharge,
    }))
    .digest('hex');

  return {
    shopifyOrderId: id,
    orderNumber,
    shopifyName,
    orderDate: order?.created_at ? new Date(order.created_at) : new Date(),
    updatedAt: str(order?.updated_at),
    isTest: order?.test === true,
    customer,
    lines,
    itemsTotal,
    shippingCharge,
    totalPrice,
    totalsMismatch,
    gateway,
    financialStatus,
    cancelledAt: str(order?.cancelled_at),
    checkoutToken: str(order?.checkout_token),
    contentHash,
    notes,
    shopifyData: {
      id,
      name: shopifyName,
      createdAt: str(order?.created_at),
      updatedAt: str(order?.updated_at),
      financialStatus,
      fulfillmentStatus: str(order?.fulfillment_status),
      cancelledAt: str(order?.cancelled_at),
      cancelReason: str(order?.cancel_reason),
      gateway,
      gatewayNames,
      currency: str(order?.currency),
      taxesIncluded: order?.taxes_included ?? null,
      subtotalPrice: num(order?.current_subtotal_price ?? order?.subtotal_price),
      totalDiscounts: num(order?.current_total_discounts ?? order?.total_discounts),
      totalTax: num(order?.current_total_tax ?? order?.total_tax),
      totalPrice,
      totalOutstanding: order?.total_outstanding ?? null,
      shippingCharge,
      discountCodes,
      // Raw, for reference only — NOT used for GST (see header comment).
      taxLines: order?.tax_lines ?? [],
      lineTaxLines: (order?.line_items ?? []).map((li: any) => ({ id: str(li?.id), taxLines: li?.tax_lines ?? [] })),
      note: str(order?.note),
      noteAttributes,
      tags,
      sourceName: str(order?.source_name),
      checkoutToken: str(order?.checkout_token),
      gstin: customer.gstin,
      company: customer.company,
      shippingAddress: ship,
      billingAddress: bill,
      fulfillments,
      lineItems: lines.map((l) => ({
        title: l.title, variantTitle: l.variantTitle, sku: l.sku, quantity: l.quantity,
        unitPrice: l.unitPrice, lineDiscount: l.lineDiscount, lineTotal: l.lineTotal,
        grams: l.grams, properties: l.properties,
      })),
      contentHash,
    },
  };
}

export interface MappedCheckout {
  token: string;
  shopifyCheckoutId: string | null;
  customerName: string | null;
  phone: string | null;
  email: string | null;
  cartItems: { title: string; variantTitle: string | null; sku: string | null; quantity: number; price: number; properties: { name: string; value: string }[] }[];
  cartValue: number;
  currency: string | null;
  recoveryUrl: string | null;
  completedAt: Date | null;
  lastActivityAt: Date;
}

// Webhook (REST-shaped) checkout payload.
export function mapShopifyCheckout(c: any): MappedCheckout {
  const token = str(c?.token);
  if (!token) throw new Error('Shopify checkout has no token');
  const ship = c?.shipping_address ?? null;
  const bill = c?.billing_address ?? null;
  return {
    token,
    shopifyCheckoutId: str(c?.id),
    customerName: personName(c?.customer, ship, bill),
    phone: normalizeShopifyPhone(c?.phone)
      ?? normalizeShopifyPhone(c?.customer?.phone)
      ?? normalizeShopifyPhone(ship?.phone)
      ?? normalizeShopifyPhone(bill?.phone),
    email: str(c?.email) ?? str(c?.customer?.email),
    cartItems: (c?.line_items ?? []).map((li: any) => ({
      title: str(li?.title) ?? 'Item',
      variantTitle: str(li?.variant_title),
      sku: str(li?.sku),
      quantity: Math.trunc(num(li?.quantity)),
      price: round2(num(li?.price)),
      properties: formatProperties(li?.properties),
    })),
    cartValue: round2(num(c?.total_price)),
    currency: str(c?.currency) ?? str(c?.presentment_currency),
    recoveryUrl: str(c?.abandoned_checkout_url),
    completedAt: c?.completed_at ? new Date(c.completed_at) : null,
    lastActivityAt: new Date(c?.updated_at ?? c?.created_at ?? Date.now()),
  };
}

// Admin GraphQL abandonedCheckouts node (backup poller). It has no token, so
// the row is keyed by the numeric checkout id instead.
export function mapGraphqlCheckout(n: any): MappedCheckout {
  const gid = String(n?.id ?? '');
  const numericId = gid.split('/').pop() || gid;
  const ship = n?.shippingAddress ?? null;
  const bill = n?.billingAddress ?? null;
  const customerName = str([n?.customer?.firstName, n?.customer?.lastName].filter(Boolean).join(' '))
    ?? str(ship?.name) ?? str(bill?.name);
  return {
    token: `gql-${numericId}`,
    shopifyCheckoutId: numericId,
    customerName,
    phone: normalizeShopifyPhone(n?.customer?.defaultPhoneNumber?.phoneNumber)
      ?? normalizeShopifyPhone(ship?.phone)
      ?? normalizeShopifyPhone(bill?.phone),
    email: str(n?.customer?.defaultEmailAddress?.emailAddress),
    cartItems: (n?.lineItems?.nodes ?? []).map((li: any) => ({
      title: str(li?.title) ?? 'Item',
      variantTitle: str(li?.variantTitle),
      sku: str(li?.sku),
      quantity: Math.trunc(num(li?.quantity)),
      price: round2(num(li?.originalUnitPriceSet?.shopMoney?.amount)),
      properties: (li?.customAttributes ?? [])
        .map((a: any) => ({ name: String(a?.key ?? '').trim(), value: String(a?.value ?? '').trim() }))
        .filter((a: any) => a.name && a.value),
    })),
    cartValue: round2(num(n?.totalPriceSet?.shopMoney?.amount)),
    currency: str(n?.totalPriceSet?.shopMoney?.currencyCode),
    recoveryUrl: str(n?.abandonedCheckoutUrl),
    completedAt: n?.completedAt ? new Date(n.completedAt) : null,
    lastActivityAt: new Date(n?.updatedAt ?? n?.createdAt ?? Date.now()),
  };
}

export function describeCart(checkout: Pick<MappedCheckout, 'cartItems' | 'cartValue' | 'recoveryUrl'>): string {
  const items = checkout.cartItems
    .map((i) => `${i.quantity} × ${i.title}${i.variantTitle ? ` (${i.variantTitle})` : ''} @ ₹${i.price}`
      + (i.properties.length ? ` [${i.properties.map((p) => `${p.name}: ${p.value}`).join('; ')}]` : ''))
    .join('\n');
  return [
    `Abandoned Shopify cart — ₹${checkout.cartValue.toFixed(2)}`,
    items,
    checkout.recoveryUrl ? `Recovery link: ${checkout.recoveryUrl}` : null,
  ].filter(Boolean).join('\n');
}
