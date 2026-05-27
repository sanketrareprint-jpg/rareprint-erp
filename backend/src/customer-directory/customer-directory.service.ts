import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

function clean(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text ? text : null;
}

function normalizePhone(value: unknown): string | null {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return null;
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function customerCode() {
  return `CUST-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

@Injectable()
export class CustomerDirectoryService {
  constructor(private prisma: PrismaService) {}

  async search(query: { search?: string; city?: string; state?: string; product?: string }) {
    const where: any = {};
    const search = clean(query.search);
    const city = clean(query.city);
    const state = clean(query.state);
    const product = clean(query.product);

    if (search) {
      where.OR = [
        { businessName: { contains: search, mode: 'insensitive' } },
        { contactPerson: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { email: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
        { state: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (city) where.city = { contains: city, mode: 'insensitive' };
    if (state) where.state = { contains: state, mode: 'insensitive' };
    if (product) {
      where.orders = {
        some: {
          items: { some: { product: { name: { contains: product, mode: 'insensitive' } } } },
        },
      };
    }

    const customers = await this.prisma.customer.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }],
      take: 300,
      include: {
        orders: {
          orderBy: { orderDate: 'desc' },
          include: {
            invoice: { select: { invoiceNumber: true, issueDate: true } },
            salesAgent: { select: { fullName: true } },
            items: {
              include: { product: { select: { name: true, sku: true, category: { select: { name: true } } } } },
            },
          },
        },
      },
    });

    const rows = customers.map((customer) => {
      const orders = customer.orders.map((order) => ({
        id: order.id,
        orderNo: order.orderNumber,
        invoiceNumber: order.invoice?.invoiceNumber ?? null,
        orderDate: order.orderDate.toISOString(),
        salesAgentName: order.salesAgent?.fullName ?? null,
        status: order.status,
        total: Number(order.grandTotal),
        products: order.items.map((item) => ({
          name: item.product.name,
          sku: item.product.sku,
          category: item.product.category?.name ?? null,
          quantity: item.quantity,
          amount: Number(item.lineTotal),
        })),
      }));
      const totalRevenue = orders.reduce((sum, order) => sum + order.total, 0);
      const lastOrder = orders[0] ?? null;
      return {
        id: customer.id,
        businessName: customer.businessName,
        contactPerson: customer.contactPerson,
        phone: customer.phone,
        email: customer.email,
        city: customer.city,
        state: customer.state,
        pincode: customer.pincode,
        orderCount: orders.length,
        totalRevenue,
        lastOrderDate: lastOrder?.orderDate ?? null,
        lastSalesAgentName: lastOrder?.salesAgentName ?? null,
        lastProducts: lastOrder?.products.map((p) => p.name).join(', ') ?? null,
        orders,
      };
    });

    return {
      customers: rows,
      summary: {
        customers: rows.length,
        orders: rows.reduce((sum, row) => sum + row.orderCount, 0),
        revenue: rows.reduce((sum, row) => sum + row.totalRevenue, 0),
      },
    };
  }

  async filters() {
    const [cities, states] = await Promise.all([
      this.prisma.customer.findMany({
        where: { city: { not: null } },
        distinct: ['city'],
        select: { city: true },
        orderBy: { city: 'asc' },
      }),
      this.prisma.customer.findMany({
        where: { state: { not: null } },
        distinct: ['state'],
        select: { state: true },
        orderBy: { state: 'asc' },
      }),
    ]);

    return {
      cities: cities.map((row) => row.city).filter(Boolean),
      states: states.map((row) => row.state).filter(Boolean),
    };
  }

  async importCustomers(rows: any[]) {
    if (!Array.isArray(rows)) throw new BadRequestException('Rows must be an array');
    const result = { created: 0, updated: 0, skipped: 0, errors: [] as string[] };

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const businessName = clean(row.businessName ?? row.customerName ?? row.name ?? row.shopName);
      const phone = normalizePhone(row.phone ?? row.mobile ?? row.whatsapp);
      const email = clean(row.email);

      if (!businessName || !phone) {
        result.skipped++;
        result.errors.push(`Row ${index + 2}: businessName and phone are required`);
        continue;
      }

      const data = {
        businessName,
        contactPerson: clean(row.contactPerson ?? row.ownerName ?? row.contactName) ?? businessName,
        phone,
        email,
        city: clean(row.city),
        state: clean(row.state),
        pincode: clean(row.pincode ?? row.pinCode),
        gstNumber: clean(row.gstNumber ?? row.gstin),
        billingAddress: clean(row.billingAddress ?? row.address),
        shippingAddress: clean(row.shippingAddress ?? row.address),
      };

      const existing = await this.prisma.customer.findFirst({
        where: {
          OR: [
            { phone },
            ...(email ? [{ email }] : []),
          ],
        },
      });

      if (existing) {
        await this.prisma.customer.update({ where: { id: existing.id }, data });
        result.updated++;
      } else {
        await this.prisma.customer.create({
          data: { ...data, customerCode: customerCode() },
        });
        result.created++;
      }
    }

    return result;
  }
}
