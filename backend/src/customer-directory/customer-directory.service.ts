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

const STATE_ALIASES = new Map<string, string>([
  ['tamilnadu', 'Tamil Nadu'],
  ['tamil nadu', 'Tamil Nadu'],
  ['up', 'Uttar Pradesh'],
  ['u p', 'Uttar Pradesh'],
  ...STATE_NAMES.map((name) => [name.toLowerCase(), name] as [string, string]),
]);

const KNOWN_CITY_NAMES = [
  'Ahmedabad', 'Aheri', 'Aligarh', 'Balampur', 'Bangalore', 'Bareilly', 'Bhagalpur', 'Bikaner',
  'Chandrapur', 'Delhi', 'Dindori', 'Gazipur', 'Gulbarga', 'Hathras', 'Karnal', 'Kheri',
  'Latur', 'Mathon More', 'Nashik', 'Pune', 'Samastipur', 'Sangli', 'Shimla', 'Sriperumbudur',
  'Surat', 'Varanasi', 'West Champaran',
];

function canonicalState(value: string | null | undefined) {
  const text = clean(value);
  if (!text) return null;
  const lowered = text.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ');
  return STATE_ALIASES.get(lowered) ?? STATE_NAMES.find((name) => new RegExp(`\\b${name}\\b`, 'i').test(text)) ?? null;
}

function isLikelyCity(value: string | null | undefined) {
  const text = clean(value);
  if (!text) return false;
  if (text.length > 45) return false;
  if (/[,@]|\d{3,}/.test(text)) return false;
  if (canonicalState(text)) return false;
  if (/\b(road|rd|near|opp|opposite|behind|front|post|dist|district|village|block|school|hospital|medical|clinic|address|colony|apartment|complex|bazar|stand|bank|mandi)\b/i.test(text)) {
    return false;
  }
  return text.split(/\s+/).length <= 4;
}

function knownCityFromText(text: string) {
  const ordered = [...KNOWN_CITY_NAMES].sort((a, b) => b.length - a.length);
  return ordered.find((city) => new RegExp(`\\b${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) ?? null;
}

function inferLocation(...parts: Array<string | null | undefined>) {
  const text = parts.filter(Boolean).join(', ');
  const tokens = text.split(',').map((part) => part.trim()).filter(Boolean);
  const pincode = text.match(/\b\d{6}\b/)?.[0] ?? null;
  const state = canonicalState(text);
  const stateIndex = state ? tokens.findIndex((token) => canonicalState(token) === state) : -1;
  const pinIndex = pincode ? tokens.findIndex((token) => token.includes(pincode)) : -1;
  let city: string | null = null;

  if (stateIndex > 0 && isLikelyCity(tokens[stateIndex - 1])) {
    city = tokens[stateIndex - 1];
  } else if (pinIndex > 0 && isLikelyCity(tokens[pinIndex - 1])) {
    city = tokens[pinIndex - 1].replace(/\b\d{6}\b/g, '').trim();
  } else {
    city = knownCityFromText(text);
  }

  if (!isLikelyCity(city)) city = null;
  return { city: clean(city), state: clean(state), pincode };
}

function uniqueSorted(values: Array<string | null>) {
  return Array.from(new Set(values.map(clean).filter((value): value is string => !!value))).sort((a, b) => a.localeCompare(b));
}

@Injectable()
export class CustomerDirectoryService {
  constructor(private prisma: PrismaService) {}

  private mapOrder(order: any) {
    return {
      id: order.id,
      orderNo: order.orderNumber,
      invoiceNumber: order.invoice?.invoiceNumber ?? null,
      orderDate: order.orderDate.toISOString(),
      salesAgentName: order.salesAgent?.fullName ?? null,
      status: order.status,
      total: Number(order.grandTotal),
      products: order.items.map((item: any) => ({
        name: item.product.name,
        sku: item.product.sku,
        category: item.product.category?.name ?? null,
        quantity: item.quantity,
        amount: Number(item.lineTotal),
      })),
    };
  }

  async search(query: { search?: string; city?: string; state?: string; product?: string; page?: string | number; limit?: string | number }) {
    const where: any = {};
    const search = clean(query.search);
    const city = clean(query.city);
    const state = clean(query.state);
    const product = clean(query.product);
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(20, Number(query.limit) || 50));

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
      skip: (page - 1) * limit,
      take: limit + 1,
      include: {
        _count: { select: { orders: true } },
        orders: {
          orderBy: { orderDate: 'desc' },
          take: 1,
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
    const pageCustomers = customers.slice(0, limit);

    const revenueRows = pageCustomers.length
      ? await this.prisma.order.groupBy({
          by: ['customerId'],
          where: { customerId: { in: pageCustomers.map((customer) => customer.id) } },
          _sum: { grandTotal: true },
        })
      : [];
    const revenueByCustomer = new Map(revenueRows.map((row) => [row.customerId, Number(row._sum.grandTotal ?? 0)]));

    const rows = pageCustomers.map((customer) => {
      const orders = customer.orders.map((order) => this.mapOrder(order));
      const totalRevenue = revenueByCustomer.get(customer.id) ?? orders.reduce((sum, order) => sum + order.total, 0);
      const lastOrder = orders[0] ?? null;
      return {
        id: customer.id,
        businessName: customer.businessName,
        contactPerson: customer.contactPerson,
        phone: customer.phone,
        phone2: customer.phone2,
        email: customer.email,
        address: customer.shippingAddress ?? customer.billingAddress,
        city: customer.city,
        state: customer.state,
        pincode: customer.pincode,
        orderCount: customer._count.orders,
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
      page,
      limit,
      hasMore: customers.length > limit,
    };
  }

  async orders(customerId: string) {
    if (!customerId) throw new BadRequestException('customerId is required');
    const orders = await this.prisma.order.findMany({
      where: { customerId },
      orderBy: { orderDate: 'desc' },
      take: 50,
      include: {
        invoice: { select: { invoiceNumber: true, issueDate: true } },
        salesAgent: { select: { fullName: true } },
        items: {
          include: { product: { select: { name: true, sku: true, category: { select: { name: true } } } } },
        },
      },
    });
    return { orders: orders.map((order) => this.mapOrder(order)) };
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
      cities: uniqueSorted(cities.map((row) => isLikelyCity(row.city) ? clean(row.city) : null)),
      states: uniqueSorted(states.map((row) => canonicalState(row.state))),
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
      const inferred = inferLocation(customer.city, customer.state, customer.shippingAddress, customer.billingAddress);
      const data: any = {};
      const cityIsValid = isLikelyCity(customer.city);
      const state = canonicalState(customer.state) ?? inferred.state;
      if (!cityIsValid && inferred.city) data.city = inferred.city;
      if (!cityIsValid && !inferred.city && customer.city) data.city = null;
      if (state && state !== customer.state) data.state = state;
      if (!customer.pincode && inferred.pincode) data.pincode = inferred.pincode;
      if (Object.keys(data).length) {
        await this.prisma.customer.update({ where: { id: customer.id }, data });
        updated++;
      }
    }

    return { scanned: customers.length, updated };
  }
}
