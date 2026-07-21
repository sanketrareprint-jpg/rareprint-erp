import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

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

  // Category A/B/C each have a fixed maximum commission rate (of the sale
  // amount). Category D is "above-rate margin" by design and has no cap.
  private categoryCommissionCapPct(category: string | null, isSticker: boolean): number | null {
    if (category === 'A') return isSticker ? 15 : 10;
    if (category === 'B') return 10;
    if (category === 'C') return isSticker ? 17 : 12;
    return null;
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
      // Discount ate into the margin, so pay commission off actual profit
      // instead of a flat % of sale — but never more than the category's
      // normal max rate would have paid on an un-discounted sale.
      const commAmt = profit / (agentCategory === 'C' ? 3.75 : 4);
      const cap = this.categoryCommissionCapPct(agentCategory, this.isSticker(item));
      return cap != null ? Math.min(commAmt, saleTotal * (cap / 100)) : commAmt;
    }

    if (agentCategory === 'A') {
      return saleTotal * (this.isSticker(item) ? 0.15 : 0.10);
    }
    if (agentCategory === 'C') {
      return saleTotal * (this.isSticker(item) ? 0.17 : 0.12);
    }
    return saleTotal * 0.10;
  }

  private async profitRows(start: Date, end: Date) {
    const orders = await this.prisma.order.findMany({
      where: { orderDate: { gte: start, lt: end }, status: { not: 'CANCELLED' as any }, isSample: false },
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

  // ── Gross profit summed across a date range (used by admin-only dashboard
  // profit KPIs). Reuses profitRows(), so it's the same "not CANCELLED, not
  // isSample, sum grossProfit skipping orders with a missing cost slab"
  // definition already used for the monthly profit summary.
  async getGrossProfitForRange(start: Date, end: Date): Promise<number> {
    const rows = await this.profitRows(start, end);
    return rows.reduce((sum, row) => sum + (row.grossProfit ?? 0), 0);
  }

  // ── Gross + net (after sales commission) profit summed across a date range
  // (used by admin-only dashboard profit KPIs). "gross" = sale - material cost;
  // "net" = gross - commission paid to the sales agent on that order.
  async getProfitBreakdownForRange(start: Date, end: Date): Promise<{ gross: number; net: number }> {
    const rows = await this.profitRows(start, end);
    return {
      gross: rows.reduce((sum, row) => sum + (row.grossProfit ?? 0), 0),
      net: rows.reduce((sum, row) => sum + (row.netGrossProfit ?? 0), 0),
    };
  }

  // ── Single-order gross profit (used by loyalty points earn calc) ──────────
  // Same cost-lookup approach as profitRows() above: sum lineCostTotal() per
  // item, and if ANY item is missing a cost slab, grossProfit comes back null
  // rather than silently under-costing the order.
  async computeOrderGrossProfit(orderId: string): Promise<{
    costTotal: number | null;
    grossProfit: number | null;
    hasMissingCost: boolean;
  }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: { product: { include: { costSlabs: true } } as any },
        },
      },
    });
    if (!order) return { costTotal: null, grossProfit: null, hasMissingCost: true };

    const saleTotal = Number(order.grandTotal);
    let costTotal = 0;
    let hasMissingCost = false;
    for (const item of order.items as any[]) {
      const lineCost = this.lineCostTotal(item);
      if (lineCost == null) {
        hasMissingCost = true;
        continue;
      }
      costTotal += lineCost;
    }

    if (hasMissingCost) return { costTotal: null, grossProfit: null, hasMissingCost: true };
    return {
      costTotal: Number(costTotal.toFixed(2)),
      grossProfit: Number((saleTotal - costTotal).toFixed(2)),
      hasMissingCost: false,
    };
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
        rateSlabs: {
          orderBy: { minQuantity: 'asc' },
          select: {
            id: true,
            minQuantity: true,
            maxQuantity: true,
            rateAmount: true,
          },
        } as any,
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
    replaceAll = false,
  ) {
    if (replaceAll) {
      // CSV import: wipe all existing rate slabs and recreate
      await (this.prisma as any).productRateSlab.deleteMany({ where: { productId } });
    } else {
      // Single-slab edit/add. Remove slabs for the exact minQuantities being
      // upserted, plus any *older* slab whose range overlaps the incoming
      // one — otherwise an old open-ended slab (e.g. "50,000+") silently
      // keeps overlapping a newer, narrower one (e.g. "100,000+"), and the
      // Cost Table can end up showing the stale rate for the new tier.
      const existing = await (this.prisma as any).productRateSlab.findMany({ where: { productId } });

      const toDeleteIds: string[] = [];
      const toTruncate: Array<{ id: string; maxQuantity: number }> = [];
      for (const e of existing as Array<{ id: string; minQuantity: number; maxQuantity: number | null }>) {
        for (const s of slabs) {
          const newMax = s.maxQuantity ?? null;
          const overlaps = e.minQuantity <= (newMax ?? Infinity) && s.minQuantity <= (e.maxQuantity ?? Infinity);
          if (!overlaps) continue;
          if (e.minQuantity >= s.minQuantity) {
            // Existing slab starts at or after the new one — fully superseded.
            toDeleteIds.push(e.id);
          } else {
            // Existing slab starts before the new one but overlaps into it —
            // shrink it so it stops just before the new slab begins.
            toTruncate.push({ id: e.id, maxQuantity: s.minQuantity - 1 });
          }
          break;
        }
      }

      if (toDeleteIds.length) {
        await (this.prisma as any).productRateSlab.deleteMany({ where: { id: { in: toDeleteIds } } });
      }
      for (const t of toTruncate) {
        await (this.prisma as any).productRateSlab.update({ where: { id: t.id }, data: { maxQuantity: t.maxQuantity } });
      }
    }
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
    // Return every user who has ever been a salesAgent on an order (any role)
    const agentOrders = await (this.prisma as any).order.findMany({
      where: { salesAgentId: { not: null } },
      select: { salesAgentId: true },
      distinct: ['salesAgentId'],
    });
    const ids = agentOrders.map((o: any) => o.salesAgentId).filter(Boolean) as string[];
    let agents: any[];
    try {
      agents = await (this.prisma as any).user.findMany({
        where: { id: { in: ids }, isActive: true },
        orderBy: { fullName: 'asc' },
        select: { id: true, fullName: true, email: true, salesAgentCategory: true, baseSalary: true },
      });
    } catch {
      // baseSalary column may not have been migrated onto the DB yet — degrade gracefully
      agents = await (this.prisma as any).user.findMany({
        where: { id: { in: ids }, isActive: true },
        orderBy: { fullName: 'asc' },
        select: { id: true, fullName: true, email: true, salesAgentCategory: true },
      });
    }
    return agents.map((a: any) => ({ ...a, baseSalary: a.baseSalary != null ? Number(a.baseSalary) : null }));
  }

  // Any single user's salary info — used by the self-service Salary & Commission
  // tab, which any user (not just past sales agents) should be able to see.
  async getUserSalaryInfo(userId: string) {
    let u: any;
    try {
      u = await (this.prisma as any).user.findUnique({
        where: { id: userId },
        select: { id: true, fullName: true, role: true, salesAgentCategory: true, baseSalary: true },
      });
    } catch {
      u = await (this.prisma as any).user.findUnique({
        where: { id: userId },
        select: { id: true, fullName: true, role: true, salesAgentCategory: true },
      });
    }
    if (!u) throw new NotFoundException('User not found');
    return { ...u, baseSalary: u.baseSalary != null ? Number(u.baseSalary) : 0 };
  }

  async updateSalesAgentSalary(userId: string, baseSalary: number | null) {
    const user = await (this.prisma.user as any).update({
      where: { id: userId },
      data: { baseSalary },
      select: { id: true, fullName: true, baseSalary: true },
    });
    return { ...user, baseSalary: user.baseSalary != null ? Number(user.baseSalary) : null };
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
        status: { not: 'CANCELLED' as any },
        orderDate: { gte: from, lt: to },
        isSample: false,
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

    const category: string | null = orders[0]?.salesAgent?.salesAgentCategory ?? null;

    // Pass 1: saleTotal for threshold check
    let saleTotal = 0;
    for (const order of orders) {
      for (const item of order.items) {
        saleTotal += Number(item.lineTotal);
      }
    }
    const belowThreshold = saleTotal < 115000;

    let commissionTotal = 0;
    saleTotal = 0;
    const orderBreakdown: any[] = [];

    for (const order of orders) {
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

        if (!category) {
          // no commission for uncategorized agents
        } else if (belowThreshold && category === 'A') {
          orderCommission += lineTotal * 0.07;
        } else if (belowThreshold && category === 'B') {
          orderCommission += lineTotal * 0.05;
        } else if (category === 'D') {
          orderCommission += Math.max(0, lineTotal - rateTotal);
        } else if (discountPct > 5) {
          const commAmt = profit / (category === 'C' ? 3.75 : 4);
          const cap = this.categoryCommissionCapPct(category, isSticker(item));
          orderCommission += cap != null ? Math.min(commAmt, lineTotal * (cap / 100)) : commAmt;
        } else if (category === 'A') {
          orderCommission += lineTotal * (isSticker(item) ? 0.15 : 0.10);
        } else if (category === 'C') {
          orderCommission += lineTotal * (isSticker(item) ? 0.17 : 0.12);
        } else {
          orderCommission += lineTotal * 0.10;
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
    category: string | null,
    lineTotal: number,
    rateTotal: number,
    costTotal: number,
    isSticker: boolean,
    belowThreshold = false,
  ): number {
    if (!category || lineTotal <= 0) return 0;
    const profit = lineTotal - costTotal;
    if (profit <= 0) return 0;
    const discountPct = rateTotal > 0 ? Math.max(0, ((rateTotal - lineTotal) / rateTotal) * 100) : 0;
    if (category === 'D') {
      const diff = Math.max(0, lineTotal - rateTotal);
      return Number(((diff / lineTotal) * 100).toFixed(2));
    }
    // Below ₹1.15L monthly threshold: reduced cap (7% A / 5% B) instead of
    // the normal 10-17% cap — but still profit÷4-based whenever there's a
    // real discount. Flat rate only applies rate-to-rate (no discount).
    if (belowThreshold && (category === 'A' || category === 'B')) {
      const cap = category === 'A' ? 7 : 5;
      if (discountPct > 5) {
        const commAmt = profit / 4;
        const pct = (commAmt / lineTotal) * 100;
        return Number(Math.min(pct, cap).toFixed(2));
      }
      return cap;
    }
    if (discountPct > 5) {
      const commAmt = profit / (category === 'C' ? 3.75 : 4);
      let pct = (commAmt / lineTotal) * 100;
      const cap = this.categoryCommissionCapPct(category, isSticker);
      if (cap != null) pct = Math.min(pct, cap);
      return Number(pct.toFixed(2));
    }
    if (category === 'A') return isSticker ? 15 : 10;
    if (category === 'C') return isSticker ? 17 : 12;
    return 10;
  }

  // ── Detailed commission sheet for one agent, any month ───────────────────
  async getAgentCommissionSheet(userId: string, year: number, month: number) {
    const from = new Date(year, month - 1, 1);
    const to   = new Date(year, month, 1);

    const [orders, verification, agentUser] = await Promise.all([
      (this.prisma as any).order.findMany({
        where: {
          salesAgentId: userId,
          status: { not: 'CANCELLED' as any },
          orderDate: { gte: from, lt: to },
          isSample: false,
        },
        orderBy: { orderDate: 'asc' },
        include: {
          salesAgent: { select: { id: true, fullName: true, salesAgentCategory: true } },
          customer: { select: { businessName: true } },
          shipments: { select: { carrierName: true, trackingNumber: true, status: true }, orderBy: { createdAt: 'desc' as any }, take: 1 },
          payments: { select: { amount: true, verificationStatus: true } },
          items: {
            include: {
              product: { select: { id: true, name: true, gsm: true, sizeInches: true, printingType: true, sides: true, category: { select: { name: true } } } },
            },
          },
        },
      }),
      (this.prisma as any).commissionVerification?.findUnique?.({
        where: { agentId_year_month: { agentId: userId, year, month } },
        include: {
          verifiedBy: { select: { fullName: true } },
          bankTransactions: { select: { id: true, description: true, amount: true, txnDate: true } },
        },
      }).catch(() => null),
      (this.prisma as any).user.findUnique({
        where: { id: userId },
        select: { fullName: true, salesAgentCategory: true, baseSalary: true },
      }).catch(() => null),
    ]);

    const baseSalary = agentUser?.baseSalary != null ? Number(agentUser.baseSalary) : 0;

    if (!orders.length) {
      return {
        userId, year, month,
        agentName: agentUser?.fullName ?? null,
        agentCategory: agentUser?.salesAgentCategory ?? null,
        saleTotal: 0, commissionTotal: 0, commissionPct: 0, bonus: 0, baseSalary,
        totalPayable: baseSalary, grandTotal: baseSalary, rows: [],
        verification: verification ? {
          id: verification.id,
          verifiedAt: verification.verifiedAt,
          verifiedBy: verification.verifiedBy?.fullName ?? 'Unknown',
          paid: (verification.bankTransactions?.length ?? 0) > 0,
          paidTransactions: (verification.bankTransactions ?? []).map((t: any) => ({
            id: t.id, description: t.description, amount: Number(t.amount), txnDate: t.txnDate,
          })),
        } : null,
      };
    }

    const agentName: string = orders[0].salesAgent?.fullName ?? 'Unknown';
    const agentCategory: string = orders[0].salesAgent?.salesAgentCategory ?? null;

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

    // Manual commission corrections (Accounts > Commission pencil icon).
    // Keyed by orderItemId so a correction survives sheet reloads, verify
    // toggles, and month switching — it previously lived only in the
    // browser's React state and vanished on every reload.
    const orderItemIds = orders.flatMap((o: any) => o.items.map((i: any) => i.id)) as string[];
    const overrides = orderItemIds.length
      ? await (this.prisma as any).commissionOverride.findMany({
          where: { orderItemId: { in: orderItemIds } },
          include: { setBy: { select: { fullName: true } } },
        }).catch(() => [])
      : [];
    const overrideMap = new Map<string, { amount: number; setByName: string; setAt: Date }>(
      (overrides as any[]).map((o: any) => [
        o.orderItemId,
        { amount: Number(o.amount), setByName: o.setBy?.fullName ?? 'Unknown', setAt: o.updatedAt },
      ]),
    );

    const matchSlab = (slabs: any[], qty: number) =>
      slabs.filter((s) => s.minQuantity <= qty && (s.maxQuantity == null || s.maxQuantity >= qty))
           .sort((a: any, b: any) => b.minQuantity - a.minQuantity)[0] ?? null;

    const isStickerItem = (item: any) =>
      `${item.product?.name ?? ''} ${item.product?.category?.name ?? ''}`.toLowerCase().includes('sticker');

    // ── Pass 1: compute saleTotal to determine threshold ─────────────────────
    const saleTotal = orders.reduce((sum: number, o: any) =>
      sum + o.items.reduce((s: number, it: any) => s + Number(it.lineTotal), 0), 0);

    // A/B reduced rate applies when monthly sales < ₹1,15,000
    const belowThreshold = saleTotal < 115000;

    let commissionTotal = 0;
    const rows: any[] = [];

    // ── Pass 2: compute commission per line ───────────────────────────────────
    for (const order of orders) {
      const shipment = order.shipments?.[0] ?? null;
      const courierName = shipment?.carrierName ?? null;
      const orderStatus = order.status;
      const paidAmount = (order.payments ?? [])
        .filter((p: any) => p.verificationStatus === 'VERIFIED')
        .reduce((s: number, p: any) => s + Number(p.amount), 0);
      const balanceDue = Math.max(0, Number(order.grandTotal) - paidAmount);

      for (const item of order.items) {
        const costSlab = matchSlab(costMap.get(item.productId) ?? [], item.quantity);
        const lineTotal = Number(item.lineTotal);

        let costItemTotal = 0;
        let grossProfit: number | null = null;
        let marginPct: number | null = null;

        if (costSlab) {
          const rawCost = Number(costSlab.unitPrice);
          const unitPrice = Number(item.unitPrice);
          const costPerUnit = rawCost > unitPrice ? rawCost / costSlab.minQuantity : rawCost;
          costItemTotal = costPerUnit * item.quantity;
          grossProfit = lineTotal - costItemTotal;
          marginPct = lineTotal > 0 ? Number(((grossProfit / lineTotal) * 100).toFixed(1)) : 0;
        }

        const rateSlab = matchSlab(rateMap.get(item.productId) ?? [], item.quantity);
        const rateAmt  = rateSlab ? Number(rateSlab.rateAmount) : lineTotal;
        const sticker  = isStickerItem(item);
        const commPct  = this.commissionPctForLine(agentCategory, lineTotal, rateAmt, costItemTotal, sticker, belowThreshold);
        let   commAmt  = 0;
        let   calcMethod = '';

        if (!agentCategory) {
          calcMethod = 'No category';
        } else if (belowThreshold && (agentCategory === 'A' || agentCategory === 'B') && costSlab && grossProfit !== null && grossProfit > 0) {
          // Below ₹1.15L monthly threshold: reduced cap (7% A / 5% B), not a
          // flat rate — profit÷4 still applies whenever there's a real
          // discount, same rule as the normal branch below just with a
          // lower ceiling. Flat rate only when the sale is rate-to-rate.
          const pct = agentCategory === 'A' ? 7 : 5;
          const belowDiscountPct = rateAmt > 0 ? Math.max(0, ((rateAmt - lineTotal) / rateAmt) * 100) : 0;
          const capAmt = lineTotal * (pct / 100);
          if (belowDiscountPct > 5) {
            const profitShare = grossProfit / 4;
            if (profitShare > capAmt) {
              commAmt = capAmt;
              calcMethod = `Sale × ${pct}% (below ₹1.15L, capped — profit÷4 exceeded max, disc ${belowDiscountPct.toFixed(1)}%)`;
            } else {
              commAmt = profitShare;
              calcMethod = `Profit ÷ 4 (below ₹1.15L, disc ${belowDiscountPct.toFixed(1)}%)`;
            }
          } else {
            commAmt = capAmt;
            calcMethod = `Sale × ${pct}% (below ₹1.15L, rate-to-rate)`;
          }
        } else if (costSlab && grossProfit !== null && grossProfit > 0) {
          const discountPct = rateAmt > 0 ? Math.max(0, ((rateAmt - lineTotal) / rateAmt) * 100) : 0;
          if (agentCategory === 'D') {
            commAmt = Math.max(0, lineTotal - rateAmt);
            calcMethod = `Sale − Rate (₹${lineTotal.toFixed(0)} − ₹${rateAmt.toFixed(0)})`;
          } else if (discountPct > 5) {
            commAmt = grossProfit / (agentCategory === 'C' ? 3.75 : 4);
            const cap = this.categoryCommissionCapPct(agentCategory, sticker);
            const capAmt = cap != null ? lineTotal * (cap / 100) : null;
            if (capAmt != null && commAmt > capAmt) {
              commAmt = capAmt;
              calcMethod = `Sale × ${cap}% (capped — profit÷${agentCategory === 'C' ? '3.75' : '4'} exceeded max, disc ${discountPct.toFixed(1)}%)`;
            } else {
              calcMethod = `Profit ÷ ${agentCategory === 'C' ? '3.75' : '4'} (disc ${discountPct.toFixed(1)}%)`;
            }
          } else if (agentCategory === 'A') {
            commAmt = lineTotal * (sticker ? 0.15 : 0.10);
            calcMethod = `Sale × ${sticker ? '15' : '10'}% (${sticker ? 'sticker' : 'standard'})`;
          } else if (agentCategory === 'C') {
            commAmt = lineTotal * (sticker ? 0.17 : 0.12);
            calcMethod = `Sale × ${sticker ? '17' : '12'}% (${sticker ? 'sticker' : 'standard'})`;
          } else {
            commAmt = lineTotal * 0.10;
            calcMethod = `Sale × 10%`;
          }
        } else if (!costSlab) {
          calcMethod = 'No cost data';
        }

        const discountPct = rateSlab && rateAmt > 0
          ? Number(Math.max(0, ((rateAmt - lineTotal) / rateAmt) * 100).toFixed(1))
          : 0;
        const ratePerUnit = rateSlab ? Number(rateAmt.toFixed(2)) : null;

        const calculatedCommAmt = commAmt;
        const override = overrideMap.get(item.id);
        if (override) commAmt = override.amount;

        commissionTotal += commAmt;
        rows.push({
          orderItemId: item.id,
          orderId: order.id,
          date: order.orderDate,
          invoiceNo: order.orderNumber ?? order.id,
          partyName: order.customer?.businessName ?? 'Unknown',
          itemName: item.product?.name ?? '',
          category: item.product?.category?.name ?? '',
          gsm: item.product?.gsm ?? null,
          sizeInches: item.product?.sizeInches ?? null,
          printingType: item.product?.printingType ?? null,
          sides: item.product?.sides ?? null,
          transactionType: 'Sale',
          orderStatus,
          courierName,
          quantity: item.quantity,
          amount: Number(lineTotal.toFixed(2)),
          ratePerUnit,
          discountPct,
          cost: costSlab ? Number(costItemTotal.toFixed(2)) : null,
          grossProfit: grossProfit !== null ? Number(grossProfit.toFixed(2)) : null,
          marginPct,
          commissionPct: commPct,
          commissionAmt: Number(commAmt.toFixed(2)),
          calculatedCommissionAmt: Number(calculatedCommAmt.toFixed(2)),
          isOverridden: !!override,
          overriddenBy: override?.setByName ?? null,
          overriddenAt: override?.setAt ?? null,
          calcMethod,
          hasCost: !!costSlab,
          balanceDue: Number(balanceDue.toFixed(2)),
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
      baseSalary,
      // Kept for backward compatibility with the existing Accounts > Commission tab (commission + bonus only)
      totalPayable: Number((commissionTotal + bonus).toFixed(2)),
      // Used by the Salary & Commission view: commission + bonus + fixed base salary
      grandTotal: Number((commissionTotal + bonus + baseSalary).toFixed(2)),
      rows,
      verification: verification ? {
        id: verification.id,
        verifiedAt: verification.verifiedAt,
        verifiedBy: verification.verifiedBy?.fullName ?? 'Unknown',
        paid: (verification.bankTransactions?.length ?? 0) > 0,
        paidTransactions: (verification.bankTransactions ?? []).map((t: any) => ({
          id: t.id, description: t.description, amount: Number(t.amount), txnDate: t.txnDate,
        })),
      } : null,
    };
  }

  // The CommissionOverride table's migration (20260715000100) reports as
  // applied in `_prisma_migrations` on production but the table was never
  // actually created there — a boot-time script tried to self-heal this
  // separately and still didn't fix it, so this creates it lazily, in-band,
  // on the exact Prisma connection that's already proven to work (the one
  // serving this request), the first time we hit Prisma P2021 for it.
  private async ensureCommissionOverrideTable() {
    const prisma = this.prisma as any;
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "CommissionOverride" (
        "id"          TEXT NOT NULL,
        "orderItemId" TEXT NOT NULL,
        "agentId"     TEXT NOT NULL,
        "amount"      DECIMAL(14,2) NOT NULL,
        "setById"     TEXT NOT NULL,
        "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"   TIMESTAMP(3) NOT NULL,
        CONSTRAINT "CommissionOverride_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "CommissionOverride_orderItemId_key"
      ON "CommissionOverride"("orderItemId");
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "CommissionOverride"
        ADD CONSTRAINT "CommissionOverride_orderItemId_fkey"
        FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "CommissionOverride"
        ADD CONSTRAINT "CommissionOverride_agentId_fkey"
        FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "CommissionOverride"
        ADD CONSTRAINT "CommissionOverride_setById_fkey"
        FOREIGN KEY ("setById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);
  }

  // Manual correction to a single order line's commission. Persists so it
  // survives sheet reloads, verify/unverify, and month switching — see
  // migration 20260715000100_add_commission_override for context.
  async setCommissionOverride(agentId: string, orderItemId: string, amount: number, setById: string) {
    const doUpsert = () =>
      (this.prisma as any).commissionOverride.upsert({
        where: { orderItemId },
        create: { id: require('crypto').randomUUID(), orderItemId, agentId, amount, setById },
        update: { amount, setById, agentId },
      });

    try {
      return await doUpsert();
    } catch (error: any) {
      if (error?.code === 'P2021') {
        await this.ensureCommissionOverrideTable();
        return await doUpsert();
      }
      throw error;
    }
  }

  async clearCommissionOverride(orderItemId: string) {
    try {
      await (this.prisma as any).commissionOverride.delete({ where: { orderItemId } });
    } catch { /* not found — that's fine */ }
    return { success: true };
  }

  async verifyCommission(
    agentId: string,
    year: number,
    month: number,
    verifiedById: string,
    verifiedByName: string,
    verifiedByRole: string,
  ) {
    const result = await (this.prisma as any).commissionVerification.upsert({
      where: { agentId_year_month: { agentId, year, month } },
      create: { id: require('crypto').randomUUID(), agentId, year, month, verifiedById },
      update: { verifiedById, verifiedAt: new Date() },
    });

    // Notify the agent with the verified sheet's numbers. A failure here
    // (e.g. notifications table hiccup) shouldn't block the verification itself.
    try {
      const sheet = await this.getAgentCommissionSheet(agentId, year, month);
      const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      await this.notifications.notifyCommissionVerified({
        agentId,
        agentName: sheet.agentName ?? 'Agent',
        verifiedByName,
        verifiedByRole,
        monthLabel,
        totalSales: sheet.saleTotal,
        totalCommission: sheet.commissionTotal,
        incentive: sheet.bonus,
        baseSalary: sheet.baseSalary,
        overallAmount: sheet.grandTotal,
      });
    } catch { /* ignore notification failures */ }

    return result;
  }

  async unverifyCommission(agentId: string, year: number, month: number) {
    try {
      await (this.prisma as any).commissionVerification.delete({
        where: { agentId_year_month: { agentId, year, month } },
      });
    } catch { /* not found — that's fine */ }
    return { success: true };
  }

  // ── Mark commission as paid, linked to a bank statement transaction ──────
  // Mirrors how receipts get matched to BankTransaction (see BankStatementService
  // .reconcileTransaction / Accounts > Receipts "Match with Bank Statement"):
  // the FK lives on BankTransaction (matchedCommissionVerificationId), this
  // sheet's "paid" state is just derived from whether any transaction points here.
  async markCommissionPaid(agentId: string, year: number, month: number, transactionId: string, reconciledById: string) {
    const verification = await (this.prisma as any).commissionVerification.findUnique({
      where: { agentId_year_month: { agentId, year, month } },
    });
    if (!verification) {
      throw new BadRequestException('Verify this month\'s commission before marking it paid.');
    }
    const txn = await (this.prisma as any).bankTransaction.findUnique({ where: { id: transactionId } });
    if (!txn) throw new NotFoundException('Bank transaction not found');

    await (this.prisma as any).bankTransaction.update({
      where: { id: transactionId },
      data: {
        reconcileStatus: 'MATCHED_COMMISSION',
        matchedCommissionVerificationId: verification.id,
        matchedPaymentId: null,
        matchedVendorId: null,
        expenseCategoryId: null,
        reviewNote: `Commission payout — agent ${agentId}, ${month}/${year}`,
        reconciledById,
        reconciledAt: new Date(),
      },
    });
    return { success: true };
  }

  async unmarkCommissionPaid(agentId: string, year: number, month: number) {
    const verification = await (this.prisma as any).commissionVerification.findUnique({
      where: { agentId_year_month: { agentId, year, month } },
    });
    if (!verification) return { success: true };

    await (this.prisma as any).bankTransaction.updateMany({
      where: { matchedCommissionVerificationId: verification.id },
      data: {
        reconcileStatus: 'UNMATCHED',
        matchedCommissionVerificationId: null,
        reviewNote: null,
        reconciledById: null,
        reconciledAt: null,
      },
    });
    return { success: true };
  }

  // ── All verified sheets for one agent (self-service Salary & Commission view) ──
  async getVerifiedCommissionSheets(userId: string) {
    const verifications = await (this.prisma as any).commissionVerification.findMany({
      where: { agentId: userId },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
    return Promise.all(
      verifications.map((v: any) => this.getAgentCommissionSheet(userId, v.year, v.month)),
    );
  }

  // ── All agents summary for a given month ─────────────────────────────────
  async getAllAgentsCommissionSummary(year: number, month: number) {
    const from = new Date(year, month - 1, 1);
    const to   = new Date(year, month, 1);

    // Start from orders (same approach as profitability) — avoids user-ID mismatch
    const allOrders = await (this.prisma as any).order.findMany({
      where: {
        status: { not: 'CANCELLED' as any },
        salesAgentId: { not: null },
        isSample: false,
      },
      select: {
        salesAgentId: true,
        grandTotal: true,
        orderDate: true,
        salesAgent: { select: { id: true, fullName: true, salesAgentCategory: true } as any },
      },
      orderBy: { orderDate: 'asc' },
    });

    // Build per-agent aggregates directly from order data
    const agentMap = new Map<string, {
      id: string; name: string; category: string | null;
      monthSet: Set<string>; selectedMonthSale: number;
    }>();

    for (const o of allOrders) {
      if (!o.salesAgentId || !o.salesAgent) continue;
      const d = new Date(o.orderDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

      if (!agentMap.has(o.salesAgentId)) {
        agentMap.set(o.salesAgentId, {
          id: o.salesAgentId,
          name: o.salesAgent.fullName,
          category: o.salesAgent.salesAgentCategory,
          monthSet: new Set(),
          selectedMonthSale: 0,
        });
      }
      const entry = agentMap.get(o.salesAgentId)!;
      entry.monthSet.add(key);
      if (d >= from && d < to) {
        entry.selectedMonthSale += Number(o.grandTotal);
      }
    }

    const availableMonths = Array.from(
      new Set(Array.from(agentMap.values()).flatMap(a => Array.from(a.monthSet)))
    ).sort().reverse();

    // Pull verification records for these agents so month buttons in the UI
    // can show a "✓ verified" badge without a per-agent round trip.
    const agentIds = Array.from(agentMap.keys());
    const verifications = agentIds.length
      ? await (this.prisma as any).commissionVerification.findMany({
          where: { agentId: { in: agentIds } },
          select: { agentId: true, year: true, month: true, bankTransactions: { select: { id: true } } },
        })
      : [];
    const verifiedSet = new Set(
      verifications.map((v: any) => `${v.agentId}_${v.year}-${String(v.month).padStart(2, '0')}`),
    );
    // A month is "paid" once at least one bank transaction is linked to its
    // CommissionVerification (see markCommissionPaid).
    const paidSet = new Set(
      verifications
        .filter((v: any) => (v.bankTransactions?.length ?? 0) > 0)
        .map((v: any) => `${v.agentId}_${v.year}-${String(v.month).padStart(2, '0')}`),
    );

    return {
      year, month,
      availableMonths,
      agents: Array.from(agentMap.values()).map(a => ({
        id: a.id,
        name: a.name,
        category: a.category,
        saleTotal: Number(a.selectedMonthSale.toFixed(2)),
        bonus: this.calcBonus(a.selectedMonthSale),
        monthsWithData: Array.from(a.monthSet).sort().reverse(),
        verifiedMonths: Array.from(a.monthSet)
          .filter(m => verifiedSet.has(`${a.id}_${m}`))
          .sort().reverse(),
        paidMonths: Array.from(a.monthSet)
          .filter(m => paidSet.has(`${a.id}_${m}`))
          .sort().reverse(),
      })),
    };
  }
}
