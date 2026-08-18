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

// pendingDispatchItemIds only started being recorded on 2026-08-10 — any
// order that reached PENDING_DISPATCH_APPROVAL before that has an empty/
// null list even though it genuinely was submitted (the old, whole-order-
// at-once way, before per-item tracking existed). Treating an empty list as
// "nothing locked" made those older orders' ready items look like plain
// free/unsubmitted items everywhere this gets used — leaking back into the
// Ready-for-Dispatch tab, showing a wrong "FREE" badge, and letting an
// already-submitted item be re-offered in the booking modal's checklist.
// PENDING_DISPATCH_APPROVAL only ever gets set by submitDispatchBatch, so
// it's an unambiguous signal to fall back on: accounts.service.ts's
// getPendingDispatchOrders already does the same thing the other way
// (empty list = show every item); this is the matching exclusion-side
// fallback, shared by every place in this file that reads
// pendingDispatchItemIds.
function resolveLockedItemIds(order: {
  status: string;
  items: Array<{ id: string }>;
  pendingDispatchItemIds?: string[] | null;
}): Set<string> {
  const submittedIds = order.pendingDispatchItemIds ?? [];
  if (submittedIds.length > 0) return new Set(submittedIds);
  if (order.status === 'PENDING_DISPATCH_APPROVAL') return new Set(order.items.map((i) => i.id));
  return new Set<string>();
}

function buildItemDetails(
  items: Array<{ id: string; product: { name: string; sizeInches?: string | null; gsm?: number | null; sides?: string | null }; productionNotes?: string | null; quantity: number; unitPrice: Prisma.Decimal; lineTotal: Prisma.Decimal; itemProductionStage: string; dispatchedAt?: Date | null; cancelledAt?: Date | null }>,
  dispatchContext?: { lockedIds: Set<string>; orderStatus: string },
) {
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

    // Tells apart a genuinely free "Ready" item from one that's already
    // mid-submission (pending accounts approval, or approved and waiting on
    // Dispatch's queue) or already physically shipped. itemProductionStage
    // alone can't say this: it never changes away from READY_FOR_DISPATCH
    // even after real dispatch (see OrderItem.dispatchedAt in schema.prisma)
    // and doesn't know about pendingDispatchItemIds either — before this,
    // an already-submitted or already-shipped item still showed a plain
    // "Ready" badge forever, indistinguishable from one that's genuinely
    // free to submit. Confirmed via a real order (1473), 2026-08-10.
    let dispatchStatus: 'FREE' | 'PENDING_APPROVAL' | 'APPROVED' | 'DISPATCHED' | null = null;
    if (i.itemProductionStage === 'READY_FOR_DISPATCH') {
      if (i.dispatchedAt) {
        dispatchStatus = 'DISPATCHED';
      } else if (dispatchContext?.lockedIds.has(i.id)) {
        dispatchStatus = dispatchContext.orderStatus === 'PENDING_DISPATCH_APPROVAL' ? 'PENDING_APPROVAL' : 'APPROVED';
      } else {
        dispatchStatus = 'FREE';
      }
    }

    return {
      id: i.id,
      productName: i.product.name,
      productionNotes: i.productionNotes ?? null,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      lineTotal: i.lineTotal,
      itemProductionStage: i.itemProductionStage,
      dispatchStatus,
      size,
      gsm,
      sides: sidesLabel,
      cancelledAt: i.cancelledAt ?? null,
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
  // Test-order visibility filter (see Order.isTest). Undefined = show
  // everything (default, matches prior behaviour). 'true' = test orders
  // only (the dedicated "Test Orders" view). 'false' = hide test orders
  // (used by finance-facing screens that must never mix in dummy data).
  isTest?: string;
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
    // Test-order visibility (see OrderListQuery.isTest doc comment).
    if (query.isTest === 'true') where.isTest = true;
    else if (query.isTest === 'false') where.isTest = false;
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
            },
            // Plain key, not a spread -- Railway's build runs `prisma
            // generate` before `nest build`, so this column (already in
            // schema.prisma) is a normal, correctly-typed select field by
            // the time it compiles there. A `...({ dispatchedAt: true } as
            // any)` spread WAS used here instead and broke Railway's build
            // outright (TS2367/TS2345/TS2339 on 2026-08-10) -- spreading an
            // `any` into a select object literal corrupts TypeScript's
            // inferred return type for the whole query. Turns out this
            // isn't limited to a NESTED select (as originally thought) --
            // the identical spread pattern at the TOP level of this same
            // select (pendingDispatchItemIds, right below) broke the build
            // the same way (TS2322 on 2026-08-10, o.status inferred as some
            // unrelated giant union). Plain keys are safe in both places.
            dispatchedAt: true,
            cancelledAt: true,
          }
        },
        payments: true,
        pendingDispatchItemIds: true,
        cancellationRequestedAt: true,
        cancellationReason: true,
        pendingCancelItemIds: true,
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
        itemDetails: buildItemDetails(o.items as any, {
          lockedIds: resolveLockedItemIds({ status: o.status, items: o.items, pendingDispatchItemIds: (o as any).pendingDispatchItemIds }),
          orderStatus: o.status,
        }),
        items: o.items.map((i) => ({
          id: i.id,
          productName: i.product.name,
          itemProductionStage: i.itemProductionStage,
          designFiles: Array.from({ length: designFileCounts[i.id] ?? 0 }),
          cancelledAt: (i as any).cancelledAt ?? null,
        })),
        cancellationRequestedAt: (o as any).cancellationRequestedAt ?? null,
        cancellationReason: (o as any).cancellationReason ?? null,
        pendingCancelItemIds: (o as any).pendingCancelItemIds ?? [],
      };
    });
    return { data, page, limit, total, hasMore: page * limit < total };
  }

  async create(
    dto: {
      customer: { customerId?: string; name: string; phone?: string; phone2?: string; email?: string; address?: string; city?: string; state?: string; pincode?: string; gstNumber?: string };
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
    // Frontend already blocks this (see frontend/app/orders/create/page.tsx's
    // submitOrder), but that alone let an order through with no phone number
    // at all when bypassed -- confirmed via a real order (1491, SURBHI
    // MEDICAL STORE), since the old frontend check only validated LENGTH
    // when a phone was already entered, never that one was entered at all.
    // Backend must be the actual source of truth for this, not just the UI.
    if (!dto.customer.phone?.trim()) {
      throw new BadRequestException('Phone number is required');
    }
    if (dto.customer.phone.trim().length !== 10) {
      throw new BadRequestException('Phone number must be exactly 10 digits');
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
              ...(dto.customer.gstNumber ? { gstNumber: dto.customer.gstNumber } : {}),
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
              gstNumber: dto.customer.gstNumber,
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
        // Exact rate/unit, not rounded to a whole rupee — this is the price the
        // customer agreed to per unit (e.g. ₹10.5), and toFixed(0) was silently
        // rounding it up to ₹11 in the WhatsApp message. Trim trailing zeros so
        // whole rates still show as "10" rather than "10.00".
        const rate = Number(i.unitPrice).toFixed(2).replace(/\.?0+$/, '');
        const total = Number(i.lineTotal).toFixed(0);
        return `${i.product.name} ${size} ${gsm}gsm ${sidesLabel} x${i.quantity} @₹${rate} = ₹${total}`;
      }).join(' | ');
      // AiSensy/WhatsApp template params reject newlines, tabs, and runs of
      // 4+ spaces ("Param text cannot have new-line/tab characters or more
      // than 4 consecutive spaces"). The previous "• line\n• line" format
      // silently failed delivery for every order with 2+ items (i.e. most
      // orders) — only single-item orders (no join needed) ever got through.

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

      // Test orders each get their own disposable "TEST CUSTOMER (DELETE
      // ME)" row (see createTestOrder) — clean it up too so deleting a test
      // order doesn't leave junk customers behind in the Customer
      // Directory. Guarded by a remaining-orders check even though this
      // customer is always created 1:1 with its order.
      if (order.isTest) {
        const remaining = await tx.order.count({ where: { customerId: order.customerId } });
        if (remaining === 0) {
          await tx.customer.delete({ where: { id: order.customerId } }).catch(() => undefined);
        }
      }
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

    const orderId = await this.prisma.$transaction(async (tx) => {
      // Deliberately no phone/email on the test customer. Every WhatsApp/SMS
      // send helper (see whatsapp.service.ts) bails out early when
      // customerPhone is falsy, so leaving this unset is what keeps the
      // entire test-order lifecycle (approval, dispatch, invoicing) from
      // ever placing a real outbound message to anyone — no per-call-site
      // guards needed, and nothing to forget to update if a new
      // notification is added later.
      const customer = await tx.customer.create({
        data: {
          customerCode,
          businessName: 'TEST CUSTOMER (DELETE ME)',
          contactPerson: 'Test',
        },
      });

      const order = await tx.order.create({
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
          notes: 'TEST ORDER — safe to delete. Excluded from billing, invoicing totals, commissions, payroll and all reports; behaves like a real order everywhere else so you can exercise the full approval → production → dispatch pipeline.',
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

      return order.id;
    });

    return { success: true, orderNumber: testOrderNumber, id: orderId };
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
          courierChargeQuoted: dispatchCharge > 0 ? new Prisma.Decimal(dispatchCharge) : null,
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

  // Request cancellation of a whole order or specific item(s) — only while
  // still NOT_PRINTED (production hasn't actually started on them). Doesn't
  // cancel anything itself: it flags the request for Accounts to approve or
  // reject (see AccountsService.approveCancellation/rejectCancellation),
  // mirroring how dispatch submissions go through accounts approval before
  // taking effect. itemIds omitted/empty means "cancel the whole order."
  async requestCancellation(
    orderId: string,
    itemIds: string[] | undefined,
    reason: string,
    userId: string,
    userName: string,
  ) {
    if (!reason?.trim()) {
      throw new BadRequestException('A reason is required to request cancellation');
    }
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    const TERMINAL: OrderStatus[] = [OrderStatus.CANCELLED, OrderStatus.DISPATCHED, OrderStatus.DELIVERED];
    if (TERMINAL.includes(order.status)) {
      throw new BadRequestException(`Order status (${order.status}) can't be cancelled`);
    }
    if ((order as any).cancellationRequestedAt) {
      throw new BadRequestException('A cancellation request is already pending accounts approval for this order');
    }

    const targetIds = itemIds && itemIds.length > 0 ? itemIds : null; // null = whole order
    const targetItems = targetIds ? order.items.filter((i) => targetIds.includes(i.id)) : order.items;
    if (targetIds && targetItems.length !== targetIds.length) {
      throw new BadRequestException('One or more selected items were not found on this order');
    }
    if (targetItems.length === 0) {
      throw new BadRequestException('No items to cancel');
    }

    const notEligible = targetItems.filter(
      (i) => i.itemProductionStage !== OrderProductionStage.NOT_PRINTED || !!(i as any).cancelledAt,
    );
    if (notEligible.length > 0) {
      throw new BadRequestException(
        targetIds
          ? 'Only items still "Not Printed" can be cancelled — one or more selected items have already moved past that stage.'
          : 'The whole order can only be cancelled while every item is still "Not Printed" — cancel individual items instead, or wait for accounts to review.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id: orderId },
        data: ({
          cancellationRequestedAt: new Date(),
          cancellationRequestedByName: userName,
          cancellationReason: reason.trim(),
          pendingCancelItemIds: targetIds ?? [],
        } as any),
      });
      await tx.statusLog.create({
        data: {
          orderId,
          fromStatus: order.status,
          toStatus: order.status,
          changedById: userId,
          reason: targetIds
            ? `Requested cancellation of ${targetItems.length} item(s): ${reason.trim()}`
            : `Requested cancellation of the whole order: ${reason.trim()}`,
          metadata: { type: 'CANCELLATION_REQUESTED', itemIds: targetIds ?? 'ALL' },
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

    // Items already covered by an active dispatch submission (pending
    // accounts approval, or already approved and waiting on Dispatch's own
    // queue) shouldn't be offered again in the booking modal's checklist --
    // otherwise the same item could be submitted a second time on top of
    // its existing pending/approved submission.
    const lockedIds = resolveLockedItemIds({ status: order.status, items: order.items, pendingDispatchItemIds: (order as any).pendingDispatchItemIds });

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
      // Also true once actually physically dispatched — an already-shipped
      // item must never be offered for a new submission either.
      dispatchLocked: lockedIds.has(i.id) || !!(i as any).dispatchedAt,
    }));
  }

  async submitDispatchBatch(
    orderIds: string[],
    agentId: string,
    data: { courierCharges: number; isCod: boolean; codAmount?: number; notes?: string; dispatchType?: string; transportName?: string; lrNumber?: string; transportChargesType?: string; transportBy?: string; awbNumber?: string; deliveryBoyName?: string; collectedByName?: string; collectedByPhone?: string; itemIdsByOrder?: Record<string, string[]>; productPhoto?: string; billPhoto?: string },
  ) {
    const results: string[] = [];
    const skipped: { orderId: string; orderNumber: string; reason: string }[] = [];
    const dispatchCharge = data.dispatchType === 'COURIER' ? Number(data.courierCharges || 0) : 0;
    for (const orderId of orderIds) {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        // Was a `select` listing only id/itemProductionStage/product.name --
        // switched to `include` (pulls every OrderItem scalar column,
        // including dispatchedAt) because spreading a `...({ dispatchedAt:
        // true } as any)` INTO that nested select broke Prisma's type
        // inference for the whole `items` field on Railway's build (the
        // sandbox that wrote this code can't run `prisma generate` to
        // verify locally) -- TS inferred a garbled union type mixing in
        // unrelated relations like ItemStageLog, failing the build outright
        // with TS2367/TS2345/TS2339. Turns out the same spread pattern ALSO
        // breaks the build at the top level of a select, not just nested
        // (see the pendingDispatchItemIds fix elsewhere in this file,
        // 2026-08-10) -- plain keys only, never `...({...} as any)`, in any
        // select in this file.
        include: {
          items: {
            include: {
              product: { select: { name: true } },
            },
          },
        },
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
      // PARTIALLY_DISPATCHED added 2026-08-10: once an order has had SOME
      // items actually booked/shipped, its status moves to
      // PARTIALLY_DISPATCHED — but that doesn't mean the order is "done."
      // Any items that were never part of that batch (still genuinely
      // ready, not in pendingDispatchItemIds, no dispatchedAt) must still
      // be submittable. Before this, submitting a second, later batch of
      // items from the same order was blocked outright with "Order status
      // (PARTIALLY_DISPATCHED) isn't eligible for dispatch submission" —
      // confirmed via a real order (1473), even though
      // getOrdersWithReadyItems (the list this is submitted from) already
      // correctly showed the order as having free ready items.
      const allowedStatuses: OrderStatus[] = [
        OrderStatus.APPROVED,
        OrderStatus.IN_PRODUCTION,
        OrderStatus.READY_FOR_DISPATCH,
        OrderStatus.PARTIALLY_DISPATCHED,
      ];
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

      // Defense in depth, same reasoning as the approval check above: the
      // booking modal already excludes already-dispatched items via
      // dispatchLocked (getOrderItems), but guard here too against a stale
      // frontend list or a direct API call re-submitting an item that's
      // already been physically shipped.
      const readyItems = order.items.filter(
        (i) => i.itemProductionStage === OrderProductionStage.READY_FOR_DISPATCH && !(i as any).dispatchedAt,
      );
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
            courierChargeQuoted: dispatchCharge > 0 ? new Prisma.Decimal(dispatchCharge / orderIds.length) : null,
            notes: dispatchNotes,
            // Record exactly which item(s) this submission covers so the
            // accounts approval screen can show only those, not every item
            // on the order — see getPendingDispatchOrders. `as any` because
            // this sandbox can't run `prisma generate` against the live DB,
            // so the locally-generated client type doesn't know about this
            // field yet (it will on the real build).
            ...({ pendingDispatchItemIds: submittedItems.map((i) => i.id) } as any),
            // Packing/bill photos captured in the Book Shipment modal, kept
            // as base64 data URLs (same as design file uploads elsewhere in
            // this app) so Accounts can see exactly what was packed/billed
            // on the Dispatch Approval card. Only overwrite when a new one
            // was actually provided — omit undefined so an order resubmitted
            // without a fresh photo doesn't wipe out an existing one.
            ...(data.productPhoto ? ({ dispatchProductPhoto: data.productPhoto } as any) : {}),
            ...(data.billPhoto ? ({ dispatchBillPhoto: data.billPhoto } as any) : {}),
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
    // Only truly terminal/handled-elsewhere statuses are excluded up front.
    // PENDING_DISPATCH_APPROVAL and READY_FOR_DISPATCH (which is overloaded:
    // it means both "production just finished, not yet submitted" AND
    // "accounts already approved this for dispatch", since approveDispatch
    // deliberately returns the order to this same status so Dispatch's own
    // queue picks it up) used to be decided by order-wide status/history
    // checks here. That meant submitting even ONE item out of a multi-item
    // order hid the WHOLE order — including any other still-untouched ready
    // items — until the submitted item's approval cycle finished, and even
    // then those other items never came back (the order just looked
    // "already handled"). Root-caused via a real order (1469) on 2026-08-10.
    //
    // Now this is decided per item, below, using pendingDispatchItemIds
    // (which items are actually part of an active submit/approve cycle) and
    // dispatchedAt (which items have actually been physically shipped) — an
    // order shows here whenever it has at least one ready item that's
    // neither locked into a submission nor already dispatched, regardless
    // of what its OTHER items or its overall status are doing. This also
    // still prevents the AMAN PHARMACY / SHRI VIJAY NURSING HOME
    // resubmission-loop bug: once ALL of an order's ready items are locked
    // or dispatched, none remain free, so the order correctly drops out
    // here until rejectDispatch frees them again (see accounts.service.ts).
    //
    // PARTIALLY_DISPATCHED is no longer hard-excluded: before dispatchedAt
    // existed, there was no reliable way to tell "already shipped in an
    // earlier partial batch" apart from "still genuinely ready," so
    // including these orders risked re-showing already-shipped items as
    // free again. Now that dispatchedAt exists, that risk is gone.
    const EXCLUDED_STATUSES = [
      OrderStatus.DISPATCHED,
      OrderStatus.DELIVERED,
      OrderStatus.CANCELLED,
    ];

    const where: Prisma.OrderWhereInput = {
      status: { notIn: EXCLUDED_STATUSES },
      items: { some: { itemProductionStage: 'READY_FOR_DISPATCH' } },
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
            },
            // Plain key, not a spread -- see the matching comment in
            // findAllForTable above; a spread here broke Railway's build.
            dispatchedAt: true,
          }
        },
        payments: true,
        // Plain key, not a spread -- see the matching comment in
        // findAllForTable above; the same spread pattern here broke
        // Railway's build too (TS2322 on 2026-08-10).
        pendingDispatchItemIds: true,
      },
    });
    // Drop orders where every ready item is already locked into an active
    // dispatch submission (pending approval, or approved and waiting on
    // Dispatch's queue) — only orders with at least one FREE ready item
    // belong here. See the big comment above `where` for why this replaced
    // the old order-wide status/history check.
    //
    // See resolveLockedItemIds (top of file) for why an empty/null
    // pendingDispatchItemIds still needs to lock every ready item when the
    // order is already PENDING_DISPATCH_APPROVAL — otherwise older orders
    // (submitted before that column existed) leak back into this tab even
    // though they're already sitting in Accounts' Dispatch Approval queue.
    const readyOrders = orders.filter((o) => {
      const lockedIds = resolveLockedItemIds({ status: o.status, items: o.items, pendingDispatchItemIds: (o as any).pendingDispatchItemIds });
      return o.items.some((i) => i.itemProductionStage === 'READY_FOR_DISPATCH' && !lockedIds.has(i.id) && !(i as any).dispatchedAt);
    });
    const slabsByProductId = (includeMargin || includeCommission)
      ? await this.getSlabsByProductId(readyOrders.flatMap((o) => o.items.map((i) => i.productId)))
      : new Map<string, any[]>();
    const ordersWithSlabs = (includeMargin || includeCommission) ? this.attachCostSlabs(readyOrders as any[], slabsByProductId) : readyOrders;
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
      // Only count/show items that are actually free to submit — items
      // already locked into an active submission are excluded (see
      // readyOrders/resolveLockedItemIds above); this keeps the tab's
      // "Ready" count and the booking checklist in sync with each other.
      const lockedIds = resolveLockedItemIds({ status: o.status, items: o.items, pendingDispatchItemIds: (o as any).pendingDispatchItemIds });
      const readyCount = o.items.filter((i) => i.itemProductionStage === 'READY_FOR_DISPATCH' && !lockedIds.has(i.id) && !(i as any).dispatchedAt).length;
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
        itemDetails: buildItemDetails(o.items as any, {
          lockedIds: resolveLockedItemIds({ status: o.status, items: o.items, pendingDispatchItemIds: (o as any).pendingDispatchItemIds }),
          orderStatus: o.status,
        }),
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



