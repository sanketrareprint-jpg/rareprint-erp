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
        OR: [
          { maxQuantity: null },
          { maxQuantity: { gte: dto.quantity } },
        ],
        effectiveFrom: { lte: new Date() },
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gte: new Date() } },
        ] as any,
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
}
