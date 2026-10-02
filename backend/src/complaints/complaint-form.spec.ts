import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ComplaintsService } from './complaints.service';
import { complaintFormToken } from '../common/complaint-link';

describe('ComplaintsService public complaint form', () => {
  const env = { ...process.env };
  beforeAll(() => { process.env.JWT_SECRET = 'test-secret'; });
  afterAll(() => { process.env = env; });

  const order = {
    id: 'o1', orderNumber: '1542', customerId: 'c1', isTest: false,
    customer: { businessName: 'MOHIT MEDICAL' },
    items: [{ product: { name: 'Visiting Card' } }, { product: { name: 'Visiting Card' } }],
  };

  function setup(openCount = 0) {
    const prisma: any = {
      order: { findUnique: jest.fn().mockResolvedValue(order) },
      complaint: { count: jest.fn().mockResolvedValue(openCount), findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new ComplaintsService(prisma, {} as any);
    const create = jest.spyOn(service, 'create').mockResolvedValue({ ticketNumber: 'CMP-2026-00001' } as any);
    return { service, prisma, create };
  }
  const token = () => complaintFormToken('1542');
  const valid = { type: 'COMPLAINT', category: 'PRODUCT_QUALITY', description: 'Colours are faded' };

  it('opens the form for the order in the token', async () => {
    const { service, prisma } = setup();
    const form = await service.getComplaintForm(token());
    expect(prisma.order.findUnique.mock.calls[0][0].where).toEqual({ orderNumber: '1542' });
    expect(form).toMatchObject({ orderNumber: '1542', customerName: 'MOHIT MEDICAL', products: ['Visiting Card'] });
  });

  it('rejects a bad token without touching the database', async () => {
    const { service, prisma } = setup();
    await expect(service.getComplaintForm('1542.0000000000000000')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.order.findUnique).not.toHaveBeenCalled();
  });

  it('registers a WEB_PORTAL ticket linked to the customer and order', async () => {
    const { service, create } = setup();
    await expect(service.submitComplaintForm(token(), valid)).resolves.toEqual({ ticketNumber: 'CMP-2026-00001' });
    expect(create).toHaveBeenCalledWith({
      customerId: 'c1', orderId: 'o1', channel: 'WEB_PORTAL', category: 'PRODUCT_QUALITY',
      subject: 'Complaint from customer (web form): Print / product quality',
      description: 'Colours are faded',
    });
  });

  it('labels queries and test orders in the subject', async () => {
    const { service, prisma, create } = setup();
    prisma.order.findUnique.mockResolvedValue({ ...order, isTest: true });
    await service.submitComplaintForm(token(), { ...valid, type: 'QUERY', category: 'OTHER' });
    expect(create.mock.calls[0][0].subject).toBe('[TEST] Query from customer (web form): Something else');
  });

  it.each([
    [{ ...valid, type: 'X' }],
    [{ ...valid, category: 'VENDOR_ISSUE' }],
    [{ ...valid, description: ' hi ' }],
    [{ ...valid, description: 'x'.repeat(2001) }],
  ])('rejects invalid answers without creating a ticket (%#)', async (body) => {
    const { service, create } = setup();
    await expect(service.submitComplaintForm(token(), body)).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('stops at 3 open form tickets per order', async () => {
    const { service, create } = setup(3);
    await expect(service.submitComplaintForm(token(), valid)).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });
});
