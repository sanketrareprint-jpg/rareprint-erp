// Abandoned carts showed "—" / "no phone" even when Shopify had the contact:
// the webhook row was saved before the customer typed details, and the
// backup poller only copied the recovery link onto it. These tests protect
// the fill-in and the "don't wipe saved contact" rules.
jest.mock('@prisma/client', () => {
  class Decimal { constructor(public v: any) {} }
  const anyEnum = new Proxy({}, { get: (_t, k) => k });
  return {
    Prisma: { Decimal },
    ActivityType: anyEnum, LeadStatus: anyEnum, OrderProductionStage: anyEnum, OrderStatus: anyEnum,
    PaymentMethod: anyEnum, PaymentStatus: anyEnum, PaymentVerificationStatus: anyEnum,
    PrintingType: anyEnum, ProductSides: anyEnum, TaskStatus: anyEnum,
  };
}, { virtual: true });
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../crm/crm.service', () => ({ CrmService: class {} }));

import { ShopifyService } from './shopify.service';

function makePrisma(existing: any) {
  return {
    shopifyCheckout: {
      findFirst: jest.fn().mockResolvedValue(existing),
      findUnique: jest.fn().mockResolvedValue(existing),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...existing, ...data, status: 'OPEN' })),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'new', ...data, status: 'OPEN' })),
    },
    shopifyInboxOrder: { findFirst: jest.fn().mockResolvedValue(null) },
  };
}

const gqlNode = {
  id: 'gid://shopify/AbandonedCheckout/66870103900220',
  abandonedCheckoutUrl: 'https://rareprint.in/recover?key=x',
  updatedAt: '2026-10-13T13:04:33Z',
  totalPriceSet: { shopMoney: { amount: '5074.0', currencyCode: 'INR' } },
  customer: { firstName: 'Mojahid', lastName: 'Alam', defaultEmailAddress: { emailAddress: 'm@example.com' }, defaultPhoneNumber: null },
  shippingAddress: { name: 'Mojahid Alam', phone: '8210622532' },
  billingAddress: { name: 'Mojahid Alam', phone: '8210622532' },
  lineItems: { nodes: [] },
};

describe('Shopify abandoned checkout contact details', () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.SHOPIFY_WEBHOOK_SECRET = 's';
    process.env.SHOPIFY_STORE_DOMAIN = 'shop.myshopify.com';
    process.env.SHOPIFY_ADMIN_TOKEN = 't';
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve({ data: { abandonedCheckouts: { nodes: [gqlNode] } } }),
    });
  });
  afterAll(() => { process.env = env; });

  it('poller fills name/phone/email on a webhook row that had none', async () => {
    const prisma = makePrisma({ id: 'r1', recoveryUrl: null, customerName: null, phone: null, email: null });
    await new ShopifyService(prisma as any, {} as any).pollAbandonedCheckouts();
    expect(prisma.shopifyCheckout.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { recoveryUrl: 'https://rareprint.in/recover?key=x', customerName: 'Mojahid Alam', phone: '8210622532', email: 'm@example.com' },
    });
    expect(prisma.shopifyCheckout.create).not.toHaveBeenCalled();
  });

  it('poller never overwrites contact already saved', async () => {
    const prisma = makePrisma({ id: 'r1', recoveryUrl: 'old', customerName: 'Typed Name', phone: '9999999999', email: 'a@b.c' });
    await new ShopifyService(prisma as any, {} as any).pollAbandonedCheckouts();
    expect(prisma.shopifyCheckout.update).not.toHaveBeenCalled();
  });

  it('a later webhook with blank contact keeps the saved name/phone/email', async () => {
    const prisma = makePrisma({ id: 'r1', token: 'tok', customerName: 'Mojahid Alam', phone: '8210622532', email: 'm@example.com' });
    await new ShopifyService(prisma as any, {} as any).syncCheckout({ token: 'tok', id: 1, total_price: '10', line_items: [] });
    const data = prisma.shopifyCheckout.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ customerName: 'Mojahid Alam', phone: '8210622532', email: 'm@example.com' });
  });

  it('a later webhook with new contact replaces the saved one', async () => {
    const prisma = makePrisma({ id: 'r1', token: 'tok', customerName: null, phone: '8210622532', email: null });
    await new ShopifyService(prisma as any, {} as any).syncCheckout({
      token: 'tok', id: 1, total_price: '10', line_items: [], shipping_address: { name: 'New Name', phone: '+91 70490 96161' },
    });
    expect(prisma.shopifyCheckout.update.mock.calls[0][0].data).toMatchObject({ customerName: 'New Name', phone: '7049096161' });
  });
});
