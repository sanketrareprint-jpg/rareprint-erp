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

const STATE_NAMES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Delhi', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra',
  'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim',
  'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
];

function inferLocation(...parts: Array<string | null | undefined>) {
  const text = parts.filter(Boolean).join(', ');
  const tokens = text.split(',').map((part) => part.trim()).filter(Boolean);
  const pincode = text.match(/\b\d{6}\b/)?.[0] ?? null;
  const state = STATE_NAMES.find((name) => new RegExp(`\\b${name}\\b`, 'i').test(text)) ?? null;
  const stateIndex = state ? tokens.findIndex((token) => token.toLowerCase() === state.toLowerCase()) : -1;
  const pinIndex = pincode ? tokens.findIndex((token) => token.includes(pincode)) : -1;
  let city: string | null = null;

  if (stateIndex > 0) city = tokens[stateIndex - 1];
  else if (pinIndex > 0) city = tokens[pinIndex - 1].replace(/\b\d{6}\b/g, '').trim();
  else if (tokens.length >= 2) city = tokens[tokens.length - 2];
  else if (tokens.length === 1 && !pincode && !state) city = tokens[0];

  if (city && STATE_NAMES.some((name) => name.toLowerCase() === city!.toLowerCase())) city = null;
  return { city: clean(city), state: clean(state), pincode };
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
        address: customer.shippingAddress ?? customer.billingAddress,
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

  async syncLocationsFromAddresses() {
    const customers = await this.prisma.customer.findMany({
      where: {
        OR: [
          { city: null },
          { state: null },
          { pincode: null },
        ],
      },
      select: {
        id: true,
        city: true,
        state: true,
        pincode: true,
        shippingAddress: true,
        billingAddress: true,
      },
    });

    let updated = 0;
    for (const customer of customers) {
      const inferred = inferLocation(customer.shippingAddress, customer.billingAddress);
      const data: any = {};
      if (!customer.city && inferred.city) data.city = inferred.city;
      if (!customer.state && inferred.state) data.state = inferred.state;
      if (!customer.pincode && inferred.pincode) data.pincode = inferred.pincode;
      if (Object.keys(data).length) {
        await this.prisma.customer.update({ where: { id: customer.id }, data });
        updated++;
      }
    }

    return { scanned: customers.length, updated };
  }
}
