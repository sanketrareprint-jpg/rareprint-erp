import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  OrderStatus,
  OrderProductionStage,
  PaymentMethod,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

// Customer name and address are always stored in caps, regardless of how the
// sales agent typed them in — keeps order records/printouts consistent.
function upper(value: string): string;
function upper(value?: string | null): string | null | undefined;
function upper(value?: string | null): string | null | undefined {
  return typeof value === 'string' ? value.toUpperCase() : value;
}

function buildItemDetails(items: Array<{ product: { name: string; sizeInches?: string | null; gsm?: number | null; sides?: string | null }; productionNotes?: string | null; quantity: number; unitPrice: Prisma.Decimal; lineTotal: Prisma.Decimal; itemProductionStage: string }>) {
  return items.map((i) => {
    // Try to read from productionNotes first
    let size = (i.productionNotes?.match(/Size[\s:]+([^\n,]+)/i) ?? [])[1]?.trim() ?? null;
    let gsm = (i.productionNotes?.match(/GSM[\s:]+([^,\n\s]+)/i) ?? [])[1]?.trim() ?? null;
    let sidesRaw = (i.productionNotes?.match(/Sides[\s:]+([^,\n\s]+)/i) ?? [])[1]?.trim() ?? null;

    // Fall back to product's direct fields if not found in productionNotes
    if (!size && i.product.sizeInches) {
      size = i.product.sizeInches;
    }
    if (!gsm && i.product.gsm) {
      gsm = String(i.product.gsm);
    }
    if (!sidesRaw && i.product.sides) {
      sidesRaw = i.product.sides;
    }

    // Convert sides to label
    const sidesLabel = sidesRaw === 'SINGLE_SIDE' ? 'Single' : sidesRaw === 'DOUBLE_SIDE' ? 'Double' : (sidesRaw ?? null);

    return {
      productName: i.product.name,
      productionNotes: i.productionNotes ?? null,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      lineTotal: i.lineTotal,
      itemProductionStage: i.itemProductionStage,
      size,
      gsm,
      sides: sidesLabel,
    };
  });
}

type DesignFileSummary = {
  filename: string;
  originalName: string;
  uploadedAt?: string;
  size?: number;
};

function summarizeDesignFiles(value: unknown): DesignFileSummary[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((file): file is Record<string, unknown> => !!file && typeof file === 'object')
    .map((file) => ({
      filename: String(file.filename ?? ''),
      originalName: String(file.originalName ?? file.filename ?? ''),
      uploadedAt: typeof file.uploadedAt === 'string' ? file.uploadedAt : undefined,
      size: typeof file.size === 'number' ? file.size : undefined,
    }))
    .filter((file) => file.filename);
}

type OrderListQuery = {
  page?: string | number;
  limit?: string | number;
  status?: string;
  search?: string;
  marginMode?: string;
  marginThreshold?: string | number;
  includeMargin?: boolean;
  // Independent from includeMargin — Commission is visible to sellers +
  // admins (their own sale's commission), Margin stays owner-only (exposes
  // cost/profitability). Both need matchingCostSlab attached, so the two
  // flags share the slab-fetch below, but each gates its own output fields.
  includeCommission?: boolean;
  // Scopes results to one sales agent's own orders. Set by the controller
  // for SALES_AGENT-role callers — see findAllForTable/getOrdersWithReadyItems.
  salesAgentId?: string;
};

function paging(query: OrderListQuery) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
  return { page, limit, skip: (page - 1) * limit };
}

function marginFilter(query: OrderListQuery) {
  const threshold = Number(query.marginThreshold);
  const mode = query.marginMode === 'above' ? 'above' : query.marginMode === 'below' ? 'below' : '';
  return {
    mode,
    threshold,
    active: Boolean(mode) && Number.isFinite(threshold),
  };
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  private async getSlabsByProductId(productIds: string[]) {
    if (productIds.length === 0) return new Map<string, any[]>();
    const slabs = await this.prisma.productCostSlab.findMany({
      where: { productId: { in: Array.from(new Set(productIds)) } },
      orderBy: { minQuantity: 'asc' },
    });
    return slabs.reduce((map, slab) => {
      const rows = map.get(slab.productId) ?? [];
      rows.push(slab);
      map.set(slab.productId, rows);
      return map;
    }, new Map<string, typeof slabs>());
  }

  private calculateOrderMargin(order: { items: any[] }) {
    let saleTotal = 0;
    let costTotal = 0;
    for (const item of order.items) {
      const lineTotal = Number(item.lineTotal);
      const unitPrice = Number(item.unitPrice);
      saleTotal += lineTotal;
      const slab = item.matchingCostSlab;
      if (!slab) return { marginPct: null, costTotal: null, marginTotal: null };
      const rawCost = Number(slab.unitPrice);
      const costPerUnit = rawCost > unitPrice ? rawCost / slab.minQuantity : rawCost;
      costTotal += costPerUnit * item.quantity;
    }
    if (saleTotal <= 0) return { marginPct: null, costTotal: null, marginTotal: null };
    const marginTotal = saleTotal - costTotal;
    return {
      marginPct: Number(((marginTotal / saleTotal) * 100).toFixed(2)),
      costTotal: Number(costTotal.toFixed(2)),
      marginTotal: Number(marginTotal.toFixed(2)),
    };
  }

  private matchingRateSlab(item: any) {
    return (item.product?.rateSlabs ?? [])
      .filter((slab: any) => slab.minQuantity <= item.quantity && (slab.maxQuantity == null || slab.maxQuantity >= item.quantity))
      .sort((a: any, b: any) => b.minQuantity - a.minQuantity)[0] ?? null;
  }

  private isSticker(item: any) {
    const haystack = `${item.product?.name ?? ''} ${item.product?.category?.name ?? ''}`.toLowerCase();
    return haystack.includes('sticker');
  }

  private calculateOrderCommission(order: any) {
    const category = order.salesAgent?.salesAgentCategory ?? 'B';
    let commissionTotal = 0;
    for (const item of order.items) {
      const slab = item.matchingCostSlab;
      const lineTotal = Number(item.lineTotal);
      const unitPrice = Number(item.unitPrice);

      // profit stays null when there's no cost slab for this exact quantity;
      // it's a number (possibly <= 0) whenever a slab was found.
      let profit: number | null = null;
      if (slab) {
        const rawCost = Number(slab.unitPrice);
        const costPerUnit = rawCost > unitPrice ? rawCost / slab.minQuantity : rawCost;
        const costTotal = costPerUnit * item.quantity;
        profit = lineTotal - costTotal;
      }

      const rateSlab = this.matchingRateSlab(item);
      const rateTotal = rateSlab ? Number(rateSlab.rateAmount) : lineTotal;
      const discountPct = rateTotal > 0 ? Math.max(0, ((rateTotal - lineTotal) / rateTotal) * 100) : 0;

      if (profit !== null && profit > 0) {
        if (category === 'D') {
          commissionTotal += Math.max(0, lineTotal - rateTotal);
        } else if (discountPct > 5) {
          commissionTotal += profit / (category === 'C' ? 3.75 : 4);
        } else if (category === 'A') {
          commissionTotal += lineTotal * (this.isSticker(item) ? 0.15 : 0.10);
        } else if (category === 'C') {
          commissionTotal += lineTotal * (this.isSticker(item) ? 0.17 : 0.12);
        } else {
          commissionTotal += lineTotal * 0.10;
        }
        continue;
      }

      // Either no cost slab covers this quantity, or one does but comes back
      // with zero/negative profit (a cost/rate card mismatch). The profit÷N
      // branches above can't safely run either way. A rate-to-rate sale
      // (<=5% off the rate card, or no rate card at all) still earns the
      // normal flat commission — this used to silently zero the whole
      // order's commission (or just this line) even when the agent gave no
      // discount and did nothing wrong. Only stay at $0 for a real >5%
      // discount, since profit can't be safely verified there without
      // reliable cost data. Mirrors the fallback in
      // cost-table.service.ts::getAgentCommissionSheet.
      if (discountPct > 5) {
        continue; // real discount, unverifiable margin — leave at $0
      } else if (category === 'D') {
        commissionTotal += Math.max(0, lineTotal - rateTotal);
      } else if (category === 'A') {
        commissionTotal += lineTotal * (this.isSticker(item) ? 0.15 : 0.10);
      } else if (category === 'C') {
        commissionTotal += lineTotal * (this.isSticker(item) ? 0.17 : 0.12);
      } else {
        commissionTotal += lineTotal * 0.10;
      }
    }
    const saleTotal = Number(order.grandTotal);
    return {
      commissionTotal: Number(commissionTotal.toFixed(2)),
      commissionPctOfSale: saleTotal > 0 ? Number(((commissionTotal / saleTotal) * 100).toFixed(2)) : null,
    };
  }

  private attachCostSlabs<T extends { items: any[] }>(orders: T[], slabsByProductId: Map<string, any[]>) {
    return orders.map((order) => ({
      ...order,
      items: order.items.map((item) => ({
        ...item,
        matchingCostSlab: (slabsByProductId.get(item.productId) ?? [])
          .filter((slab) =>
            slab.minQuantity <= item.quantity &&
            (slab.maxQuantity == null || slab.maxQuantity >= item.quantity),
          )
          .sort((a, b) => b.minQuantity - a.minQuantity)[0] ?? null,
      })),
    }));
  }

  private async getDesignFileCounts(itemIds: string[]): Promise<Record<string, number>> {
    if (itemIds.length === 0) return {};
    const rows = await this.prisma.$queryRawUnsafe<{ id: string; designFileCount: number | bigint }[]>(
      `SELECT id, jsonb_array_length(
        CASE
          WHEN jsonb_typeof("designFiles"::jsonb) = 'array' THEN "designFiles"::jsonb
          ELSE '[]'::jsonb
        END
      ) AS "designFileCount"
      FROM "OrderItem"
      WHERE id IN (${itemIds.map((_, i) => `$${i + 1}`).join(',')})`,
      ...itemIds,
    );
    return Object.fromEntries(rows.map((row) => [row.id, Number(row.designFileCount)]));
  }

  private async generateOrderNumber(): Promise<string> {
    // Use MAX to find the highest numeric order number atomically,
    // avoiding race conditions from concurrent inserts.
    const result = await this.prisma.$queryRaw<{ max: string | null }[]>`
      SELECT MAX(CAST(NULLIF(REGEXP_REPLACE("orderNumber", '[^0-9]', '', 'g'), '') AS INTEGER))::text AS max
      FROM "Order"
      WHERE "isTest" = false
        AND "orderNumber" ~ '^[0-9]+$'
    `;
    const maxNum = parseInt(result[0]?.max ?? '1200', 10);
    const next = (isNaN(maxNum) ? 1200 : maxNum) + 1;
    // Verify uniqueness; fall back to timestamp-based number if taken (should be very rare)
    const exists = await this.prisma.order.findUnique({ where: { orderNumber: String(next) } });
    if (exists) return String(Date.now());
    return String(next);
  }

  private async generateSampleNumber(): Promise<string> {
    // Generate S-001, S-002, ... for sample orders — completely separate from invoice sequence.
    const result = await this.prisma.$queryRaw<{ max: string | null }[]>`
      SELECT MAX(CAST(NULLIF(REGEXP_REPLACE("orderNumber", '[^0-9]', '', 'g'), '') AS INTEGER))::text AS max
      FROM "Order"
      WHERE "isSample" = true
        AND "orderNumber" ~ '^S-[0-9]+$'
    `;
    const maxNum = parseInt(result[0]?.max ?? '0', 10);
    const next = (isNaN(maxNum) ? 0 : maxNum) + 1;
    const candidate = `S-${String(next).padStart(3, '0')}`;
    const exists = await this.prisma.order.findUnique({ where: { orderNumber: candidate } });
    if (exists) return `S-${Date.now()}`;
    return candidate;
  }

  async findAllForTable(query: OrderListQuery = {}) {
    const { page, limit, skip } = paging(query);
    const mf = marginFilter(query);
    const includeMargin = query.includeMargin === true || mf.active;
    const includeCommission = includeMargin || query.includeCommission === true;
    const where: Prisma.OrderWhereInput = {};
    if (query.status && query.status !== 'ALL') where.status = query.status as OrderStatus;
    // SALES_AGENT-role callers only ever see their own orders — set by the
    // controller from the JWT, never trusted from the client. Was previously
    // enforced client-side only (filtering an already-paginated, unscoped
    // page by salesAgentName), which meant an agent's own orders that didn't
    // happen to fall on the current unfiltered page were invisible to them.
    if (query.salesAgentId) where.salesAgentId = query.salesAgentId;
    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { orderNumber: { contains: search, mode: 'insensitive' } },
        { customer: { businessName: { contains: search, mode: 'insensitive' } } },
        { customer: { phone: { contains: search } } },
        { salesAgent: { fullName: { contains: search, mode: 'insensitive' } } },
        { items: { some: { product: { name: { contains: search, mode: 'insensitive' } } } } },
      ];
    }

    const orders = await this.prisma.order.findMany({
      where,
      orderBy: { orderDate: 'desc' },
      select: {
        id: true,
        orderNumber: true,
        customerId: true,
        salesAgentId: true,
        orderDate: true,
        status: true,
        isTest: true,
        isSample: true,
        samplePaymentType: true,
        grandTotal: true,
        customer: true,
        salesAgent: { select: { id: true, fullName: true } },
        items: {
          select: {
            id: true,
            productId: true,
            quantity: true,
            unitPrice: true,
            lineTotal: true,
            productionNotes: true,
            itemProductionStage: true,
            product: {
              select: {
                name: true,
                sizeInches: true,
                gsm: true,
                sides: true,
                category: true,
              }
            }
          }
        },
        payments: true,
      },
    });
    const slabsByProductId = (includeMargin || includeCommission)
      ? await this.getSlabsByProductId(orders.flatMap((o) => o.items.map((i) => i.productId)))
      : new Map<string, any[]>();
    const ordersWithSlabs = (includeMargin || includeCommission) ? this.attachCostSlabs(orders as any[], slabsByProductId) : orders;
    const marginFiltered = mf.active
      ? ordersWithSlabs.filter((o) => {
          const marginPct = this.calculateOrderMargin(o).marginPct;
          if (marginPct == null) return false;
          return mf.mode === 'above' ? marginPct >= mf.threshold : marginPct < mf.threshold;
        })
      : ordersWithSlabs;
    const total = marginFiltered.length;
    const pageOrders = marginFiltered.slice(skip, skip + limit);
    const designFileCounts = await this.getDesignFileCounts(
      pageOrders.flatMap((o) => o.items.map((i) => i.id)),
    );

    const data = pageOrders.map((o) => {
      const total = Number(o.grandTotal);
      const advancePaid = o.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      const balanceDue = total - advancePaid;
      const margin = includeMargin ? this.calculateOrderMargin(o) : null;
      // Was gated behind includeMargin (admin-only) — commission needs its
      // own, less restrictive gate now that it's visible to sellers too.
      const commission = includeCommission ? this.calculateOrderCommission(o) : null;

      return {
        id: o.id,
        orderNo: o.orderNumber,
        customerName: o.customer.businessName,
        customerPhone: o.customer.phone ?? null,
        salesAgentName: o.salesAgent?.fullName ?? null,
        products: o.items.map((i) => `${i.product.name} ×${i.quantity}`).join(', '),
        totalAmount: total,
        advancePaid,
        balanceDue,
        ...(includeMargin && margin ? {
          marginPct: margin.marginPct,
          marginTotal: margin.marginTotal,
          costTotal: margin.costTotal,
        } : {}),
        ...(includeCommission ? {
          commissionTotal: commission?.commissionTotal ?? null,
          commissionPctOfSale: commission?.commissionPctOfSale ?? null,
        } : {}),
        status: o.status,
        isTest: o.isTest,
        isSample: (o as any).isSample ?? false,
        samplePaymentType: (o as any).samplePaymentType ?? null,
        date: o.orderDate.toISOString(),
        itemDetails: buildItemDetails(o.items as any),
        items: o.items.map((i) => ({
          id: i.id,
          productName: i.product.name,
          itemProductionStage: i.itemProductionStage,
          designFiles: Array.from({ length: designFileCounts[i.id] ?? 0 }),
        })),
      };
    });
    return { data, page, limit, total, hasMore: page * limit < total };
  }

  async create(
    dto: {
      customer: { customerId?: string; name: string; phone?: string; phone2?: string; email?: string; address?: string; city?: string; state?: string; pincode?: string };
      items: Array<{ productId: string; quantity: number; unitPrice: number; itemProductionStage?: string; artworkNotes?: string; productionNotes?: string; offerCodeId?: string }>;
      notes?: string;
      leadSource?: string;
      isSample?: boolean;
      advanceAmount?: number;
      paymentAccountId?: string;
      paymentMethod?: string;
      requestedLoyaltyRedemption?: number;
    },
    salesAgentId: string,
  ) {
    if (!dto.items?.length) {
      throw new BadRequestException('At least one line item is required');
    }

    const productIds = [...new Set(dto.items.map((i) => i.productId))];
    let products: any[];
    try {
      products = await this.prisma.product.findMany({
        where: { id: { in: productIds }, isActive: true },
      });
    } catch (err: any) {
      throw new InternalServerErrorException(`Failed to load products: ${err?.message ?? 'DB error'}`);
    }

    if (products.length !== productIds.length) {
      throw new NotFoundException('One or more products were not found');
    }

    // ── Validate offer codes ───────────────────────────────────────────────
    const offerCodeIds = [...new Set(dto.items.map(i => i.offerCodeId).filter(Boolean))] as string[];
    const prismaAny = this.prisma as any;
    let offerCodes: any[] = [];
    if (offerCodeIds.length) {
      try {
        offerCodes = await prismaAny.offerCode.findMany({ where: { id: { in: offerCodeIds }, isActive: true } });
      } catch {
        // If offer code table doesn't exist, skip validation
      }
    }
    const offerCodeMap = new Map<string, any>(offerCodes.map(c => [c.id, c]));

    for (const item of dto.items) {
      if (item.offerCodeId) {
        const code = offerCodeMap.get(item.offerCodeId);
        if (!code) throw new BadRequestException(`Offer code not found or inactive`);
        if (!(code.productIds as string[]).includes(item.productId)) {
          throw new BadRequestException(`Offer code "${code.code}" is not valid for the selected product`);
        }
      }
    }

    // ── Validate product min qty rules ────────────────────────────────────
    let rules: any[] = [];
    try {
      rules = await prismaAny.productRule.findMany({
        where: { productId: { in: productIds }, isActive: true },
      });
    } catch {
      // If productRule table doesn't exist yet, skip min qty check
    }
    const ruleMap = new Map<string, any>(rules.map(r => [r.productId, r]));
    for (const item of dto.items) {
      const rule = ruleMap.get(item.productId);
      if (rule && item.quantity < (rule.minQty as number)) {
        const prod = products.find(p => p.id === item.productId);
        throw new BadRequestException(
          `Minimum order quantity for "${prod?.name ?? item.productId}" is ${rule.minQty}. You entered ${item.quantity}.`,
        );
      }
    }

    const orderNumber = (dto.isSample ?? false)
      ? await this.generateSampleNumber()
      : await this.generateOrderNumber();

    const customerNameUpper = upper(dto.customer.name);
    const customerAddressUpper = upper(dto.customer.address);
    const customerCityUpper = upper(dto.customer.city);
    const customerStateUpper = upper(dto.customer.state);

    const shippingParts = [
      customerAddressUpper,
      customerCityUpper,
      customerStateUpper,
      dto.customer.pincode,
    ].filter(Boolean);
    const shippingAddress = shippingParts.length > 0 ? shippingParts.join(', ') : undefined;

    const customerCode = `CUST-${Date.now()}-${randomSuffix()}`;

    const itemsData = dto.items.map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
      unitPrice: new Prisma.Decimal(i.unitPrice),
      lineDiscount: new Prisma.Decimal(0),
      taxRatePct: new Prisma.Decimal(0),
      taxAmount: new Prisma.Decimal(0),
      lineTotal: new Prisma.Decimal(i.quantity * i.unitPrice),
      itemProductionStage: (i.itemProductionStage as any) ?? 'NOT_PRINTED',
      artworkNotes: i.artworkNotes ?? null,
      productionNotes: i.productionNotes ?? null,
      offerCodeId: i.offerCodeId ?? null,
    })) as any[];

    const subtotal = itemsData.reduce(
      (s, row) => s.plus(row.lineTotal),
      new Prisma.Decimal(0),
    );
    const grandTotal = subtotal;
    const advance = dto.advanceAmount ?? 0;

    let paymentStatus: PaymentStatus = PaymentStatus.PENDING;
    if (advance > 0) {
      const cmp = new Prisma.Decimal(advance).comparedTo(grandTotal);
      paymentStatus = cmp >= 0 ? PaymentStatus.PAID : PaymentStatus.PARTIALLY_PAID;
    }

    let orderId: string;
    try {
    orderId = await this.prisma.$transaction(async (tx) => {
      const existingCustomer = dto.customer.customerId
        ? await tx.customer.findUnique({ where: { id: dto.customer.customerId } })
        : dto.customer.phone
          ? await tx.customer.findFirst({ where: { phone: dto.customer.phone } })
          : null;

      const customer = existingCustomer
        ? await tx.customer.update({
            where: { id: existingCustomer.id },
            data: {
              businessName: customerNameUpper,
              contactPerson: customerNameUpper,
              phone: dto.customer.phone,
              phone2: dto.customer.phone2,
              email: dto.customer.email,
              shippingAddress,
              city: customerCityUpper,
              state: customerStateUpper,
              pincode: dto.customer.pincode,
            },
          })
        : await tx.customer.create({
            data: {
              customerCode,
              businessName: customerNameUpper,
              contactPerson: customerNameUpper,
              phone: dto.customer.phone,
              phone2: dto.customer.phone2,
              email: dto.customer.email,
              shippingAddress,
              city: customerCityUpper,
              state: customerStateUpper,
              pincode: dto.customer.pincode,
            },
          });

      const order = await tx.order.create({
        data: {
          orderNumber,
          orderDate: new Date(),
          customerId: customer.id,
          salesAgentId,
          leadSource: dto.leadSource ?? null,
          // Sample kit orders skip accounts approval and go directly to dispatch
          status: (dto.isSample ?? false) ? OrderStatus.READY_FOR_DISPATCH : OrderStatus.PENDING_APPROVAL,
          paymentStatus,
          subtotal,
          grandTotal,
          discount: new Prisma.Decimal(0),
          taxAmount: new Prisma.Decimal(0),
          shippingCharge: new Prisma.Decimal(0),
          notes: dto.notes,
          isSample: dto.isSample ?? false,
          samplePaymentType: (dto.isSample ?? false) ? (advance > 0 ? 'PREPAID' : 'COD') : null,
          requestedLoyaltyRedemption: dto.requestedLoyaltyRedemption ?? null,
          items: { create: itemsData },
        } as any,
      });

      // For sample orders, mark all items as READY_FOR_DISPATCH immediately
      if (dto.isSample ?? false) {
        await tx.orderItem.updateMany({
          where: { orderId: order.id },
          data: { itemProductionStage: OrderProductionStage.READY_FOR_DISPATCH } as any,
        });
      }

      if (advance > 0 && dto.paymentAccountId) {
        await tx.payment.create({
          data: {
            orderId: order.id,
            paymentAccountId: dto.paymentAccountId,
            receivedById: salesAgentId,
            amount: new Prisma.Decimal(advance),
            method: (dto.paymentMethod as PaymentMethod) ?? PaymentMethod.CASH,
          },
        });
      }

      const toStatus = (dto.isSample ?? false) ? OrderStatus.READY_FOR_DISPATCH : OrderStatus.PENDING_APPROVAL;
      await tx.statusLog.create({
        data: {
          orderId: order.id,
          fromStatus: null,
          toStatus,
          changedById: salesAgentId,
          reason: (dto.isSample ?? false) ? 'Sample kit order — sent directly to dispatch' : 'Order created; pending accounts',
        },
      });

      return order.id;
    });
    } catch (err: any) {
      // Prisma unique constraint violation (e.g. duplicate orderNumber from race condition)
      if (err?.code === 'P2002') {
        throw new InternalServerErrorException(
          'Order number conflict — please try submitting again.',
        );
      }
      throw new InternalServerErrorException(
        `Order creation failed: ${err?.message ?? 'Unknown error'}`,
      );
    }

    // Send order created WhatsApp notification
    const fullOrder = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
        salesAgent: { select: { fullName: true } },
        items: { include: { product: true } },
        payments: true,
      },
    });

    if (fullOrder) {
      const totalAmount = Number(fullOrder.grandTotal);
      const advancePaid = fullOrder.payments.reduce((s, p) => s + Number(p.amount), 0);
      const balanceDue = totalAmount - advancePaid;

      // Format product details: Name Size GSM Sides Qty @Rate = Total
      const productDetails = fullOrder.items.map((i) => {
        const notes = i.productionNotes ?? '';
        const size = (notes.match(/Size[:\s]+([^\n,]+)/i) ?? [])[1]?.trim() ?? '';
        const gsm = (notes.match(/GSM[:\s]+(\S+)/i) ?? [])[1]?.trim() ?? '';
        const sides = (notes.match(/Sides[:\s]+(\S+)/i) ?? [])[1]?.trim() ?? '';
        const sidesLabel = sides === 'SINGLE_SIDE' ? 'Single' : sides === 'DOUBLE_SIDE' ? 'Double' : sides;
        const rate = Number(i.unitPrice).toFixed(0);
        const total = Number(i.lineTotal).toFixed(0);
        return `• ${i.product.name} ${size} ${gsm}gsm ${sidesLabel} x${i.quantity} @₹${rate} = ₹${total}`;
      }).join('\n');

      void this.whatsapp.sendOrderCreated({
        customerName: fullOrder.customer.businessName,
        customerPhone: fullOrder.customer.phone ?? '',
        orderNo: fullOrder.orderNumber,
        productDetails,
        totalAmount: totalAmount.toFixed(0),
        advancePaid: advancePaid.toFixed(0),
        balanceDue: balanceDue.toFixed(0),
        agentName: fullOrder.salesAgent?.fullName ?? 'Rareprint Team',
      });
    }

    return orderId;
  }

  async editOrder(orderId: string, body: any, userId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new Error('Order not found');
    if (order.status !== OrderStatus.PENDING_APPROVAL) {
      throw new Error('Only PENDING_APPROVAL orders can be edited');
    }

    const editCustomerNameUpper = upper(body.customer?.name);
    const editCustomerAddressUpper = upper(body.customer?.address);
    const editCustomerCityUpper = upper(body.customer?.city);
    const editCustomerStateUpper = upper(body.customer?.state);

    const shippingParts = [
      editCustomerAddressUpper,
      editCustomerCityUpper,
      editCustomerStateUpper,
      body.customer?.pincode,
    ].filter(Boolean);
    // Only recompute shippingAddress when at least one address part was actually
    // submitted. Previously this always wrote shippingParts.join(', '), which is
    // '' when every part is missing/empty — silently wiping out the customer's
    // saved address on any edit that didn't resend address fields.
    const shippingAddress = shippingParts.length > 0 ? shippingParts.join(', ') : undefined;

    await this.prisma.$transaction(async (tx) => {
      await tx.customer.update({
        where: { id: order.customerId },
        data: {
          businessName: editCustomerNameUpper,
          contactPerson: editCustomerNameUpper,
          phone: body.customer?.phone,
          email: body.customer?.email,
          shippingAddress,
          city: editCustomerCityUpper,
          state: editCustomerStateUpper,
          pincode: body.customer?.pincode,
        },
      });

      await tx.orderItem.deleteMany({ where: { orderId } });

      const itemsData = body.items.map((i: any) => ({
        productId: i.productId,
        quantity: i.quantity,
        unitPrice: new Prisma.Decimal(i.unitPrice),
        lineDiscount: new Prisma.Decimal(0),
        taxRatePct: new Prisma.Decimal(0),
        taxAmount: new Prisma.Decimal(0),
        lineTotal: new Prisma.Decimal(i.lineTotal ?? i.quantity * i.unitPrice),
        artworkNotes: i.artworkNotes ?? null,
        productionNotes: i.productionNotes ?? null,
      }));

      const subtotal = itemsData.reduce(
        (s: Prisma.Decimal, row: any) => s.plus(row.lineTotal),
        new Prisma.Decimal(0),
      );

      await tx.order.update({
        where: { id: orderId },
        data: {
          notes: body.notes,
          subtotal,
          grandTotal: subtotal,
          items: { create: itemsData },
        },
      });
    });

    return { success: true };
  }

  // isAdmin lets ADMIN-role users force-delete an order in any status, not
  // just PENDING_APPROVAL/test — the frontend gates this behind a
  // type-the-order-number confirmation so it can't happen by a stray click.
  // Everything that references the order cascades at the DB level (OrderItem,
  // Payment, Invoice, Commission, ProductionJob, Shipment, StatusLog,
  // AccountingLedgerEntry, OrderReassuranceLog — see schema.prisma), so a
  // plain order delete cleans those up automatically. A few tables keep the
  // order id as a soft, non-FK reference for history (RewardTransaction,
  // CustomerLoyaltyTransaction, Notification) and are deliberately left
  // pointing at the deleted order — same as how those tables already behave
  // for any other historical reference.
  async deleteOrder(orderId: string, isAdmin: boolean = false) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new Error('Order not found');
    // Test orders can be deleted at any stage; real orders only when
    // PENDING_APPROVAL — unless an admin is force-deleting.
    if (!order.isTest && order.status !== OrderStatus.PENDING_APPROVAL && !isAdmin) {
      throw new Error('Only PENDING_APPROVAL orders can be deleted');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.statusLog.deleteMany({ where: { orderId } });
      await tx.payment.deleteMany({ where: { orderId } });
      await tx.orderItem.deleteMany({ where: { orderId } });
      await tx.order.delete({ where: { id: orderId } });
    });

    return { success: true };
  }

  async createTestOrder(userId: string) {
    // Find first active product to attach to test order
    const product = await this.prisma.product.findFirst({ where: { isActive: true } });
    if (!product) throw new Error('No active products found to create test order');

    const ts = Date.now();
    const testOrderNumber = `TEST-${ts}`;
    const customerCode = `TEST-CUST-${ts}`;

    await this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: {
          customerCode,
          businessName: 'TEST CUSTOMER (DELETE ME)',
          contactPerson: 'Test',
          phone: '0000000000',
        },
      });

      await tx.order.create({
        data: {
          orderNumber: testOrderNumber,
          orderDate: new Date(),
          customerId: customer.id,
          salesAgentId: userId,
          status: OrderStatus.PENDING_APPROVAL,
          paymentStatus: PaymentStatus.PENDING,
          isTest: true,
          subtotal: new Prisma.Decimal(500),
          grandTotal: new Prisma.Decimal(500),
          discount: new Prisma.Decimal(0),
          taxAmount: new Prisma.Decimal(0),
          shippingCharge: new Prisma.Decimal(0),
          notes: 'TEST ORDER — safe to delete',
          items: {
            create: [{
              productId: product.id,
              quantity: 100,
              unitPrice: new Prisma.Decimal(5),
              lineDiscount: new Prisma.Decimal(0),
              taxRatePct: new Prisma.Decimal(0),
              taxAmount: new Prisma.Decimal(0),
              lineTotal: new Prisma.Decimal(500),
              itemProductionStage: 'NOT_PRINTED',
            }],
          },
        },
      });
    });

    return { success: true, orderNumber: testOrderNumber };
  }

  async addPayment(
    orderId: string,
    receivedById: string,
    data: { amount: number; method: string; paymentAccountId: string; referenceNumber?: string; notes?: string; paymentDate?: string },
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    // Guard against the same real-world payment (bank UTR/UPI ref, cheque no,
    // etc.) being recorded against more than one order — e.g. an accountant
    // copy-pasting the wrong reference from the bank statement. Once a
    // reference number is attached to one order, it can't be reused on
    // another. Blank/placeholder references are exempt since cash payments
    // often have none.
    const trimmedRef = data.referenceNumber?.trim();
    if (trimmedRef) {
      const conflict = await this.prisma.payment.findFirst({
        where: {
          referenceNumber: { equals: trimmedRef, mode: 'insensitive' },
          orderId: { not: orderId },
        },
        include: { order: { select: { orderNumber: true, customer: { select: { businessName: true } } } } },
      });
      if (conflict) {
        throw new BadRequestException(
          `Reference "${trimmedRef}" is already linked to order ${conflict.order.orderNumber} (${conflict.order.customer.businessName}). ` +
          `Each payment reference can only be linked to one order — double-check the bank statement before recording this payment.`,
        );
      }
    }

    const payment = await this.prisma.payment.create({
      data: {
        orderId,
        paymentAccountId: data.paymentAccountId,
        receivedById,
        amount: new Prisma.Decimal(data.amount),
        method: data.method as PaymentMethod ?? PaymentMethod.CASH,
        referenceNumber: data.referenceNumber,
        notes: data.notes,
        paymentDate: data.paymentDate ? new Date(data.paymentDate) : new Date(),
      },
      include: { paymentAccount: true },
    });

    const allPayments = await this.prisma.payment.findMany({ where: { orderId } });
    const totalPaid = allPayments.reduce((s, p) => s + Number(p.amount), 0);
    const grandTotal = Number(order.grandTotal);

    let paymentStatus: PaymentStatus;
    if (totalPaid >= grandTotal) paymentStatus = PaymentStatus.PAID;
    else if (totalPaid > 0) paymentStatus = PaymentStatus.PARTIALLY_PAID;
    else paymentStatus = PaymentStatus.PENDING;

    await this.prisma.order.update({ where: { id: orderId }, data: { paymentStatus } });

    await this.prisma.statusLog.create({
      data: {
        orderId,
        fromStatus: order.status,
        toStatus: order.status,
        changedById: receivedById,
        reason: `Payment received: ₹${data.amount} via ${data.method}${data.referenceNumber ? ' (Ref: ' + data.referenceNumber + ')' : ''}`,
        metadata: {
          eventType: 'PAYMENT_RECORDED',
          paymentId: payment.id,
          amount: data.amount,
          method: data.method,
          referenceNumber: data.referenceNumber,
          paymentAccountName: payment.paymentAccount.name,
          totalPaid,
          balanceDue: grandTotal - totalPaid,
          paymentStatus,
        },
      },
    });

    if (order.customer.phone) {
      void this.whatsapp.sendPaymentReceived({
        customerName: order.customer.businessName,
        customerPhone: order.customer.phone,
        orderNo: order.orderNumber,
        amountReceived: Number(payment.amount),
        paymentMode: payment.method,
        referenceNo: payment.referenceNumber ?? '',
        orderTotal: grandTotal,
        totalPaid,
        balanceRemaining: grandTotal - totalPaid,
      });
    }

    return payment;
  }

  async getPayments(orderId: string) {
    return this.prisma.payment.findMany({
      where: { orderId },
      include: { paymentAccount: true },
      orderBy: { paymentDate: 'desc' },
    });
  }

  async getStatusLogs(orderId: string) {
    const [logs, sheetItems] = await Promise.all([
      this.prisma.statusLog.findMany({
        where: { orderId },
        include: { changedBy: { select: { fullName: true, role: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.printSheetItem.findMany({
        where: { orderItem: { orderId } },
        orderBy: { createdAt: 'asc' },
        include: {
          product: { select: { name: true, sku: true } },
          orderItem: {
            select: {
              id: true,
              quantity: true,
              itemProductionStage: true,
              productionNotes: true,
              product: { select: { name: true, sku: true, sizeInches: true, gsm: true } },
            },
          },
          sheet: {
            include: {
              stageVendors: {
                include: { vendor: { select: { name: true } } },
                orderBy: { createdAt: 'asc' },
              },
            },
          },
        },
      }),
    ]);

    const orderLogs = logs.map((l) => ({
      id: l.id,
      type: 'ORDER_STATUS',
      fromStatus: l.fromStatus,
      toStatus: l.toStatus,
      reason: l.reason,
      metadata: l.metadata ?? null,
      changedAt: l.createdAt.toISOString(),
      changedBy: l.changedBy?.fullName ?? 'System',
      role: (l.changedBy as any)?.role ?? '',
    }));

    const loggedSheetItemIds = new Set(
      logs
        .map((log) => (log.metadata as any)?.sheetItemId)
        .filter((id): id is string => typeof id === 'string'),
    );

    const sheetAssignmentLogs = sheetItems.filter((si) => !loggedSheetItemIds.has(si.id)).map((si) => ({
      id: `sheet-assigned-${si.id}`,
      type: 'SHEET_ASSIGNED',
      fromStatus: null,
      toStatus: 'SHEET_ASSIGNED',
      reason: `${si.product.name} assigned to sheet ${si.sheet.sheetNo}`,
      metadata: {
        eventType: 'SHEET_ASSIGNED',
        sheetItemId: si.id,
        orderItemId: si.orderItemId,
        productName: si.product.name,
        productSku: si.product.sku,
        orderItemQuantity: si.orderItem.quantity,
        orderItemStage: si.orderItem.itemProductionStage,
        productionNotes: si.orderItem.productionNotes,
        sheetId: si.sheetId,
        sheetNo: si.sheet.sheetNo,
        sheetStatus: si.sheet.status,
        sheetQuantity: si.sheet.quantity,
        actualPrintedQuantity: si.sheet.actualPrintedQuantity,
        sheetSize: si.sheet.sizeInches,
        sheetGsm: si.sheet.gsm,
        sheetQuality: si.sheet.quality,
        sheetPrinting: si.sheet.printing,
        quantityOnSheet: si.quantityOnSheet,
        multiple: si.multiple,
        stageVendors: si.sheet.stageVendors.map((sv) => ({
          stage: sv.stage,
          vendorName: sv.vendor.name,
          cost: Number(sv.cost),
          invoiceNo: sv.vendorInvoiceNo,
          description: sv.description,
          createdAt: sv.createdAt.toISOString(),
        })),
      },
      changedAt: si.createdAt.toISOString(),
      changedBy: 'Production',
      role: '',
    }));

    const latestSheetById = new Map<string, (typeof sheetItems)[number]>();
    for (const si of sheetItems) latestSheetById.set(si.sheetId, si);
    const sheetSnapshotLogs = [...latestSheetById.values()].map((si) => ({
      id: `sheet-current-${si.sheetId}`,
      type: 'SHEET_CURRENT_STATUS',
      fromStatus: null,
      toStatus: 'SHEET_CURRENT_STATUS',
      reason: `Sheet ${si.sheet.sheetNo} is currently ${si.sheet.status}`,
      metadata: {
        eventType: 'SHEET_CURRENT_STATUS',
        sheetId: si.sheetId,
        sheetNo: si.sheet.sheetNo,
        sheetStatus: si.sheet.status,
        sheetQuantity: si.sheet.quantity,
        actualPrintedQuantity: si.sheet.actualPrintedQuantity,
        sheetSize: si.sheet.sizeInches,
        sheetGsm: si.sheet.gsm,
        sheetQuality: si.sheet.quality,
        sheetPrinting: si.sheet.printing,
        itemCount: sheetItems.filter((item) => item.sheetId === si.sheetId).length,
        stageVendors: si.sheet.stageVendors.map((sv) => ({
          stage: sv.stage,
          vendorName: sv.vendor.name,
          cost: Number(sv.cost),
          invoiceNo: sv.vendorInvoiceNo,
          description: sv.description,
          createdAt: sv.createdAt.toISOString(),
        })),
      },
      changedAt: si.sheet.updatedAt.toISOString(),
      changedBy: 'Production',
      role: '',
    }));

    return [...orderLogs, ...sheetAssignmentLogs, ...sheetSnapshotLogs]
      .sort((a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime());
  }

  async getPaymentAccounts() {
    return this.prisma.paymentAccount.findMany({
      where: { isActive: true },
      select: { id: true, name: true, accountType: true, bankName: true },
    });
  }

  async submitForDispatch(
    orderId: string,
    agentId: string,
    data: { courierCharges: number; isCod: boolean; codAmount?: number; notes?: string; dispatchType?: string; transportName?: string; lrNumber?: string; transportChargesType?: string; transportBy?: string; awbNumber?: string; deliveryBoyName?: string; collectedByName?: string; collectedByPhone?: string },
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { select: { itemProductionStage: true } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== OrderStatus.READY_FOR_DISPATCH) {
      throw new BadRequestException('Order must be ready for dispatch before dispatch approval can be requested');
    }
    if (!order.items.some((i) => i.itemProductionStage === OrderProductionStage.READY_FOR_DISPATCH)) {
      throw new BadRequestException('No ready items found for dispatch');
    }
    const dispatchCharge = data.dispatchType === 'COURIER' ? Number(data.courierCharges || 0) : 0;
    const dispatchTypeLine = data.dispatchType === 'TRANSPORT'
      ? `Transport: ${data.transportName ?? ''}, LR: ${data.lrNumber ?? ''}, ${data.transportChargesType ?? ''}, By: ${data.transportBy ?? ''}`
      : data.dispatchType === 'COURIER'
      ? `Courier: ${data.transportName ?? ''}, AWB: ${data.awbNumber ?? ''}, ${data.transportChargesType ?? ''}, By: ${data.transportBy ?? ''}`
      : data.dispatchType === 'BY_HAND'
      ? `By Hand: ${data.deliveryBoyName ?? ''}`
      : data.dispatchType === 'SELF_COLLECTED'
      ? `Self Collected by: ${data.collectedByName ?? ''} ${data.collectedByPhone ?? ''}`
      : '';

    const dispatchNotes = [
      data.notes,
      dispatchTypeLine,
      dispatchCharge > 0 ? `Courier charges: ₹${dispatchCharge}` : '',
      data.isCod ? `COD amount: ₹${data.codAmount ?? 0}` : 'Prepaid',
    ].filter(Boolean).join(' | ');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.PENDING_DISPATCH_APPROVAL,
          shippingCharge: new Prisma.Decimal(dispatchCharge),
          notes: dispatchNotes,
        },
      });

      await tx.statusLog.create({
        data: {
          orderId,
          fromStatus: order.status,
          toStatus: OrderStatus.PENDING_DISPATCH_APPROVAL,
          changedById: agentId,
          reason: `Agent submitted for dispatch. ${dispatchNotes}`,
        },
      });

      return updated;
    });
  }

  async getOrderItems(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { product: true } } },
    });
    if (!order) throw new NotFoundException('Order not found');

    const itemIds = order.items.map((i) => i.id);
    let designFilesMap: Record<string, any[]> = {};

    if (itemIds.length > 0) {
      const results = await this.prisma.$queryRawUnsafe<{ id: string; designFiles: any[] }[]>(
        `SELECT id, "designFiles" FROM "OrderItem" WHERE id IN (${itemIds.map((_, i) => `$${i + 1}`).join(',')})`,
        ...itemIds,
      );
      designFilesMap = Object.fromEntries(results.map((r) => [r.id, Array.isArray(r.designFiles) ? r.designFiles : []]));
    }

    return order.items.map((i) => ({
      id: i.id,
      productName: i.product.name,
      sku: i.product.sku,
      quantity: i.quantity,
      unitPrice: Number(i.unitPrice),
      lineTotal: Number(i.lineTotal),
      productionNotes: i.productionNotes,
      itemProductionStage: i.itemProductionStage,
      designFiles: summarizeDesignFiles(designFilesMap[i.id]),
    }));
  }

  async submitDispatchBatch(
    orderIds: string[],
    agentId: string,
    data: { courierCharges: number; isCod: boolean; codAmount?: number; notes?: string; dispatchType?: string; transportName?: string; lrNumber?: string; transportChargesType?: string; transportBy?: string; awbNumber?: string; deliveryBoyName?: string; collectedByName?: string; collectedByPhone?: string; itemIdsByOrder?: Record<string, string[]> },
  ) {
    const results: string[] = [];
    const skipped: { orderId: string; orderNumber: string; reason: string }[] = [];
    const dispatchCharge = data.dispatchType === 'COURIER' ? Number(data.courierCharges || 0) : 0;
    for (const orderId of orderIds) {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: { items: { select: { id: true, itemProductionStage: true, product: { select: { name: true } } } } },
      });
      if (!order) continue;

      // Any item that's finished production (itemProductionStage ===
      // READY_FOR_DISPATCH) can be submitted for dispatch on its own, even if
      // the rest of the order is still mid-production — you don't have to
      // wait for every item to finish. Earlier this required the WHOLE
      // order's status to already be READY_FOR_DISPATCH, which blocked
      // booking a single ready item on an otherwise-unfinished order.
      //
      // Submitting early does flip this order's status forward (to
      // PENDING_DISPATCH_APPROVAL) even while sibling items are still
      // printing. That alone used to hide the order from Production's queue
      // (which only showed status APPROVED/IN_PRODUCTION) — that's fixed by
      // making listInProduction() key off "still has an unfinished item"
      // instead of order.status, and by having the production stage-update
      // rollup leave order.status alone once it's moved past IN_PRODUCTION.
      // See production.service.ts.
      const allowedStatuses: OrderStatus[] = [OrderStatus.APPROVED, OrderStatus.IN_PRODUCTION, OrderStatus.READY_FOR_DISPATCH];
      if (!allowedStatuses.includes(order.status)) {
        skipped.push({ orderId, orderNumber: order.orderNumber, reason: `Order status (${order.status}) isn't eligible for dispatch submission.` });
        continue;
      }

      // Defense in depth against the AMAN PHARMACY-style resubmission loop:
      // getOrdersWithReadyItems already excludes already-approved orders from
      // the list this is called from, but guard here too in case of a stale
      // frontend list or a direct API call — an order that's already been
      // through accounts approval should never be resubmitted, it just needs
      // the Dispatch team to book it.
      if (order.status === OrderStatus.READY_FOR_DISPATCH) {
        const alreadyApproved = await this.prisma.statusLog.findFirst({
          where: { orderId, fromStatus: OrderStatus.PENDING_DISPATCH_APPROVAL, toStatus: OrderStatus.READY_FOR_DISPATCH },
          select: { id: true },
        });
        if (alreadyApproved) {
          skipped.push({ orderId, orderNumber: order.orderNumber, reason: 'Already approved by accounts — this needs the Dispatch team to book it, not resubmission.' });
          continue;
        }
      }

      const readyItems = order.items.filter((i) => i.itemProductionStage === OrderProductionStage.READY_FOR_DISPATCH);
      if (readyItems.length === 0) {
        skipped.push({ orderId, orderNumber: order.orderNumber, reason: 'No items are ready for dispatch yet.' });
        continue;
      }

      // Optional per-item selection from the booking modal (agent can hold a
      // specific ready item back even when it's ready, e.g. to combine with a
      // later order). Falls back to "every ready item" when not provided, so
      // older/simpler callers keep working unchanged.
      const requestedItemIds = data.itemIdsByOrder?.[orderId];
      const submittedItems = requestedItemIds
        ? readyItems.filter((i) => requestedItemIds.includes(i.id))
        : readyItems;
      if (submittedItems.length === 0) continue;
      const itemNames = submittedItems.map((i) => i.product.name).join(', ');
      const partialNote = submittedItems.length < order.items.length
        ? `Submitting ${submittedItems.length}/${order.items.length} item(s), holding back the rest: ${itemNames}`
        : '';

      const dispatchTypeLine = data.dispatchType === 'TRANSPORT'
        ? `Transport: ${data.transportName ?? ''}, LR: ${data.lrNumber ?? ''}, ${data.transportChargesType ?? ''}, By: ${data.transportBy ?? ''}`
        : data.dispatchType === 'COURIER'
        ? `Courier: ${data.transportName ?? ''}, AWB: ${data.awbNumber ?? ''}, ${data.transportChargesType ?? ''}, By: ${data.transportBy ?? ''}`
        : data.dispatchType === 'BY_HAND'
        ? `By Hand: ${data.deliveryBoyName ?? ''}`
        : data.dispatchType === 'SELF_COLLECTED'
        ? `Self Collected by: ${data.collectedByName ?? ''} ${data.collectedByPhone ?? ''}`
        : '';

      const dispatchNotes = [
        data.notes,
        partialNote,
        dispatchTypeLine,
        dispatchCharge > 0 ? `Courier charges: ₹${dispatchCharge}` : '',
        data.isCod ? `COD: ₹${data.codAmount ?? 0} to be collected on delivery` : 'Prepaid',
        orderIds.length > 1 ? `Batch with: ${orderIds.filter((id) => id !== orderId).join(', ')}` : '',
      ].filter(Boolean).join(' | ');

      await this.prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: orderId },
          data: {
            status: OrderStatus.PENDING_DISPATCH_APPROVAL,
            shippingCharge: new Prisma.Decimal(dispatchCharge / orderIds.length),
            notes: dispatchNotes,
          },
        });

        await tx.statusLog.create({
          data: {
            orderId,
            fromStatus: order.status,
            toStatus: OrderStatus.PENDING_DISPATCH_APPROVAL,
            changedById: agentId,
            reason: `Agent submitted for dispatch. ${dispatchNotes}`,
          },
        });

        const fullOrder = await tx.order.findUnique({
          where: { id: orderId },
          include: { customer: true, salesAgent: { select: { fullName: true } }, items: { include: { product: true } } },
        });

        if (fullOrder?.customer.phone) {
          const product = fullOrder.items.map((i) => i.product.name).join(', ');
          void this.whatsapp.sendOrderUpdate({
            customerName: fullOrder.customer.businessName,
            customerPhone: fullOrder.customer.phone,
            orderNo: fullOrder.orderNumber,
            product,
            status: `Shipment being arranged | ${dispatchNotes}`,
            agentName: fullOrder.salesAgent?.fullName ?? 'Rareprint Team',
          });
        }
      });

      results.push(orderId);
    }

    return { success: true, processedOrders: results.length, skipped };
  }

  async getOrdersWithReadyItems(query: OrderListQuery = {}) {
    const { page, limit, skip } = paging(query);
    const mf = marginFilter(query);
    const includeMargin = query.includeMargin === true || mf.active;
    const includeCommission = includeMargin || query.includeCommission === true;
    const EXCLUDED_STATUSES = [
      OrderStatus.PENDING_DISPATCH_APPROVAL,
      OrderStatus.DISPATCHED,
      OrderStatus.DELIVERED,
      OrderStatus.CANCELLED,
    ];

    const where: Prisma.OrderWhereInput = {
      status: { notIn: EXCLUDED_STATUSES },
      items: { some: { itemProductionStage: 'READY_FOR_DISPATCH' } },
      // Once accounts has approved an order for dispatch (a StatusLog entry
      // PENDING_DISPATCH_APPROVAL → READY_FOR_DISPATCH exists), it goes back
      // to looking exactly like a freshly-finished, never-submitted order —
      // same status, same "ready item" shape — because approval intentionally
      // returns the order to READY_FOR_DISPATCH. Without this exclusion, that
      // order kept reappearing here as if it still needed to be submitted,
      // and re-submitting an already-approved order just re-creates the same
      // PENDING_DISPATCH_APPROVAL → (re-approved) → READY_FOR_DISPATCH cycle
      // forever without ever reaching the Dispatch team's booking queue —
      // this is the root cause of orders like AMAN PHARMACY / SHRI VIJAY
      // NURSING HOME looping and never actually dispatching. Once approved,
      // the order belongs in the Dispatch module (which independently lists
      // it via listReadyForDispatch), not back in this submission tab.
      statusLogs: {
        none: {
          fromStatus: OrderStatus.PENDING_DISPATCH_APPROVAL,
          toStatus: OrderStatus.READY_FOR_DISPATCH,
        },
      },
    };
    // Same server-side scoping as findAllForTable — see comment there.
    if (query.salesAgentId) where.salesAgentId = query.salesAgentId;
    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { orderNumber: { contains: search, mode: 'insensitive' } },
        { customer: { businessName: { contains: search, mode: 'insensitive' } } },
        { customer: { phone: { contains: search } } },
        { salesAgent: { fullName: { contains: search, mode: 'insensitive' } } },
        { items: { some: { product: { name: { contains: search, mode: 'insensitive' } } } } },
      ];
    }

    const orders = await this.prisma.order.findMany({
      where,
      orderBy: { orderDate: 'desc' },
      select: {
        id: true,
        orderNumber: true,
        customerId: true,
        salesAgentId: true,
        orderDate: true,
        status: true,
        isTest: true,
        isSample: true,
        samplePaymentType: true,
        grandTotal: true,
        customer: true,
        salesAgent: { select: { id: true, fullName: true } },
        items: {
          select: {
            id: true,
            productId: true,
            quantity: true,
            unitPrice: true,
            lineTotal: true,
            productionNotes: true,
            itemProductionStage: true,
            product: {
              select: {
                name: true,
                sizeInches: true,
                gsm: true,
                sides: true,
                category: true,
              }
            }
          }
        },
        payments: true,
      },
    });
    const slabsByProductId = (includeMargin || includeCommission)
      ? await this.getSlabsByProductId(orders.flatMap((o) => o.items.map((i) => i.productId)))
      : new Map<string, any[]>();
    const ordersWithSlabs = (includeMargin || includeCommission) ? this.attachCostSlabs(orders as any[], slabsByProductId) : orders;
    const marginFiltered = mf.active
      ? ordersWithSlabs.filter((o) => {
          const marginPct = this.calculateOrderMargin(o).marginPct;
          if (marginPct == null) return false;
          return mf.mode === 'above' ? marginPct >= mf.threshold : marginPct < mf.threshold;
        })
      : ordersWithSlabs;
    const total = marginFiltered.length;
    const pageOrders = marginFiltered.slice(skip, skip + limit);
    const designFileCounts = await this.getDesignFileCounts(
      pageOrders.flatMap((o) => o.items.map((i) => i.id)),
    );

    const data = pageOrders.map((o) => {
      const total = Number(o.grandTotal);
      const advancePaid = o.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      const balanceDue = total - advancePaid;
      const readyCount = o.items.filter((i) => i.itemProductionStage === 'READY_FOR_DISPATCH').length;
      const margin = includeMargin ? this.calculateOrderMargin(o) : null;
      const commission = includeCommission ? this.calculateOrderCommission(o) : null;

      return {
        id: o.id,
        orderNo: o.orderNumber,
        customerName: o.customer.businessName,
        customerPhone: o.customer.phone ?? null,
        salesAgentName: o.salesAgent?.fullName ?? null,
        products: o.items.map((i) => `${i.product.name} ×${i.quantity}`).join(', '),
        totalAmount: total,
        advancePaid,
        balanceDue,
        ...(includeMargin && margin ? {
          marginPct: margin.marginPct,
          marginTotal: margin.marginTotal,
          costTotal: margin.costTotal,
        } : {}),
        ...(includeCommission ? {
          commissionTotal: commission?.commissionTotal ?? null,
          commissionPctOfSale: commission?.commissionPctOfSale ?? null,
        } : {}),
        status: o.status,
        isTest: o.isTest,
        isSample: (o as any).isSample ?? false,
        date: o.orderDate.toISOString(),
        readyItemsCount: readyCount,
        totalItemsCount: o.items.length,
        itemDetails: buildItemDetails(o.items as any),
        items: o.items.map((i) => ({
          id: i.id,
          productName: i.product.name,
          itemProductionStage: i.itemProductionStage,
          designFiles: Array.from({ length: designFileCounts[i.id] ?? 0 }),
        })),
      };
    });
    return { data, page, limit, total, hasMore: page * limit < total };
  }
}



