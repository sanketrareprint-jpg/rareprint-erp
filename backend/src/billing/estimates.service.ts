// backend/src/billing/estimates.service.ts
//
// Billing > Estimates: create / edit / list / PDF, and "Convert to Order".
// Conversion itself happens in the normal Create Order page (pre-filled from
// the estimate, so the order goes through every usual check); once that order
// is created the page calls markConverted() to link the two. See the Estimate
// model in schema.prisma for why estimates keep their own party/product
// snapshot and why totals are plain quantity x rate (orders are saved at 0% GST).
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from './billing.service';
import { buildEstimatePdf } from './estimate-pdf';
import { InvoicePdfCompanyProfile } from './invoice-pdf';
import { sanitizePhone } from '../orders/orders.service';
import { GSTIN_FORMAT } from '../orders/dto/create-order.dto';

export interface EstimateInput {
  estimateDate?: string;
  validUntil?: string | null;
  notes?: string | null;
  customer: {
    customerId?: string | null;
    name: string;
    phone?: string | null;
    gstNumber?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    pincode?: string | null;
  };
  items: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
    sizeInches?: string | null;
    gsm?: number | null;
    paperType?: string | null;
    sides?: string | null;
    notes?: string | null;
  }>;
}

const toPaise = (n: number) => Math.round(n * 100) / 100;
const clean = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

@Injectable()
export class EstimatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {}

  // Same atomic SystemConfig counter pattern as the Rate Calculator's
  // quotation numbers (rate-calculator.service.ts nextQuotationNumber): one
  // INSERT ... ON CONFLICT ... RETURNING, so two people saving at once can
  // never get the same number.
  private async nextEstimateNumber(): Promise<string> {
    const rows: any = await (this.prisma as any).$queryRawUnsafe(
      `INSERT INTO "SystemConfig" (key, value, "updatedAt") VALUES ('billing.estimate_counter', '1', NOW())
       ON CONFLICT (key) DO UPDATE SET value = (CAST("SystemConfig".value AS INTEGER) + 1)::text, "updatedAt" = NOW()
       RETURNING value`,
    );
    return `EST-${Number(rows?.[0]?.value ?? 1)}`;
  }

  // Validates and normalises input the same way order create does (uppercase
  // party fields, digits-only phone, GSTIN format), and snapshots each
  // product's name/SKU so the estimate reads the same even if the catalog
  // changes later.
  private async buildData(dto: EstimateInput) {
    const name = clean(dto?.customer?.name);
    if (!name) throw new BadRequestException('Party name is required');

    let phone: string | null = null;
    if (clean(dto.customer.phone)) {
      phone = sanitizePhone(dto.customer.phone!);
      if (!phone || phone.length !== 10) throw new BadRequestException('Phone must be a 10-digit mobile number');
    }
    const gstin = clean(dto.customer.gstNumber)?.toUpperCase() ?? null;
    if (gstin && !GSTIN_FORMAT.test(gstin)) {
      throw new BadRequestException('GST Number must be a valid 15-character GSTIN (e.g. 27AAAAA0000A1Z5)');
    }
    const pincode = clean(dto.customer.pincode);
    if (pincode && !/^\d{6}$/.test(pincode)) throw new BadRequestException('Pincode must be 6 digits');

    const estimateDate = dto.estimateDate ? new Date(dto.estimateDate) : new Date();
    if (Number.isNaN(estimateDate.getTime())) throw new BadRequestException('Invalid estimate date');
    const validUntil = dto.validUntil ? new Date(dto.validUntil) : null;
    if (validUntil && Number.isNaN(validUntil.getTime())) throw new BadRequestException('Invalid "valid until" date');

    if (!Array.isArray(dto.items) || dto.items.length === 0) throw new BadRequestException('Add at least one item');
    const productIds = [...new Set(dto.items.map((i) => i.productId))];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, sku: true, sizeInches: true, gsm: true, paperType: true, sides: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    const items = dto.items.map((item, index) => {
      const product = byId.get(item.productId);
      if (!product) throw new BadRequestException(`Item ${index + 1}: select a product`);
      const quantity = Number(item.quantity);
      if (!Number.isInteger(quantity) || quantity < 1) throw new BadRequestException(`Item ${index + 1}: quantity must be a whole number of at least 1`);
      const unitPrice = Number(item.unitPrice);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new BadRequestException(`Item ${index + 1}: rate must be 0 or more`);
      const gsm = item.gsm != null && item.gsm !== ('' as any) ? Number(item.gsm) : product.gsm;
      return {
        sortOrder: index,
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        sizeInches: clean(item.sizeInches) ?? product.sizeInches ?? null,
        gsm: Number.isFinite(gsm as number) ? (gsm as number) : null,
        paperType: clean(item.paperType) ?? product.paperType ?? null,
        sides: clean(item.sides) ?? (product.sides as string | null) ?? null,
        notes: clean(item.notes),
        quantity,
        unitPrice: new Prisma.Decimal(unitPrice),
        lineTotal: new Prisma.Decimal(toPaise(quantity * unitPrice)),
      };
    });
    const totalAmount = toPaise(items.reduce((sum, i) => sum + Number(i.lineTotal), 0));

    return {
      header: {
        estimateDate,
        validUntil,
        notes: clean(dto.notes),
        customerId: clean(dto.customer.customerId),
        customerName: name.toUpperCase(),
        customerPhone: phone,
        customerGstin: gstin,
        customerAddress: clean(dto.customer.address)?.toUpperCase() ?? null,
        customerCity: clean(dto.customer.city)?.toUpperCase() ?? null,
        customerState: clean(dto.customer.state)?.toUpperCase() ?? null,
        customerPincode: pincode,
        totalAmount: new Prisma.Decimal(totalAmount),
      },
      items,
    };
  }

  private serialize(e: any) {
    return {
      ...e,
      totalAmount: Number(e.totalAmount),
      items: e.items?.map((i: any) => ({ ...i, unitPrice: Number(i.unitPrice), lineTotal: Number(i.lineTotal) })),
    };
  }

  async list(filters: { search?: string }) {
    const where: Prisma.EstimateWhereInput = {};
    const search = filters.search?.trim();
    if (search) {
      where.OR = [
        { estimateNumber: { contains: search, mode: 'insensitive' } },
        { customerName: { contains: search, mode: 'insensitive' } },
        { customerPhone: { contains: search } },
      ];
    }
    const rows = await this.prisma.estimate.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        id: true, estimateNumber: true, estimateDate: true, validUntil: true, customerName: true, customerPhone: true,
        totalAmount: true, status: true, convertedOrderId: true, convertedOrderNumber: true, _count: { select: { items: true } },
      },
    });
    return rows.map((r) => ({ ...r, totalAmount: Number(r.totalAmount), itemCount: r._count.items, _count: undefined }));
  }

  async get(id: string) {
    const estimate = await this.prisma.estimate.findUnique({
      where: { id },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!estimate) throw new NotFoundException('Estimate not found');
    return this.serialize(estimate);
  }

  async create(dto: EstimateInput, userId: string) {
    const { header, items } = await this.buildData(dto);
    const estimateNumber = await this.nextEstimateNumber();
    const created = await this.prisma.estimate.create({
      data: { ...header, estimateNumber, createdById: userId ?? null, items: { create: items } },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
    return this.serialize(created);
  }

  // Only while OPEN — once converted, the order is the record of what was agreed.
  async update(id: string, dto: EstimateInput) {
    const existing = await this.prisma.estimate.findUnique({ where: { id }, select: { status: true, convertedOrderNumber: true } });
    if (!existing) throw new NotFoundException('Estimate not found');
    if (existing.status !== 'OPEN') {
      throw new BadRequestException(`This estimate was already converted to order ${existing.convertedOrderNumber ?? ''} and can no longer be edited`);
    }
    const { header, items } = await this.buildData(dto);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.estimateItem.deleteMany({ where: { estimateId: id } });
      return tx.estimate.update({
        where: { id },
        data: { ...header, items: { create: items } },
        include: { items: { orderBy: { sortOrder: 'asc' } } },
      });
    });
    return this.serialize(updated);
  }

  // Called by the Create Order page right after it creates an order from this
  // estimate. The conditional updateMany (status still OPEN) makes a double
  // click or a second tab unable to link the same estimate twice.
  async markConverted(id: string, orderId: string) {
    if (!orderId) throw new BadRequestException('orderId is required');
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { id: true, orderNumber: true } });
    if (!order) throw new NotFoundException('Order not found');
    const result = await this.prisma.estimate.updateMany({
      where: { id, status: 'OPEN' },
      data: { status: 'CONVERTED', convertedOrderId: order.id, convertedOrderNumber: order.orderNumber, convertedAt: new Date() },
    });
    if (result.count === 0) {
      const existing = await this.prisma.estimate.findUnique({ where: { id }, select: { convertedOrderNumber: true } });
      if (!existing) throw new NotFoundException('Estimate not found');
      throw new BadRequestException(`Estimate was already converted to order ${existing.convertedOrderNumber ?? ''}`);
    }
    return this.get(id);
  }

  async generatePdf(id: string): Promise<{ buffer: Buffer; filename: string }> {
    const e = await this.get(id);
    const company = await this.billing.getCompanyProfile();
    const fmt = (d: Date | string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const buffer = await buildEstimatePdf({
      estimateNumber: e.estimateNumber,
      estimateDate: fmt(e.estimateDate),
      validUntil: e.validUntil ? fmt(e.validUntil) : null,
      customerName: e.customerName,
      customerAddress: [e.customerAddress, e.customerCity, e.customerState, e.customerPincode].filter(Boolean).join(', '),
      customerPhone: e.customerPhone ?? '',
      customerGstin: e.customerGstin ?? '',
      notes: e.notes ?? '',
      items: e.items.map((i: any) => ({
        productName: i.productName,
        details: [
          i.sizeInches ? `Size: ${i.sizeInches}` : null,
          i.gsm ? `GSM: ${i.gsm}` : null,
          i.paperType ? `Paper: ${i.paperType}` : null,
          i.sides ? `Sides: ${String(i.sides).replace(/_/g, ' ')}` : null,
          i.notes || null,
        ].filter(Boolean).join(', '),
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        lineTotal: i.lineTotal,
      })),
      totalAmount: e.totalAmount,
      company: company as InvoicePdfCompanyProfile,
    });
    return { buffer, filename: `Estimate_${e.estimateNumber}.pdf` };
  }
}
