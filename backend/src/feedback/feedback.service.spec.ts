import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { FeedbackService } from './feedback.service';

const admin = { id: 'admin-1', role: 'ADMIN', fullName: 'Admin' };
const agent = { id: 'agent-1', role: 'SALES_AGENT', fullName: 'Priya' };

function deliveredOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    orderNumber: 'RP-1001',
    status: 'DELIVERED',
    isTest: false,
    customer: { businessName: 'Ramesh Traders', phone: '9123456789' },
    salesAgent: { fullName: 'Priya', phone: '9000000001' },
    items: [
      { id: 'item-1', quantity: 1000, product: { name: 'Visiting Card' } },
    ],
    feedback: null,
    ...overrides,
  };
}

const answers = {
  overallRating: 4,
  productRatings: { 'item-1': 5 },
  serviceRating: 4,
  deliveryRating: 3,
  wouldRecommend: 'NO',
  needsMore: false,
  willRateOnGoogle: true,
};

function setup(order: unknown = deliveredOrder()) {
  const prisma = {
    order: {
      findFirst: jest.fn().mockResolvedValue(order),
      findMany: jest.fn().mockResolvedValue([]),
    },
    customerFeedback: {
      create: jest.fn().mockResolvedValue({ id: 'fb-1' }),
      update: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const whatsapp = {
    sendFeedbackThankYou: jest.fn().mockResolvedValue(true),
    sendFeedbackLeadToAgent: jest.fn().mockResolvedValue(true),
  };
  const svc = new FeedbackService(prisma as any, whatsapp as any);
  return { svc, prisma, whatsapp };
}

describe('FeedbackService', () => {
  const originalUrl = process.env.GOOGLE_REVIEW_URL;
  beforeEach(() => {
    process.env.GOOGLE_REVIEW_URL = 'https://g.page/r/rareprint/review';
  });
  afterAll(() => {
    process.env.GOOGLE_REVIEW_URL = originalUrl;
  });

  it('rejects roles other than admin and sales agent', async () => {
    const { svc } = setup();
    await expect(
      svc.listPending({ id: 'u', role: 'ACCOUNTS' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      svc.submit('order-1', answers, { id: 'u', role: 'DISPATCH' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('limits a sales agent to their own orders, admin to none', async () => {
    const { svc, prisma } = setup();
    await svc.listPending(agent);
    expect(prisma.order.findMany.mock.calls[0][0].where).toMatchObject({
      salesAgentId: 'agent-1',
      status: 'DELIVERED',
      isTest: false,
      feedback: { is: null },
    });
    await svc.listPending(admin);
    expect(
      prisma.order.findMany.mock.calls[1][0].where.salesAgentId,
    ).toBeUndefined();
    await svc.submit('order-1', answers, agent);
    expect(prisma.order.findFirst.mock.calls[0][0].where).toEqual({
      id: 'order-1',
      salesAgentId: 'agent-1',
    });
  });

  it('404s an order outside the scope, rejects non-delivered, test and already-answered orders', async () => {
    await expect(
      setup(null).svc.submit('order-1', answers, agent),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      setup(deliveredOrder({ status: 'DISPATCHED' })).svc.submit(
        'order-1',
        answers,
        admin,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      setup(deliveredOrder({ isTest: true })).svc.submit(
        'order-1',
        answers,
        admin,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      setup(deliveredOrder({ feedback: { id: 'x' } })).svc.submit(
        'order-1',
        answers,
        admin,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('maps a concurrent duplicate insert to a conflict', async () => {
    const { svc, prisma } = setup();
    prisma.customerFeedback.create.mockRejectedValue({ code: 'P2002' });
    await expect(svc.submit('order-1', answers, admin)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects invalid answers without saving anything', async () => {
    const { svc, prisma, whatsapp } = setup();
    await expect(
      svc.submit('order-1', { ...answers, productRatings: {} }, admin),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.customerFeedback.create).not.toHaveBeenCalled();
    expect(whatsapp.sendFeedbackThankYou).not.toHaveBeenCalled();
  });

  it('with no referral/requirement: saves, thanks the customer, does NOT message the agent', async () => {
    const { svc, prisma, whatsapp } = setup();
    const res = await svc.submit('order-1', answers, admin);
    expect(prisma.customerFeedback.create.mock.calls[0][0].data).toMatchObject({
      orderId: 'order-1',
      overallRating: 4,
      wouldRecommend: 'NO',
      referralName: null,
      submittedById: 'admin-1',
      submittedByName: 'Admin',
    });
    expect(whatsapp.sendFeedbackThankYou).toHaveBeenCalledWith({
      customerName: 'Ramesh Traders',
      customerPhone: '9123456789',
      orderNo: 'RP-1001',
      overallRating: 4,
      reviewUrl: 'https://g.page/r/rareprint/review',
    });
    expect(whatsapp.sendFeedbackLeadToAgent).not.toHaveBeenCalled();
    expect(res).toEqual({
      id: 'fb-1',
      customerWhatsappSent: true,
      agentMessageNeeded: false,
      agentWhatsappSent: false,
      warnings: [],
    });
    expect(prisma.customerFeedback.update).toHaveBeenCalledWith({
      where: { id: 'fb-1' },
      data: { customerWhatsappSent: true, agentWhatsappSent: false },
    });
  });

  it('with a referral (phone given as +91…): messages the agent with the cleaned number', async () => {
    const { svc, prisma, whatsapp } = setup();
    const res = await svc.submit(
      'order-1',
      {
        ...answers,
        wouldRecommend: 'YES',
        referralName: 'Suresh',
        referralPhone: '+91 98765 43210',
      },
      admin,
    );
    expect(
      prisma.customerFeedback.create.mock.calls[0][0].data.referralPhone,
    ).toBe('9876543210');
    const call = whatsapp.sendFeedbackLeadToAgent.mock.calls[0][0];
    expect(call.agentPhone).toBe('9000000001');
    expect(call.templateParams[5]).toBe('Suresh - 9876543210');
    expect(res.agentWhatsappSent).toBe(true);
  });

  it('with an extra requirement but no agent phone: still saves and returns a warning', async () => {
    const { svc } = setup(
      deliveredOrder({ salesAgent: { fullName: 'Priya', phone: null } }),
    );
    const res = await svc.submit(
      'order-1',
      { ...answers, needsMore: true, requirementNote: '500 stickers' },
      admin,
    );
    expect(res.agentMessageNeeded).toBe(true);
    expect(res.agentWhatsappSent).toBe(false);
    expect(res.warnings).toContain(
      'Sales agent WhatsApp not sent: Priya has no phone number saved.',
    );
  });

  it('without GOOGLE_REVIEW_URL: saves, skips the customer message, warns', async () => {
    delete process.env.GOOGLE_REVIEW_URL;
    const { svc, prisma, whatsapp } = setup();
    const res = await svc.submit('order-1', answers, admin);
    expect(prisma.customerFeedback.create).toHaveBeenCalled();
    expect(whatsapp.sendFeedbackThankYou).not.toHaveBeenCalled();
    expect(res.warnings[0]).toMatch(/GOOGLE_REVIEW_URL/);
    expect(prisma.customerFeedback.update).not.toHaveBeenCalled();
  });
});
