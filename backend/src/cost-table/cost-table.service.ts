import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

export interface CostSettings {
  minApprovalMarginPct: number;   // e.g. 15  (order disapproved below this)
  warningMarginPct: number;       // e.g. 20  (amber warning below this)
  agentCommissionPct: number;     // e.g. 10  (% of margin amount)
}

const SETTINGS_FILE = path.join(__dirname, '..', '..', '..', 'cost-settings.json');

const DEFAULT_SETTINGS: CostSettings = {
  minApprovalMarginPct: 15,
  warningMarginPct: 20,
  agentCommissionPct: 10,
};

@Injectable()
export class CostTableService {
  constructor(private readonly prisma: PrismaService) {}

  private getMonthRange() {
    const now = new Date();
    const istOffsetMs = 330 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffsetMs);
    return {
      start: new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), 1) - istOffsetMs),
      end: new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth() + 1, 1) - istOffsetMs),
    };
  }

  private matchingSlab(slabs: any[], quantity: number) {
    return slabs
      .filter((slab) => slab.minQuantity <= quantity && (slab.maxQuantity == null || slab.maxQuantity >= quantity))
      .sort((a, b) => b.minQuantity - a.minQuantity)[0] ?? null;
  }

  private lineCostTotal(item: any) {
    const slab = this.matchingSlab(item.product.costSlabs ?? [], item.quantity);
    if (!slab) return null;
    const raw = Number(slab.unitPrice);
    const salePerUnit = Number(item.unitPrice);
    const costPerUnit = raw > salePerUnit ? raw / slab.minQuantity : raw;
    return costPerUnit * item.quantity;
  }

  private rateTotal(item: any) {
    const slab = this.matchingSlab(item.product.rateSlabs ?? [], item.quantity);
    return slab ? Number(slab.rateAmount) : Number(item.lineTotal);
  }

  private isSticker(item: any) {
    const haystack = `${item.product.name} ${item.product.category?.name ?? ''}`.toLowerCase();
    return haystack.includes('sticker');
  }

  private commissionForLine(order: any, item: any, costTotal: number) {
    const agentCategory = order.salesAgent?.salesAgentCategory ?? 'B';
    const saleTotal = Number(item.lineTotal);
    const profit = saleTotal - costTotal;
    if (profit <= 0) return 0;

    const rateTotal = this.rateTotal(item);
    const discountPct = rateTotal > 0 ? Math.max(0, ((rateTotal - saleTotal) / rateTotal) * 100) : 0;

    if (agentCategory === 'D') {
      return Math.max(0, saleTotal - rateTotal);
    }

    if (discountPct > 5) {
      return profit / (agentCategory === 'C' ? 3.75 : 4);
    }

    if (agentCategory === 'A') {
      return rateTotal * (this.isSticker(item) ? 0.15 : 0.10);
    }
    if (agentCategory === 'C') {
      return rateTotal * (this.isSticker(item) ? 0.17 : 0.12);
    }
    return rateTotal * 0.10;
  }

  private async profitRows(start: Date, end: Date) {
    const orders = await this.prisma.order.findMany({
      where: { orderDate: { gte: start, lt: end }, status: { not: 'CANCELLED' as any } },
      include: {
        salesAgent: { select: { id: true, fullName: true, salesAgentCategory: true } as any },
        items: {
          include: {
            product: {
              include: {
                category: true,
                costSlabs: true,
                rateSlabs: true,
              } as any,
            },
          },
        },
      },
      orderBy: { orderDate: 'desc' },
    });

    return orders.map((order: any) => {
      let saleTotal = Number(order.grandTotal);
      let costTotal = 0;
      let commissionTotal = 0;
      let hasMissingCost = false;
      for (const item of order.items) {
        const lineCost = this.lineCostTotal(item);
        if (lineCost == null) {
          hasMissingCost = true;
          continue;
        }
        costTotal += lineCost;
        commissionTotal += this.commissionForLine(order, item, lineCost);
      }
      const grossProfit = hasMissingCost ? null : saleTotal - costTotal;
      return {
        orderId: order.id,
        orderNo: order.orderNumber,
        orderDate: order.orderDate,
        salesAgentId: order.salesAgentId,
        salesAgentName: order.salesAgent?.fullName ?? null,
        salesAgentCategory: order.salesAgent?.salesAgentCategory ?? null,
        saleTotal,
        costTotal: hasMissingCost ? null : Number(costTotal.toFixed(2)),
        grossProfit: grossProfit == null ? null : Number(grossProfit.toFixed(2)),
        commissionTotal: hasMissingCost ? null : Number(commissionTotal.toFixed(2)),
        netGrossProfit: grossProfit == null ? null : Number((grossProfit - commissionTotal).toFixed(2)),
        hasMissingCost,
      };
    });
  }

  // ── Settings ─────────────────────────────────────────────────────────────

  getSettings(): CostSettings {
    try {
      if (fs.existsSync(SETTINGS_FILE)) {
        return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
      }
    } catch {}
    return { ...DEFAULT_SETTINGS };
  }

  saveSettings(dto: Partial<CostSettings>): CostSettings {
    const current = this.getSettings();
    const updated = { ...current, ...dto };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2));
    return updated;
  }

  // ── Products with slabs ───────────────────────────────────────────────────

  async getAllProductsWithSlabs() {
    return this.prisma.product.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        sku: true,
        name: true,
        gsm: true,
        sizeInches: true,
        printingType: true,
        sides: true,
        category: { select: { name: true } },
        costSlabs: {
          orderBy: { minQuantity: 'asc' },
          select: {
            id: true,
            minQuantity: true,
            maxQuantity: true,
            unitPrice: true,
            setupCost: true,
            effectiveFrom: true,
            effectiveTo: true,
          },
        },
      },
    });
  }

  async getSlabsForProduct(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, sku: true, name: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    const slabs = await this.prisma.productCostSlab.findMany({
      where: { productId },
      orderBy: { minQuantity: 'asc' },
    });
    return { product, slabs };
  }

  // ── CRUD for slabs ────────────────────────────────────────────────────────

  async createSlab(dto: {
    productId: string;
    minQuantity: number;
    maxQuantity?: number | null;
    unitPrice: number;
    setupCost?: number | null;
    effectiveFrom?: string;
    effectiveTo?: string | null;
  }) {
    return this.prisma.productCostSlab.create({
      data: {
        productId: dto.productId,
        minQuantity: dto.minQuantity,
        maxQuantity: dto.maxQuantity ?? null,
        unitPrice: dto.unitPrice,
        setupCost: dto.setupCost ?? null,
        effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date(),
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
      },
    });
  }

  async updateSlab(
    id: string,
    dto: {
      minQuantity?: number;
      maxQuantity?: number | null;
      unitPrice?: number;
      setupCost?: number | null;
      effectiveFrom?: string;
      effectiveTo?: string | null;
    },
  ) {
    const existing = await this.prisma.productCostSlab.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Cost slab not found');

    return this.prisma.productCostSlab.update({
      where: { id },
      data: {
        ...(dto.minQuantity !== undefined && { minQuantity: dto.minQuantity }),
        ...(dto.maxQuantity !== undefined && { maxQuantity: dto.maxQuantity }),
        ...(dto.unitPrice !== undefined && { unitPrice: dto.unitPrice }),
        ...(dto.setupCost !== undefined && { setupCost: dto.setupCost }),
        ...(dto.effectiveFrom !== undefined && { effectiveFrom: new Date(dto.effectiveFrom) }),
        ...(dto.effectiveTo !== undefined && {
          effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
        }),
      },
    });
  }

  async deleteSlab(id: string) {
    const existing = await this.prisma.productCostSlab.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Cost slab not found');
    await this.prisma.productCostSlab.delete({ where: { id } });
    return { success: true };
  }

  // ── Bulk upsert (for paste/import) ────────────────────────────────────────

  async bulkUpsertSlabs(
    productId: string,
    slabs: Array<{ minQuantity: number; maxQuantity?: number | null; unitPrice: number; setupCost?: number | null }>,
  ) {
    // Delete existing slabs for this product and replace
    await this.prisma.productCostSlab.deleteMany({ where: { productId } });
    const created = await Promise.all(
      slabs.map((s) =>
        this.prisma.productCostSlab.create({
          data: {
            productId,
            minQuantity: s.minQuantity,
            maxQuantity: s.maxQuantity ?? null,
            unitPrice: s.unitPrice,
            setupCost: s.setupCost ?? null,
          },
        }),
      ),
    );
    return created;
  }

  // ── Margin & approval check ───────────────────────────────────────────────

  async checkMargin(dto: {
    productId: string;
    quantity: number;
    salePricePerUnit: number;
    agentId?: string;
  }) {
    const settings = this.getSettings();

    // Find the matching cost slab
    const slab = await this.prisma.productCostSlab.findFirst({
      where: {
        productId: dto.productId,
        minQuantity: { lte: dto.quantity },
        effectiveFrom: { lte: new Date() },
        AND: [
          {
            OR: [
              { maxQuantity: null },
              { maxQuantity: { gte: dto.quantity } },
            ],
          },
          {
            OR: [
              { effectiveTo: null },
              { effectiveTo: { gte: new Date() } },
            ],
          },
        ],
      },
      orderBy: { minQuantity: 'desc' }, // pick the largest min that still fits
    });

    if (!slab) {
      return {
        hasCost: false,
        message: 'No cost slab found for this product and quantity',
        costPerUnit: null,
        marginPerUnit: null,
        marginPct: null,
        status: 'NO_COST_DATA',
        commissionAmount: null,
      };
    }

    const costPerUnit = Number(slab.unitPrice);
    const salePrice = dto.salePricePerUnit;
    const marginPerUnit = salePrice - costPerUnit;
    const marginPct = salePrice > 0 ? (marginPerUnit / salePrice) * 100 : 0;
    const totalMargin = marginPerUnit * dto.quantity;
    const commissionAmount =
      marginPerUnit > 0 ? (totalMargin * settings.agentCommissionPct) / 100 : 0;

    let status: 'APPROVED' | 'LOW_MARGIN' | 'DISAPPROVED';
    if (marginPct < settings.minApprovalMarginPct) {
      status = 'DISAPPROVED';
    } else if (marginPct < settings.warningMarginPct) {
      status = 'LOW_MARGIN';
    } else {
      status = 'APPROVED';
    }

    return {
      hasCost: true,
      productId: dto.productId,
      quantity: dto.quantity,
      salePricePerUnit: salePrice,
      costPerUnit,
      setupCost: slab.setupCost ? Number(slab.setupCost) : null,
      marginPerUnit: Number(marginPerUnit.toFixed(2)),
      marginPct: Number(marginPct.toFixed(2)),
      totalMargin: Number(totalMargin.toFixed(2)),
      commissionAmount: Number(commissionAmount.toFixed(2)),
      commissionPct: settings.agentCommissionPct,
      status,
      settings: {
        minApprovalMarginPct: settings.minApprovalMarginPct,
        warningMarginPct: settings.warningMarginPct,
      },
    };
  }

  // ── Lookup cost for a product + quantity (used by orders) ─────────────────

  async getCostForProductQty(productId: string, quantity: number): Promise<number | null> {
    const slab = await this.prisma.productCostSlab.findFirst({
      where: {
        productId,
        minQuantity: { lte: quantity },
        OR: [{ maxQuantity: null }, { maxQuantity: { gte: quantity } }],
      },
      orderBy: { minQuantity: 'desc' },
    });
    return slab ? Number(slab.unitPrice) : null;
  }

  async getProfitabilitySummary() {
    const { start, end } = this.getMonthRange();
    const rows = await this.profitRows(start, end);
    const completeRows = rows.filter((row) => !row.hasMissingCost);
    const totals = completeRows.reduce((acc, row) => ({
      saleTotal: acc.saleTotal + row.saleTotal,
      costTotal: acc.costTotal + Number(row.costTotal ?? 0),
      grossProfit: acc.grossProfit + Number(row.grossProfit ?? 0),
      commissionTotal: acc.commissionTotal + Number(row.commissionTotal ?? 0),
      netGrossProfit: acc.netGrossProfit + Number(row.netGrossProfit ?? 0),
    }), { saleTotal: 0, costTotal: 0, grossProfit: 0, commissionTotal: 0, netGrossProfit: 0 });

    const agentMap = new Map<string, any>();
    for (const row of completeRows) {
      const id = row.salesAgentId ?? 'NO_AGENT';
      const current = agentMap.get(id) ?? {
        id,
        name: row.salesAgentName ?? 'No Agent',
        category: row.salesAgentCategory,
        saleTotal: 0,
        grossProfit: 0,
        commissionTotal: 0,
        netGrossProfit: 0,
        orderCount: 0,
      };
      current.saleTotal += row.saleTotal;
      current.grossProfit += Number(row.grossProfit ?? 0);
      current.commissionTotal += Number(row.commissionTotal ?? 0);
      current.netGrossProfit += Number(row.netGrossProfit ?? 0);
      current.orderCount++;
      agentMap.set(id, current);
    }

    return {
      month: start.toISOString().slice(0, 7),
      totals: Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, Number(value.toFixed(2))])),
      missingCostOrderCount: rows.filter((row) => row.hasMissingCost).length,
      rows,
      agents: Array.from(agentMap.values()).map((row) => ({
        ...row,
        saleTotal: Number(row.saleTotal.toFixed(2)),
        grossProfit: Number(row.grossProfit.toFixed(2)),
        commissionTotal: Number(row.commissionTotal.toFixed(2)),
        netGrossProfit: Number(row.netGrossProfit.toFixed(2)),
      })),
    };
  }

  async getProductsWithoutCost() {
    return this.prisma.product.findMany({
      where: { isActive: true, costSlabs: { none: {} } },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        sku: true,
        name: true,
        description: true,
        gsm: true,
        sizeInches: true,
        sides: true,
        category: { select: { name: true } },
      },
    });
  }

  // ── Orders that have items with no cost slab ──────────────────────────────

  async getOrdersWithoutCost() {
    // Find all order IDs that have at least one item with NO matching cost slab
    // for its actual quantity (covers both: no slabs at all, and slabs that
    // don't cover the item's quantity range).
    const orderIdsRaw = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT DISTINCT o.id
      FROM "Order" o
      JOIN "OrderItem" oi ON oi."orderId" = o.id
      WHERE NOT EXISTS (
        SELECT 1 FROM "ProductCostSlab" pcs
        WHERE pcs."productId" = oi."productId"
          AND pcs."minQuantity" <= oi.quantity
          AND (pcs."maxQuantity" IS NULL OR pcs."maxQuantity" >= oi.quantity)
      )
    `;
    const orderIds = orderIdsRaw.map((r) => r.id);
    if (orderIds.length === 0) return [];

    const orders = await (this.prisma as any).order.findMany({
      where: { id: { in: orderIds } },
      include: {
        customer: { select: { businessName: true, phone: true } },
        salesAgent: { select: { fullName: true } },
        items: {
          include: {
            product: {
              select: {
                id: true, sku: true, name: true, gsm: true,
                sizeInches: true, sides: true,
                category: { select: { name: true } },
                costSlabs: { select: { id: true, minQuantity: true, maxQuantity: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return orders.map((order: any) => ({
      id: order.id,
      orderNo: order.orderNumber,
      status: order.status,
      customerName: order.customer.businessName,
      customerPhone: order.customer.phone ?? null,
      salesAgentName: order.salesAgent?.fullName ?? null,
      orderDate: order.orderDate,
      totalAmount: Number(order.grandTotal),
      itemsWithNoCost: order.items
        .filter((item: any) => {
          // Item has no matching slab for its quantity
          const hasMatch = item.product.costSlabs.some(
            (slab: any) =>
              slab.minQuantity <= item.quantity &&
              (slab.maxQuantity == null || slab.maxQuantity >= item.quantity),
          );
          return !hasMatch;
        })
        .map((item: any) => ({
          productId: item.product.id,
          sku: item.product.sku,
          productName: item.product.name,
          gsm: item.product.gsm,
          sizeInches: item.product.sizeInches,
          sides: item.product.sides,
          category: item.product.category?.name ?? null,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
        })),
    }));
  }

  async getOrdersWithoutRate() {
    const orderIdsRaw = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT DISTINCT o.id
      FROM "Order" o
      JOIN "OrderItem" oi ON oi."orderId" = o.id
      WHERE NOT EXISTS (
        SELECT 1 FROM "ProductRateSlab" prs
        WHERE prs."productId" = oi."productId"
          AND prs."minQuantity" <= oi.quantity
          AND (prs."maxQuantity" IS NULL OR prs."maxQuantity" >= oi.quantity)
      )
    `;
    const orderIds = orderIdsRaw.map((r) => r.id);
    if (orderIds.length === 0) return [];

    const orders = await (this.prisma as any).order.findMany({
      where: { id: { in: orderIds } },
      include: {
        customer: { select: { businessName: true, phone: true } },
        salesAgent: { select: { fullName: true } },
        items: {
          include: {
            product: {
              select: {
                id: true, sku: true, name: true, gsm: true,
                sizeInches: true, sides: true,
                category: { select: { name: true } },
                rateSlabs: { select: { id: true, minQuantity: true, maxQuantity: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return orders
      .map((order: any) => ({
        id: order.id,
        orderNo: order.orderNumber,
        status: order.status,
        customerName: order.customer.businessName,
        customerPhone: order.customer.phone ?? null,
        salesAgentName: order.salesAgent?.fullName ?? null,
        orderDate: order.orderDate,
        totalAmount: Number(order.grandTotal),
        itemsWithNoRate: order.items
          .filter((item: any) => {
            const hasMatch = item.product.rateSlabs.some(
              (slab: any) =>
                slab.minQuantity <= item.quantity &&
                (slab.maxQuantity == null || slab.maxQuantity >= item.quantity),
            );
            return !hasMatch;
          })
          .map((item: any) => ({
            productId: item.product.id,
            sku: item.product.sku,
            productName: item.product.name,
            gsm: item.product.gsm,
            sizeInches: item.product.sizeInches,
            sides: item.product.sides,
            category: item.product.category?.name ?? null,
            quantity: item.quantity,
            unitPrice: Number(item.unitPrice),
          })),
      }))
      .filter((order: any) => order.itemsWithNoRate.length > 0);
  }

  async getRateSlabsForProduct(productId: string) {
    return (this.prisma as any).productRateSlab.findMany({
      where: { productId },
      orderBy: { minQuantity: 'asc' },
    });
  }

  async bulkUpsertRateSlabs(
    productId: string,
    slabs: Array<{ minQuantity: number; maxQuantity?: number | null; rateAmount: number }>,
  ) {
    await (this.prisma as any).productRateSlab.deleteMany({ where: { productId } });
    return Promise.all(
      slabs.map((s) =>
        (this.prisma as any).productRateSlab.create({
          data: {
            productId,
            minQuantity: s.minQuantity,
            maxQuantity: s.maxQuantity ?? null,
            rateAmount: s.rateAmount,
          },
        }),
      ),
    );
  }

  async getSalesAgents() {
    return this.prisma.user.findMany({
      where: { isActive: true, role: 'SALES_AGENT' as any },
      orderBy: { fullName: 'asc' },
      select: { id: true, fullName: true, email: true, salesAgentCategory: true } as any,
    });
  }

  async updateSalesAgentCategory(userId: string, category: 'A' | 'B' | 'C' | 'D' | null) {
    return (this.prisma.user as any).update({
      where: { id: userId },
      data: { salesAgentCategory: category },
      select: { id: true, fullName: true, salesAgentCategory: true },
    });
  }

  async getAgentMonthCommission(userId: string) {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to   = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const orders = await (this.prisma as any).order.findMany({
      where: {
        salesAgentId: userId,
        status: { notIn: ['CANCELLED', 'REJECTED'] as any },
        orderDate: { gte: from, lt: to },
      },
      include: {
        salesAgent: { select: { id: true, fullName: true, salesAgentCategory: true } },
        items: {
          include: {
            product: {
              select: { id: true, name: true, category: { select: { name: true } } },
            },
          },
        },
      },
    });

    const productIds = Array.from(
      new Set(orders.flatMap((o: any) => o.items.map((i: any) => i.productId))),
    ) as string[];

    const [costSlabs, rateSlabs] = await Promise.all([
      this.prisma.productCostSlab.findMany({ where: { productId: { in: productIds } } }),
      (this.prisma as any).productRateSlab?.findMany
        ? (this.prisma as any).productRateSlab.findMany({ where: { productId: { in: productIds } } })
        : [],
    ]);

    const costMap = costSlabs.reduce((m: Map<string, any[]>, s: any) => {
      const arr = m.get(s.productId) ?? [];
      arr.push(s);
      m.set(s.productId, arr);
      return m;
    }, new Map<string, any[]>());

    const rateMap = (rateSlabs as any[]).reduce((m: Map<string, any[]>, s: any) => {
      const arr = m.get(s.productId) ?? [];
      arr.push(s);
      m.set(s.productId, arr);
      return m;
    }, new Map<string, any[]>());

    const matchSlab = (slabs: any[], qty: number) =>
      slabs
        .filter((s) => s.minQuantity <= qty && (s.maxQuantity == null || s.maxQuantity >= qty))
        .sort((a: any, b: any) => b.minQuantity - a.minQuantity)[0] ?? null;

    const isSticker = (item: any) =>
      `${item.product?.name ?? ''} ${item.product?.category?.name ?? ''}`.toLowerCase().includes('sticker');

    let commissionTotal = 0;
    let saleTotal = 0;
    const orderBreakdown: any[] = [];

    for (const order of orders) {
      const category: string = order.salesAgent?.salesAgentCategory ?? 'B';
      let orderCommission = 0;
      let hasAll = true;

      for (const item of order.items) {
        const costSlab = matchSlab(costMap.get(item.productId) ?? [], item.quantity);
        if (!costSlab) { hasAll = false; break; }

        const lineTotal   = Number(item.lineTotal);
        const unitPrice   = Number(item.unitPrice);
        const rawCost     = Number(costSlab.unitPrice);
        const costPerUnit = rawCost > unitPrice ? rawCost / costSlab.minQuantity : rawCost;
        const costItemTotal = costPerUnit * item.quantity;
        const profit      = lineTotal - costItemTotal;
        if (profit <= 0) continue;

        const rateSlab    = matchSlab(rateMap.get(item.productId) ?? [], item.quantity);
        const rateTotal   = rateSlab ? Number(rateSlab.rateAmount) : lineTotal;
        const discountPct = rateTotal > 0 ? Math.max(0, ((rateTotal - lineTotal) / rateTotal) * 100) : 0;

        if (category === 'D') {
          orderCommission += Math.max(0, lineTotal - rateTotal);
        } else if (discountPct > 5) {
          orderCommission += profit / (category === 'C' ? 3.75 : 4);
        } else if (category === 'A') {
          orderCommission += rateTotal * (isSticker(item) ? 0.15 : 0.10);
        } else if (category === 'C') {
          orderCommission += rateTotal * (isSticker(item) ? 0.17 : 0.12);
        } else {
          orderCommission += rateTotal * 0.10;
        }
      }

      if (hasAll) {
        commissionTotal += orderCommission;
        saleTotal += Number(order.grandTotal);
        orderBreakdown.push({
          orderId: order.id,
          orderNo: order.orderNumber,
          orderDate: order.orderDate,
          grandTotal: Number(order.grandTotal),
          commission: Number(orderCommission.toFixed(2)),
        });
      }
    }

    return {
      userId,
      month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      commissionTotal: Number(commissionTotal.toFixed(2)),
      commissionPctOfSale: saleTotal > 0 ? Number(((commissionTotal / saleTotal) * 100).toFixed(2)) : null,
      orderCount: orderBreakdown.length,
      orders: orderBreakdown,
    };
  }

 
  // ── Commission bonus calculation ──────────────────────────────────────────
  private calcBonus(saleTotal: number): number {
    if (saleTotal < 115000) return 0;
    if (saleTotal < 200000) return 1000;
    return Math.floor(saleTotal / 100000) * 1000;
  }

  // ── Per-item commission % helper ─────────────────────────────────────────
  private commissionPctForLine(
    category: string,
    lineTotal: number,
    rateTotal: number,
    costTotal: number,
    isSticker: boolean,
  ): number {
    if (lineTotal <= 0) return 0;
    const profit = lineTotal - costTotal;
    if (profit <= 0) return 0;
    const discountPct = rateTotal > 0 ? Math.max(0, ((rateTotal - lineTotal) / rateTotal) * 100) : 0;
    if (category === 'D') {
      const diff = Math.max(0, lineTotal - rateTotal);
      return Number(((diff / lineTotal) * 100).toFixed(2));
    }
    if (discountPct > 5) {
      const commAmt = profit / (category === 'C' ? 3.75 : 4);
      return Number(((commAmt / lineTotal) * 100).toFixed(2));
    }
    if (category === 'A') return isSticker ? 15 : 10;
    if (category === 'C') return isSticker ? 17 : 12;
    return 10;
  }

  // ── Detailed commission sheet for one agent, any month ───────────────────
  async getAgentCommissionSheet(userId: string, year: number, month: number) {
    const from = new Date(year, month - 1, 1);
    const to   = new Date(year, month, 1);

    const orders = await (this.prisma as any).order.findMany({
      where: {
        salesAgentId: userId,
        status: { notIn: ['CANCELLED', 'REJECTED'] as any },
        orderDate: { gte: from, lt: to },
      },
      orderBy: { orderDate: 'asc' },
      include: {
        salesAgent: { select: { id: true, fullName: true, salesAgentCategory: true } },
        customer: { select: { name: true } },
        items: {
          include: {
            product: {
              select: { id: true, name: true, category: { select: { name: true } } },
            },
          },
        },
      },
    });

    if (!orders.length) {
      return { userId, year, month, agentName: null, agentCategory: null, saleTotal: 0, commissionTotal: 0, commissionPct: 0, bonus: 0, totalPayable: 0, rows: [] };
    }

    const agentName: string = orders[0].salesAgent?.fullName ?? 'Unknown';
    const agentCategory: string = orders[0].salesAgent?.salesAgentCategory ?? 'B';

    const productIds = Array.from(new Set(orders.flatMap((o: any) => o.items.map((i: any) => i.productId)))) as string[];

    const [costSlabs, rateSlabs] = await Promise.all([
      this.prisma.productCostSlab.findMany({ where: { productId: { in: productIds } } }),
      (this.prisma as any).productRateSlab?.findMany
        ? (this.prisma as any).productRateSlab.findMany({ where: { productId: { in: productIds } } })
        : [],
    ]);

    const costMap = costSlabs.reduce((m: Map<string, any[]>, s: any) => {
      const arr = m.get(s.productId) ?? []; arr.push(s); m.set(s.productId, arr); return m;
    }, new Map<string, any[]>());

    const rateMap = (rateSlabs as any[]).reduce((m: Map<string, any[]>, s: any) => {
      const arr = m.get(s.productId) ?? []; arr.push(s); m.set(s.productId, arr); return m;
    }, new Map<string, any[]>());

    const matchSlab = (slabs: any[], qty: number) =>
      slabs.filter((s) => s.minQuantity <= qty && (s.maxQuantity == null || s.maxQuantity >= qty))
           .sort((a: any, b: any) => b.minQuantity - a.minQuantity)[0] ?? null;

    const isStickerItem = (item: any) =>
      `${item.product?.name ?? ''} ${item.product?.category?.name ?? ''}`.toLowerCase().includes('sticker');

    let saleTotal = 0;
    let commissionTotal = 0;
    const rows: any[] = [];

    for (const order of orders) {
      for (const item of order.items) {
        const costSlab = matchSlab(costMap.get(item.productId) ?? [], item.quantity);
        const lineTotal = Number(item.lineTotal);
        saleTotal += lineTotal;

        let costItemTotal = 0;
        if (costSlab) {
          const rawCost = Number(costSlab.unitPrice);
          const unitPrice = Number(item.unitPrice);
          const costPerUnit = rawCost > unitPrice ? rawCost / costSlab.minQuantity : rawCost;
          costItemTotal = costPerUnit * item.quantity;
        }

        const rateSlab = matchSlab(rateMap.get(item.productId) ?? [], item.quantity);
        const rateAmt  = rateSlab ? Number(rateSlab.rateAmount) : lineTotal;
        const sticker  = isStickerItem(item);
        const commPct  = this.commissionPctForLine(agentCategory, lineTotal, rateAmt, costItemTotal, sticker);
        let   commAmt  = 0;

        if (costSlab) {
          const profit = lineTotal - costItemTotal;
          if (profit > 0) {
            const discountPct = rateAmt > 0 ? Math.max(0, ((rateAmt - lineTotal) / rateAmt) * 100) : 0;
            if (agentCategory === 'D') commAmt = Math.max(0, lineTotal - rateAmt);
            else if (discountPct > 5) commAmt = profit / (agentCategory === 'C' ? 3.75 : 4);
            else if (agentCategory === 'A') commAmt = rateAmt * (sticker ? 0.15 : 0.10);
            else if (agentCategory === 'C') commAmt = rateAmt * (sticker ? 0.17 : 0.12);
            else commAmt = rateAmt * 0.10;
          }
        }

        commissionTotal += commAmt;
        rows.push({
          date: order.orderDate,
          invoiceNo: order.orderNumber ?? order.id,
          partyName: order.customer?.name ?? 'Unknown',
          itemName: item.product?.name ?? item.description ?? '',
          description: item.product?.category?.name ?? '',
          transactionType: 'Sale',
          quantity: item.quantity,
          amount: Number(lineTotal.toFixed(2)),
          commissionPct: commPct,
          commissionAmt: Number(commAmt.toFixed(2)),
          hasCost: !!costSlab,
        });
      }
    }

    const bonus = this.calcBonus(saleTotal);
    return {
      userId, year, month, agentName, agentCategory,
      saleTotal: Number(saleTotal.toFixed(2)),
      commissionTotal: Number(commissionTotal.toFixed(2)),
      commissionPct: saleTotal > 0 ? Number(((commissionTotal / saleTotal) * 100).toFixed(2)) : 0,
      bonus,
      totalPayable: Number((commissionTotal + bonus).toFixed(2)),
      rows,
    };
  }

  // ── All agents summary for a given month ─────────────────────────────────
  async getAllAgentsCommissionSummary(year: number, month: number) {
    const from = new Date(year, month - 1, 1);
    const to   = new Date(year, month, 1);

    const agents = await (this.prisma as any).user.findMany({
      where: { salesAgentCategory: { not: null } },
      select: { id: true, fullName: true, salesAgentCategory: true },
    });

    const orderTotals = await (this.prisma as any).order.findMany({
      where: {
        salesAgentId: { in: agents.map((a: any) => a.id) },
        status: { notIn: ['CANCELLED', 'REJECTED'] as any },
        orderDate: { gte: from, lt: to },
      },
      select: { salesAgentId: true, grandTotal: true },
    });

    const agentSaleMap = new Map<string, number>();
    for (const row of orderTotals) {
      agentSaleMap.set(row.salesAgentId, (agentSaleMap.get(row.salesAgentId) ?? 0) + Number(row.grandTotal));
    }

    const allOrders = await (this.prisma as any).order.findMany({
      where: { status: { notIn: ['CANCELLED', 'REJECTED'] as any }, salesAgentId: { not: null } },
      select: { salesAgentId: true, orderDate: true },
      orderBy: { orderDate: 'asc' },
    });

    const agentMonthSet = new Map<string, Set<string>>();
    for (const o of allOrders) {
      if (!o.salesAgentId) continue;
      const d = new Date(o.orderDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!agentMonthSet.has(o.salesAgentId)) agentMonthSet.set(o.salesAgentId, new Set());
      agentMonthSet.get(o.salesAgentId)!.add(key);
    }

    const availableMonths = Array.from(
      new Set(Array.from(agentMonthSet.values()).flatMap(s => Array.from(s)))
    ).sort().reverse();

    return {
      year, month,
      availableMonths,
      agents: agents
        .map((a: any) => {
          const monthsWithData = Array.from(agentMonthSet.get(a.id) ?? []).sort().reverse();
          if (!monthsWithData.length) return null;
          const sale = agentSaleMap.get(a.id) ?? 0;
          return { id: a.id, name: a.fullName, category: a.salesAgentCategory, saleTotal: Number(sale.toFixed(2)), bonus: this.calcBonus(sale), monthsWithData };
        })
        .filter(Boolean),
    };
  }
}
