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
    // Fetch ALL orders (any status) that have at least one item
    // whose product has NO cost slabs at all
    const orders = await (this.prisma as any).order.findMany({
      where: {
        items: {
          some: {
            product: { costSlabs: { none: {} } },
          },
        },
      },
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
                costSlabs: { select: { id: true } },
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
        .filter((item: any) => item.product.costSlabs.length === 0)
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
    return this.prisma.user.update({
      where: { id: userId },
      data: { salesAgentCategory: category } as any,
      select: { id: true, fullName: true, email: true, salesAgentCategory: true } as any,
    });
  }

  async getAgentMonthCommission(userId: string) {
    const { start, end } = this.getMonthRange();
    const rows = (await this.profitRows(start, end)).filter((row) => row.salesAgentId === userId && !row.hasMissingCost);
    return {
      month: start.toISOString().slice(0, 7),
      commissionTotal: Number(rows.reduce((sum, row) => sum + Number(row.commissionTotal ?? 0), 0).toFixed(2)),
      grossProfit: Number(rows.reduce((sum, row) => sum + Number(row.grossProfit ?? 0), 0).toFixed(2)),
      netGrossProfit: Number(rows.reduce((sum, row) => sum + Number(row.netGrossProfit ?? 0), 0).toFixed(2)),
      orderCount: rows.length,
    };
  }
}
                                                                                             