// backend/src/production/clubbing-sheet.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { JobWorkStatus, OrderStatus, SheetQuality, SheetStatus, SheetProductionStage, ProductSides, PrintingType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaperInventoryService } from '../paper-inventory/paper-inventory.service';

function summarizeDesignFiles(value: unknown) {
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

// Resolve size / gsm / sides for a production item, preferring values
// embedded in productionNotes and falling back to the product's own fields.
function resolveItemDetails(item: {
  productionNotes?: string | null;
  product: { sizeInches?: string | null; gsm?: number | null; sides?: string | null };
}) {
  const notes = item.productionNotes ?? '';
  // Stop at commas/newlines so "GSM: 70, Sides: DOUBLE_SIDE" doesn't
  // capture "70," with a trailing comma.
  let size = notes.match(/Size[\s:]+([^\n,]+)/i)?.[1]?.trim() ?? null;
  let gsm = notes.match(/GSM[\s:]+([^,\n\s]+)/i)?.[1]?.trim() ?? null;
  let sidesRaw = notes.match(/Sides[\s:]+([^,\n\s]+)/i)?.[1]?.trim() ?? null;

  if (!size && item.product.sizeInches) size = item.product.sizeInches;
  if (!gsm && item.product.gsm != null) gsm = String(item.product.gsm);
  if (!sidesRaw && item.product.sides) sidesRaw = item.product.sides;

  const sides =
    sidesRaw === 'SINGLE_SIDE' ? 'Single'
    : sidesRaw === 'DOUBLE_SIDE' ? 'Double'
    : (sidesRaw ?? null);

  return { size, gsm, sides };
}

function parseIstDateOnly(value?: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00+05:30`);
  if (Number.isNaN(date.getTime())) throw new BadRequestException('Invalid follow-up date');
  return date;
}

type AutoSlot = 'SMALL_5_5X8_5' | 'MEDIUM_7_3X8_5' | 'LARGE_8_5X11' | 'FILE_9X12' | 'FILE_12X18' | 'BIG_ENV_9X12';
type AutoFamily = 'STANDARD_18X23' | 'FILE_19X25' | 'BIG_ENV_15X20';
type AutoItem = {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  productSku: string;
  categoryName: string;
  quantity: number;
  effectiveQuantity: number;
  assignedQuantity: number;
  balanceQuantity: number;
  gsm: number;
  sides: ProductSides;
  printingType: PrintingType;
  slot: AutoSlot;
  family: AutoFamily;
  slotArea: number;
};
type AutoPattern = {
  name: string;
  family: AutoFamily;
  sheetSize: string;
  quality: SheetQuality;
  slots: Partial<Record<AutoSlot, number>>;
};

const STANDARD_PATTERNS: AutoPattern[] = [
  { name: 'A', family: 'STANDARD_18X23', sheetSize: '18x23', quality: SheetQuality.MAPLITHO, slots: { MEDIUM_7_3X8_5: 3, LARGE_8_5X11: 1, SMALL_5_5X8_5: 2 } },
  { name: 'B', family: 'STANDARD_18X23', sheetSize: '18x23', quality: SheetQuality.MAPLITHO, slots: { LARGE_8_5X11: 4 } },
  { name: 'C', family: 'STANDARD_18X23', sheetSize: '18x23', quality: SheetQuality.MAPLITHO, slots: { SMALL_5_5X8_5: 8 } },
  { name: 'D', family: 'STANDARD_18X23', sheetSize: '18x23', quality: SheetQuality.MAPLITHO, slots: { MEDIUM_7_3X8_5: 6 } },
  { name: 'E', family: 'STANDARD_18X23', sheetSize: '18x23', quality: SheetQuality.MAPLITHO, slots: { MEDIUM_7_3X8_5: 3, SMALL_5_5X8_5: 4 } },
  { name: 'F', family: 'STANDARD_18X23', sheetSize: '18x23', quality: SheetQuality.MAPLITHO, slots: { MEDIUM_7_3X8_5: 3, LARGE_8_5X11: 2 } },
];
const AUTO_PATTERNS: AutoPattern[] = [
  ...STANDARD_PATTERNS,
  { name: 'SMALL_FILE', family: 'FILE_19X25', sheetSize: '19x25', quality: SheetQuality.ART_CARD, slots: { FILE_9X12: 4 } },
  { name: 'FILE', family: 'FILE_19X25', sheetSize: '19x25', quality: SheetQuality.ART_CARD, slots: { FILE_12X18: 2 } },
  { name: 'BIG_ENV', family: 'BIG_ENV_15X20', sheetSize: '15x20', quality: SheetQuality.MAPLITHO, slots: { BIG_ENV_9X12: 1 } },
];
const MIN_AUTO_SHEET_QUANTITY = 1000;
const MIN_AUTO_SHEET_QUANTITY_BY_GSM: Partial<Record<number, number>> = {
  70: 5000,
};
const AUTO_SHEET_SEQUENCE_START = 2001;
const SHEET_NEXT_STATUS: Partial<Record<SheetStatus, SheetStatus | null>> = {
  [SheetStatus.INCOMPLETE]: SheetStatus.COMPLETE,
  [SheetStatus.COMPLETE]: SheetStatus.SETTING,
  [SheetStatus.SETTING]: SheetStatus.PRINTING,
  [SheetStatus.PRINTING]: SheetStatus.PROCESSING,
  [SheetStatus.PROCESSING]: null,
};
const SLOT_AREA: Record<AutoSlot, number> = {
  SMALL_5_5X8_5: 5.5 * 8.5,
  MEDIUM_7_3X8_5: 7.3 * 8.5,
  LARGE_8_5X11: 8.5 * 11,
  FILE_9X12: 9 * 12,
  FILE_12X18: 12 * 18,
  BIG_ENV_9X12: 18.5 * 13.5,
};

function normalizeSize(value?: string | null) {
  const match = (value ?? '').toLowerCase().replace(/inch|inches|"/g, '').match(/(\d+(?:\.\d+)?)\s*[*x×]\s*(\d+(?:\.\d+)?)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2])].sort((a, b) => a - b) as [number, number];
}

function nearPair(size: [number, number] | null, a: number, b: number, tolerance = 0.35) {
  if (!size) return false;
  const target = [a, b].sort((x, y) => x - y);
  return Math.abs(size[0] - target[0]) <= tolerance && Math.abs(size[1] - target[1]) <= tolerance;
}

function classifyAutoItem(raw: {
  id: string;
  productId: string;
  quantity: number;
  productionNotes?: string | null;
  product: { name: string; sku: string; gsm: number; sizeInches: string; openSizeInches?: string | null; sides: ProductSides; printingType: PrintingType; category?: { name: string } | null };
  sheetItems: { quantityOnSheet: number }[];
}): AutoItem | null {
  const details = resolveItemDetails(raw);
  const productName = raw.product.name;
  const categoryName = raw.product.category?.name ?? '';
  const haystack = `${productName} ${categoryName} ${raw.product.sku}`.toLowerCase();
  const productSize = normalizeSize(details.size ?? raw.product.sizeInches);
  const openSize = normalizeSize(raw.product.openSizeInches);
  const assignedQuantity = raw.sheetItems.reduce((sum, item) => sum + item.quantityOnSheet, 0);

  let slot: AutoSlot | null = null;
  let family: AutoFamily | null = null;
  let effectiveQuantity = raw.quantity;

  if (nearPair(openSize, 9, 12)) {
    slot = 'FILE_9X12';
    family = 'FILE_19X25';
  } else if (nearPair(openSize, 12, 18)) {
    slot = 'FILE_12X18';
    family = 'FILE_19X25';
  } else if (nearPair(openSize, 18.5, 13.5)) {
    slot = 'BIG_ENV_9X12';
    family = 'BIG_ENV_15X20';
  } else if (nearPair(openSize, 8.5, 11)) {
    slot = 'LARGE_8_5X11';
    family = 'STANDARD_18X23';
  } else if (nearPair(openSize, 5.5, 8.5)) {
    slot = 'SMALL_5_5X8_5';
    family = 'STANDARD_18X23';
  } else if (nearPair(openSize, 7.3, 8.5)) {
    slot = 'MEDIUM_7_3X8_5';
    family = 'STANDARD_18X23';
  } else if (haystack.includes('file')) {
    slot = 'FILE_12X18';
    family = 'FILE_19X25';
  } else if (haystack.includes('letterpad')) {
    effectiveQuantity = raw.quantity * 100;
    if (nearPair(openSize, 5.5, 8.5) || nearPair(productSize, 5.5, 8.5)) slot = 'SMALL_5_5X8_5';
    else slot = 'LARGE_8_5X11';
    family = 'STANDARD_18X23';
  } else if (haystack.includes('letterhead') || haystack.includes('letter head')) {
    slot = nearPair(openSize, 5.5, 8.5) || nearPair(productSize, 5.5, 8.5) ? 'SMALL_5_5X8_5' : 'LARGE_8_5X11';
    family = 'STANDARD_18X23';
  } else if (haystack.includes('envelope')) {
    if (nearPair(productSize, 4, 5) || nearPair(openSize, 5.5, 8.5)) slot = 'SMALL_5_5X8_5';
    else if (nearPair(productSize, 4, 7) || nearPair(openSize, 7.3, 8.5)) slot = 'MEDIUM_7_3X8_5';
    else if (nearPair(productSize, 5.5, 8) || nearPair(productSize, 4, 9) || nearPair(productSize, 4.25, 9.25) || nearPair(openSize, 8.5, 11)) slot = 'LARGE_8_5X11';
    else if (nearPair(productSize, 9, 12) || nearPair(openSize, 18.5, 13.5)) slot = 'BIG_ENV_9X12';
    family = slot === 'BIG_ENV_9X12' ? 'BIG_ENV_15X20' : 'STANDARD_18X23';
  }

  if (!slot || !family) return null;
  const balanceQuantity = effectiveQuantity - assignedQuantity;
  if (balanceQuantity <= 0) return null;
  return {
    id: raw.id,
    orderId: (raw as any).orderId,
    productId: raw.productId,
    productName,
    productSku: raw.product.sku,
    categoryName,
    quantity: raw.quantity,
    effectiveQuantity,
    assignedQuantity,
    balanceQuantity,
    gsm: Number(details.gsm ?? raw.product.gsm),
    sides: raw.product.sides,
    printingType: raw.product.printingType,
    slot,
    family,
    slotArea: SLOT_AREA[slot],
  };
}

@Injectable()
export class ClubbingSheetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paperInventoryService: PaperInventoryService,
  ) {}

  private sheetItemInclude() {
    return {
      orderItem: {
        select: {
          id: true,
          itemProductionStage: true,
          product: { select: { name: true, sizeInches: true, gsm: true } },
          order: { select: { id: true, status: true, orderNumber: true, orderDate: true, customer: { select: { businessName: true } } } },
        },
      },
    } as const;
  }

  private getSheetArea(sizeInches: string) {
    const [w, h] = sizeInches.split('x').map(Number);
    return (w || 0) * (h || 0);
  }

  private getAutoSheetSequence(sheetNo: string) {
    return /^\d+$/.test(sheetNo) ? Number(sheetNo) : 0;
  }

  /** Returns next sheet number continuing the shared 13XX series across manual + auto sheets */
  private async nextSheetNo(tx?: Parameters<Parameters<typeof this.prisma.$transaction>[0]>[0]): Promise<string> {
    const db = (tx ?? this.prisma) as typeof this.prisma;
    const sheets = await db.printSheet.findMany({ select: { sheetNo: true } });
    const max = Math.max(1299, ...sheets.map(s => this.getAutoSheetSequence(s.sheetNo)));
    return String(max + 1);
  }

  private buildCandidateQuantities(items: AutoItem[], pattern: AutoPattern) {
    const candidates = new Set<number>();
    for (const item of items) {
      const capacity = pattern.slots[item.slot] ?? 0;
      const minSheetQuantity = MIN_AUTO_SHEET_QUANTITY_BY_GSM[item.gsm] ?? MIN_AUTO_SHEET_QUANTITY;
      for (let slots = 1; slots <= capacity; slots++) {
        const qty = Math.floor(item.balanceQuantity / slots);
        if (qty >= minSheetQuantity) candidates.add(qty);
      }
    }
    return [...candidates].sort((a, b) => b - a).slice(0, 60);
  }

  private planPattern(items: AutoItem[], pattern: AutoPattern, sheetQuantity: number) {
    const minSheetQuantity = Math.max(
      MIN_AUTO_SHEET_QUANTITY,
      ...items.map(item => MIN_AUTO_SHEET_QUANTITY_BY_GSM[item.gsm] ?? MIN_AUTO_SHEET_QUANTITY),
    );
    if (sheetQuantity < minSheetQuantity) return null;

    const remainingSlots: Partial<Record<AutoSlot, number>> = { ...pattern.slots };
    const remainingQty = new Map(items.map(item => [item.id, item.balanceQuantity]));
    const placements: { item: AutoItem; multiple: number; quantityOnSheet: number; areaSqInches: number }[] = [];
    const supportedSlots = Object.keys(pattern.slots) as AutoSlot[];

    for (const slot of supportedSlots) {
      let capacity = remainingSlots[slot] ?? 0;
      const slotItems = items
        .filter(item => item.slot === slot)
        .sort((a, b) => (remainingQty.get(b.id) ?? 0) - (remainingQty.get(a.id) ?? 0));

      while (capacity > 0) {
        const item = slotItems.find(candidate => (remainingQty.get(candidate.id) ?? 0) >= sheetQuantity);
        if (!item) break;
        const available = remainingQty.get(item.id) ?? 0;
        const multiple = Math.min(capacity, Math.floor(available / sheetQuantity));
        if (multiple <= 0) break;
        placements.push({
          item,
          multiple,
          quantityOnSheet: multiple * sheetQuantity,
          areaSqInches: item.slotArea * multiple,
        });
        remainingQty.set(item.id, available - multiple * sheetQuantity);
        capacity -= multiple;
      }
    }

    const totalSlots = supportedSlots.reduce((sum, slot) => sum + (pattern.slots[slot] ?? 0), 0);
    const usedSlots = placements.reduce((sum, placement) => sum + placement.multiple, 0);
    const mediumSlots = placements.filter(p => p.item.slot === 'MEDIUM_7_3X8_5').reduce((sum, p) => sum + p.multiple, 0);
    if (mediumSlots > 0 && mediumSlots < 3) return null;
    if (usedSlots === 0) return null;
    return {
      pattern,
      sheetQuantity,
      placements,
      totalSlots,
      usedSlots,
      assignedQuantity: placements.reduce((sum, placement) => sum + placement.quantityOnSheet, 0),
      isFull: usedSlots === totalSlots,
    };
  }

  private chooseBestPlan(items: AutoItem[]) {
    const family = items[0]?.family;
    const patterns = AUTO_PATTERNS.filter(pattern => pattern.family === family);
    let best: ReturnType<ClubbingSheetService['planPattern']> | null = null;
    for (const pattern of patterns) {
      const compatibleItems = items.filter(item => (pattern.slots[item.slot] ?? 0) > 0);
      if (compatibleItems.length === 0) continue;
      for (const quantity of this.buildCandidateQuantities(compatibleItems, pattern)) {
        const plan = this.planPattern(compatibleItems, pattern, quantity);
        if (!plan) continue;
        if (
          !best ||
          plan.isFull !== best.isFull && plan.isFull ||
          plan.usedSlots / plan.totalSlots > best.usedSlots / best.totalSlots ||
          plan.usedSlots / plan.totalSlots === best.usedSlots / best.totalSlots && plan.assignedQuantity > best.assignedQuantity ||
          plan.assignedQuantity === best.assignedQuantity && plan.sheetQuantity > best.sheetQuantity
        ) {
          best = plan;
        }
      }
    }
    return best;
  }

  async getJobWorks(orderItemId: string) {
    return this.prisma.jobWork.findMany({ where: { orderItemId }, include: { vendor: true }, orderBy: { createdAt: 'asc' } });
  }

  private async generatePoNumber(): Promise<string> {
    try {
      const result = await this.prisma.$queryRaw<{ maxnum: bigint | null }[]>`
        SELECT MAX(
          CASE WHEN "poNumber" ~ '^[0-9]+$'
          THEN CAST("poNumber" AS BIGINT)
          ELSE NULL END
        ) AS maxnum FROM "JobWork"
      `;
      const lastNum = Number(result[0]?.maxnum ?? 0);
      return String(lastNum + 1).padStart(4, '0');
    } catch {
      // Fallback: use timestamp-based unique number
      return String(Date.now()).slice(-6);
    }
  }

  async addJobWork(data: { orderItemId: string; vendorId: string; description: string; cost: number; vendorInvoiceNo?: string; dueDate?: string | null }, userId?: string) {
    const item = await this.prisma.orderItem.findUnique({
      where: { id: data.orderItemId },
      include: { order: { select: { id: true, status: true } } },
    });
    if (!item) throw new NotFoundException('Order item not found');
    const vendor = await this.prisma.vendor.findUnique({ where: { id: data.vendorId }, select: { name: true } });
    const poNumber = await this.generatePoNumber();
    const jobWork = await this.prisma.jobWork.create({
      data: { orderItemId: data.orderItemId, vendorId: data.vendorId, description: data.description, cost: data.cost, vendorInvoiceNo: data.vendorInvoiceNo, dueDate: data.dueDate ? new Date(data.dueDate) : null },
      include: { vendor: true },
    });
    // Set poNumber via raw SQL — Prisma client doesn't know about it yet (no migration file)
    await this.prisma.$executeRaw`UPDATE "JobWork" SET "poNumber" = ${poNumber} WHERE id = ${jobWork.id}`;
    await this.prisma.statusLog.create({
      data: {
        orderId: item.orderId,
        fromStatus: item.order.status,
        toStatus: item.order.status,
        changedById: userId,
        reason: `Vendor assigned: ${vendor?.name ?? data.vendorId} for ${data.description} (₹${data.cost})`,
        metadata: {
          eventType: 'VENDOR_ASSIGNED',
          orderItemId: item.id,
          jobWorkId: jobWork.id,
          vendorId: data.vendorId,
          vendorName: vendor?.name,
          description: data.description,
          cost: data.cost,
          vendorInvoiceNo: data.vendorInvoiceNo,
        },
      },
    });
    return { ...jobWork, poNumber };
  }

  async updateJobWork(jobWorkId: string, data: { status?: JobWorkStatus; description?: string; cost?: number; vendorInvoiceNo?: string; dueDate?: string | null }, userId?: string) {
    const existing = await this.prisma.jobWork.findUnique({
      where: { id: jobWorkId },
      include: {
        vendor: { select: { name: true } },
        orderItem: { include: { order: { select: { id: true, status: true } } } },
      },
    });
    if (!existing) throw new NotFoundException('Job work not found');
    const { dueDate, ...rest } = data;
    const updated = await this.prisma.jobWork.update({
      where: { id: jobWorkId },
      data: {
        ...rest,
        ...(dueDate !== undefined && { dueDate: parseIstDateOnly(dueDate) }),
        completedAt: data.status === JobWorkStatus.COMPLETED ? new Date() : undefined,
      },
      include: { vendor: true },
    });
    // Log status changes
    if (data.status && data.status !== existing.status) {
      await this.prisma.statusLog.create({
        data: {
          orderId: existing.orderItem.orderId,
          fromStatus: existing.orderItem.order.status,
          toStatus: existing.orderItem.order.status,
          changedById: userId,
          reason: `Vendor job ${existing.status} → ${data.status}: ${existing.vendor.name} – ${existing.description}`,
          metadata: {
            eventType: 'VENDOR_JOB_STATUS_CHANGED',
            jobWorkId,
            orderItemId: existing.orderItemId,
            vendorName: existing.vendor.name,
            fromJobStatus: existing.status,
            toJobStatus: data.status,
            description: existing.description,
          },
        },
      });
    }
    return updated;
  }

  async deleteJobWork(jobWorkId: string) {
    await this.prisma.jobWork.delete({ where: { id: jobWorkId } });
    return { success: true };
  }

  async getClubbingOrders() {
    const orders = await this.prisma.order.findMany({
      where: { status: { in: ['APPROVED', 'IN_PRODUCTION'] }, isSample: false },
      include: { customer: { select: { businessName: true, phone: true } }, salesAgent: { select: { id: true, fullName: true } }, items: { where: { productionCategory: 'CLUBBING' }, include: { product: { select: { name: true, sku: true, sizeInches: true, gsm: true, sides: true } }, jobWorks: { include: { vendor: { select: { name: true, id: true } } } } } } },
      orderBy: { updatedAt: 'desc' },
    });
    const filtered = orders.filter(o => o.items.length > 0);
    // Fetch designFiles via raw query
    const itemIds = filtered.flatMap(o => o.items.map(i => i.id));
    let designFilesMap: Record<string, any[]> = {};
    if (itemIds.length > 0) {
      const placeholders = itemIds.map((_, i) => `$${i + 1}`).join(',');
      const results = await this.prisma.$queryRawUnsafe<{ id: string; designFiles: any }[]>(
        `SELECT id, "designFiles" FROM "OrderItem" WHERE id IN (${placeholders})`,
        ...itemIds.slice(0, 50)
      );
      designFilesMap = Object.fromEntries(
        results.map(r => [r.id, summarizeDesignFiles(r.designFiles)])
      );
    }
    return filtered.map(o => ({
      id: o.id, orderNo: o.orderNumber, customerName: o.customer.businessName, customerPhone: o.customer.phone,
      salesAgentName: o.salesAgent?.fullName ?? null, orderDate: o.orderDate.toISOString(),
      items: o.items.map(i => {
        const { size, gsm, sides } = resolveItemDetails(i);
        return {
          id: i.id, productName: i.product.name, quantity: i.quantity,
          productionNotes: i.productionNotes, artworkNotes: i.artworkNotes,
          itemProductionStage: i.itemProductionStage,
          // Resolved product details (prefer notes, fall back to product table)
          size, gsm, sides,
          designFiles: designFilesMap[i.id] ?? [],
          jobWorks: i.jobWorks.map(j => ({ id: j.id, vendorName: j.vendor.name, vendorId: j.vendorId, description: j.description, cost: Number(j.cost), vendorInvoiceNo: j.vendorInvoiceNo, status: j.status, completedAt: j.completedAt?.toISOString() ?? null, dueDate: j.dueDate?.toISOString().split('T')[0] ?? null })),
        };
      }),
    }));
  }

  async listSheets() {
    return this.prisma.printSheet.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        sheetNo: true,
        gsm: true,
        quality: true,
        quantity: true,
        sizeInches: true,
        areaSqInches: true,
        printing: true,
        status: true,
        usedAreaSqInches: true,
        createdBySource: true,
        createdAt: true,
        updatedAt: true,
        actualPrintedQuantity: true,
        items: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            multiple: true,
            quantityOnSheet: true,
            areaSqInches: true,
            dueDate: true,
            createdAt: true,
            orderItem: {
              select: {
                id: true,
                itemProductionStage: true,
                product: { select: { name: true, sizeInches: true, gsm: true } },
                order: { select: { orderNumber: true, orderDate: true, customer: { select: { businessName: true } }, salesAgent: { select: { fullName: true } } } },
              },
            },
          },
        },
        stageVendors: {
          select: {
            id: true,
            stage: true,
            vendorId: true,
            cost: true,
            description: true,
            vendorInvoiceNo: true,
            vendor: { select: { name: true } },
          },
        },
      },
    });
  }

  async createSheet(data: { gsm: number; quality: SheetQuality; quantity: number; actualPrintedQuantity?: number | null; sizeInches: string; printing: ProductSides }) {
    const sheetNo = await this.nextSheetNo();
    const [w, h] = data.sizeInches.split('x').map(Number);
    if (!w || !h) throw new BadRequestException('Invalid size format. Use WxH e.g. 18x23');
    return this.prisma.printSheet.create({ data: { sheetNo, ...data, actualPrintedQuantity: data.actualPrintedQuantity ?? null, areaSqInches: w * h } });
  }

  async autoOrganizeSheets(userId?: string) {
    const rawItems = await this.prisma.orderItem.findMany({
      where: {
        productionCategory: 'SHEET_PRODUCTION',
        itemProductionStage: { not: 'READY_FOR_DISPATCH' },
        order: { status: { in: ['APPROVED', 'IN_PRODUCTION'] }, isSample: false },
      },
      select: {
        id: true,
        orderId: true,
        productId: true,
        quantity: true,
        productionNotes: true,
        product: {
          select: {
            name: true,
            sku: true,
            gsm: true,
            sizeInches: true,
            openSizeInches: true,
            sides: true,
            printingType: true,
            category: { select: { name: true } },
          },
        },
        sheetItems: { select: { quantityOnSheet: true } },
      },
      orderBy: { updatedAt: 'asc' },
      take: 500,
    });

    const candidates = rawItems.map(classifyAutoItem).filter((item): item is AutoItem => !!item);
    const groups = new Map<string, AutoItem[]>();
    for (const item of candidates) {
      const key = [item.family, item.gsm, item.sides, item.printingType].join('|');
      const existing = groups.get(key) ?? [];
      existing.push(item);
      groups.set(key, existing);
    }

    const createdSheets: { sheetNo: string; status: SheetStatus; quantity: number; pattern: string; items: number }[] = [];
    let skippedUnsupported = rawItems.length - candidates.length;
    let skippedWaiting = 0;

    await this.prisma.$transaction(async (tx) => {
      const allSheets = await tx.printSheet.findMany({ select: { sheetNo: true } });
      let autoSheetSequence = Math.max(
        1299,
        ...allSheets.map(sheet => this.getAutoSheetSequence(sheet.sheetNo)),
      );
      for (const [, groupItems] of groups) {
        const working = groupItems.map(item => ({ ...item }));
        let guard = 0;
        while (guard++ < 50 && working.some(item => item.balanceQuantity > 0)) {
          const active = working.filter(item => item.balanceQuantity > 0);
          const plan = this.chooseBestPlan(active);
          if (!plan) {
            skippedWaiting += active.length;
            break;
          }

          autoSheetSequence++;
          const sheetNo = String(autoSheetSequence);
          const areaSqInches = this.getSheetArea(plan.pattern.sheetSize);
          const usedAreaSqInches = plan.placements.reduce((sum, placement) => sum + placement.areaSqInches, 0);
          const sheet = await tx.printSheet.create({
            data: {
              sheetNo,
              gsm: active[0].gsm,
              quality: plan.pattern.quality,
              quantity: plan.sheetQuantity,
              sizeInches: plan.pattern.sheetSize,
              areaSqInches,
              printing: active[0].sides,
              status: plan.isFull ? SheetStatus.COMPLETE : SheetStatus.INCOMPLETE,
              usedAreaSqInches,
              createdBySource: 'AUTO',
            },
          });

          for (const placement of plan.placements) {
            const sheetItem = await tx.printSheetItem.create({
              data: {
                sheetId: sheet.id,
                orderItemId: placement.item.id,
                productId: placement.item.productId,
                multiple: placement.multiple,
                quantityOnSheet: placement.quantityOnSheet,
                areaSqInches: placement.areaSqInches,
              },
            });
            await tx.statusLog.create({
              data: {
                orderId: placement.item.orderId,
                fromStatus: OrderStatus.IN_PRODUCTION,
                toStatus: OrderStatus.IN_PRODUCTION,
                changedById: userId,
                reason: `Sheet assigned: ${placement.item.productName} → Sheet ${sheet.sheetNo}`,
                metadata: {
                  eventType: 'SHEET_ASSIGNED',
                  sheetId: sheet.id,
                  sheetItemId: sheetItem.id,
                  sheetNo: sheet.sheetNo,
                  sheetStatus: sheet.status,
                  productName: placement.item.productName,
                  quantityOnSheet: placement.quantityOnSheet,
                  multiple: placement.multiple,
                  sheetQuantity: sheet.quantity,
                  sheetSize: sheet.sizeInches,
                  sheetGsm: sheet.gsm,
                  sheetQuality: sheet.quality,
                  sheetPrinting: sheet.printing,
                  source: 'AUTO',
                },
              },
            });
            const target = working.find(item => item.id === placement.item.id);
            if (target) target.balanceQuantity -= placement.quantityOnSheet;
          }

          createdSheets.push({
            sheetNo,
            status: sheet.status,
            quantity: sheet.quantity,
            pattern: plan.pattern.name,
            items: plan.placements.length,
          });

          if (!plan.isFull) break;
        }
      }
    }, { timeout: 30000 });

    return {
      success: true,
      created: createdSheets.length,
      skippedUnsupported,
      skippedWaiting,
      sheets: createdSheets,
    };
  }

  async updateSheet(sheetId: string, data: { sheetNo?: string; gsm?: number; quality?: SheetQuality; quantity?: number; actualPrintedQuantity?: number | null; sizeInches?: string; printing?: ProductSides }) {
    const sheet = await this.prisma.printSheet.findUnique({ where: { id: sheetId } });
    if (!sheet) throw new NotFoundException('Sheet not found');
    const canEdit = ['INCOMPLETE', 'COMPLETE', 'SETTING'].includes(sheet.status);
    const hasCoreChanges =
      (data.sheetNo !== undefined && data.sheetNo.trim() !== sheet.sheetNo) ||
      (data.gsm !== undefined && data.gsm !== sheet.gsm) ||
      (data.quality !== undefined && data.quality !== sheet.quality) ||
      (data.quantity !== undefined && data.quantity !== sheet.quantity) ||
      (data.sizeInches !== undefined && data.sizeInches !== sheet.sizeInches) ||
      (data.printing !== undefined && data.printing !== sheet.printing);
    if (!canEdit && hasCoreChanges) throw new BadRequestException('Sheets can be fully edited only until complete status');
    if (!canEdit && !['SETTING', 'COMPLETE'].includes(sheet.status)) {
      throw new BadRequestException('Actual printed quantity can be changed only before printing starts');
    }
    if (data.actualPrintedQuantity !== undefined && data.actualPrintedQuantity !== null && data.actualPrintedQuantity <= 0) {
      throw new BadRequestException('Actual printed quantity must be greater than zero');
    }

    let areaSqInches: number | undefined;
    if (data.sizeInches) {
      const [w, h] = data.sizeInches.split('x').map(Number);
      if (!w || !h) throw new BadRequestException('Invalid size format. Use WxH e.g. 18x23');
      areaSqInches = w * h;
      if (sheet.usedAreaSqInches > areaSqInches) throw new BadRequestException('New sheet size is smaller than used area');
    }

    return this.prisma.printSheet.update({
      where: { id: sheetId },
      data: {
        ...(data.sheetNo && { sheetNo: data.sheetNo.trim() }),
        ...(data.gsm !== undefined && { gsm: data.gsm }),
        ...(data.quality && { quality: data.quality }),
        ...(data.quantity !== undefined && { quantity: data.quantity }),
        ...(data.actualPrintedQuantity !== undefined && { actualPrintedQuantity: data.actualPrintedQuantity }),
        ...(data.sizeInches && { sizeInches: data.sizeInches, areaSqInches }),
        ...(data.printing && { printing: data.printing }),
      },
    });
  }

  async deleteSheet(sheetId: string) {
    const sheet = await this.prisma.printSheet.findUnique({
      where: { id: sheetId },
      select: { id: true, status: true, createdBySource: true },
    });
    if (!sheet) throw new NotFoundException('Sheet not found');
    const canDelete = sheet.status === 'INCOMPLETE' || (sheet.createdBySource === 'AUTO' && sheet.status === 'COMPLETE');
    if (!canDelete) throw new BadRequestException('Only incomplete sheets or AUTO complete sheets can be deleted');
    await this.prisma.printSheet.delete({ where: { id: sheetId } });
    return { success: true, sheetId };
  }

  async updateSheetStatus(sheetId: string, status: SheetStatus, userId?: string) {
    const sheet = await this.prisma.printSheet.findUnique({
      where: { id: sheetId },
      select: { id: true, status: true },
    });
    if (!sheet) throw new NotFoundException('Sheet not found');
    const nextStatus = SHEET_NEXT_STATUS[sheet.status];
    if (status !== sheet.status && status !== nextStatus) {
      throw new BadRequestException(`Move sheet step by step. Next allowed status is ${nextStatus ?? sheet.status}.`);
    }

    // ── Paper Inventory Check ─────────────────────────────────────────────
    // When moving TO PRINTING: deduct paper from the press's inventory.
    // This throws BadRequestException if paper is insufficient.
    if (status === SheetStatus.PRINTING && sheet.status !== SheetStatus.PRINTING) {
      await this.paperInventoryService.consumePaperForSheet(sheetId);
    }

    // Map sheet status → order item production stage
    const stageMap: Record<string, string> = {
      INCOMPLETE: 'NOT_PRINTED',
      COMPLETE:   'NOT_PRINTED',
      SETTING:    'NOT_PRINTED',
      PRINTING:   'PRINTING',
      PROCESSING: 'PROCESSING',
      DONE:       'READY_FOR_DISPATCH',
    };
    const targetStage = stageMap[status];

    return this.prisma.$transaction(async (tx) => {
      const updatedSheet = await tx.printSheet.update({ where: { id: sheetId }, data: { status } });

      // Update all order items on this sheet to match the new stage
      if (targetStage) {
        const sheetItems = await tx.printSheetItem.findMany({
          where: { sheetId },
          include: { orderItem: { select: { orderId: true, product: { select: { name: true } }, order: { select: { status: true } } } } },
        });
        for (const si of sheetItems) {
          if (!si.orderItem) continue;
          await tx.orderItem.update({
            where: { id: si.orderItemId },
            data: { itemProductionStage: targetStage as any },
          });
          await tx.statusLog.create({
            data: {
              orderId: si.orderItem.orderId,
              fromStatus: si.orderItem.order.status,
              toStatus: si.orderItem.order.status,
              changedById: userId,
              reason: `Sheet ${updatedSheet.sheetNo}: ${sheet.status} → ${status}`,
              metadata: {
                eventType: 'SHEET_STATUS_CHANGED',
                sheetId: updatedSheet.id,
                sheetNo: updatedSheet.sheetNo,
                fromSheetStatus: sheet.status,
                sheetStatus: status,
                productName: si.orderItem.product.name,
                orderItemId: si.orderItemId,
                itemStage: targetStage,
                sheetQuantity: updatedSheet.quantity,
                actualPrintedQuantity: updatedSheet.actualPrintedQuantity,
                sheetSize: updatedSheet.sizeInches,
                sheetGsm: updatedSheet.gsm,
                sheetQuality: updatedSheet.quality,
                sheetPrinting: updatedSheet.printing,
              },
            },
          });
        }
      }

      return updatedSheet;
    }, { timeout: 30000 });
  }

  async updateSheetStatusWithVendor(sheetId: string, data: { status: SheetStatus; vendorId: string; activityType: string; cost?: number; vendorInvoiceNo?: string; description?: string }, userId?: string) {
    const sheet = await this.prisma.printSheet.findUnique({ where: { id: sheetId } });
    if (!sheet) throw new NotFoundException('Sheet not found');
    const nextStatus = SHEET_NEXT_STATUS[sheet.status];
    if (data.status !== sheet.status && data.status !== nextStatus) {
      throw new BadRequestException(`Move sheet step by step. Next allowed status is ${nextStatus ?? sheet.status}.`);
    }
    const stageMap: Record<string, SheetProductionStage> = { PLATE_MAKING: SheetProductionStage.PLATE_MAKING, PRINTING: SheetProductionStage.PRINTING, BINDING: SheetProductionStage.BINDING, LAMINATION: SheetProductionStage.LAMINATION, EXTRA_PROCESSING: SheetProductionStage.EXTRA_PROCESSING, PAPER_PURCHASE: SheetProductionStage.PAPER_PURCHASE };
    const stage = stageMap[data.activityType] ?? SheetProductionStage.PRINTING;

    // ── Paper Inventory Check ─────────────────────────────────────────────
    // When assigning a PRINTING stage vendor AND moving to PRINTING status,
    // first record the vendor (so consumePaperForSheet can find the press),
    // then deduct. We create the stage vendor first inside the same operation.
    if (data.status === SheetStatus.PRINTING && sheet.status !== SheetStatus.PRINTING && data.activityType === 'PRINTING') {
      // Pre-create the stage vendor record so the paper check can find it
      await this.prisma.sheetStageVendor.create({
        data: { sheetId, stage: SheetProductionStage.PRINTING, vendorId: data.vendorId, description: data.description, cost: data.cost ?? 0, vendorInvoiceNo: data.vendorInvoiceNo },
      });
      // Now check & deduct paper (will find the vendor we just created)
      await this.paperInventoryService.consumePaperForSheet(sheetId);

      return this.prisma.$transaction(async (tx) => {
        const updatedSheet = await tx.printSheet.update({ where: { id: sheetId }, data: { status: data.status } });
        const sheetItems = await tx.printSheetItem.findMany({ where: { sheetId }, include: { orderItem: { select: { orderId: true, product: { select: { name: true } }, order: { select: { status: true } } } } } });
        for (const si of sheetItems) {
          if (!si.orderItem) continue;
          await tx.orderItem.update({ where: { id: si.orderItemId }, data: { itemProductionStage: 'PRINTING' } });
          await tx.statusLog.create({
            data: {
              orderId: si.orderItem.orderId,
              fromStatus: si.orderItem.order.status,
              toStatus: si.orderItem.order.status,
              changedById: userId,
              reason: `Sheet ${updatedSheet.sheetNo}: ${sheet.status} → ${data.status}`,
              metadata: {
                eventType: 'SHEET_STATUS_CHANGED',
                sheetId: updatedSheet.id,
                sheetNo: updatedSheet.sheetNo,
                fromSheetStatus: sheet.status,
                sheetStatus: data.status,
                productName: si.orderItem.product.name,
                orderItemId: si.orderItemId,
                itemStage: 'PRINTING',
                activityType: data.activityType,
                sheetQuantity: updatedSheet.quantity,
                actualPrintedQuantity: updatedSheet.actualPrintedQuantity,
                sheetSize: updatedSheet.sizeInches,
                sheetGsm: updatedSheet.gsm,
                sheetQuality: updatedSheet.quality,
                sheetPrinting: updatedSheet.printing,
              },
            },
          });
        }
        return updatedSheet;
      }, { timeout: 30000 });
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedSheet = await tx.printSheet.update({ where: { id: sheetId }, data: { status: data.status } });
      await tx.sheetStageVendor.create({ data: { sheetId, stage, vendorId: data.vendorId, description: data.description, cost: data.cost ?? 0, vendorInvoiceNo: data.vendorInvoiceNo } });
      const sheetItems = await tx.printSheetItem.findMany({ where: { sheetId }, include: { orderItem: { select: { orderId: true, product: { select: { name: true } }, order: { select: { status: true } } } } } });
      for (const si of sheetItems) {
        if (!si.orderItem) continue;
        await tx.orderItem.update({ where: { id: si.orderItemId }, data: { itemProductionStage: 'PRINTING' } });
        await tx.statusLog.create({
          data: {
            orderId: si.orderItem.orderId,
            fromStatus: si.orderItem.order.status,
            toStatus: si.orderItem.order.status,
            changedById: userId,
            reason: `Sheet ${updatedSheet.sheetNo}: ${sheet.status} → ${data.status}`,
            metadata: {
              eventType: 'SHEET_STATUS_CHANGED',
              sheetId: updatedSheet.id,
              sheetNo: updatedSheet.sheetNo,
              fromSheetStatus: sheet.status,
              sheetStatus: data.status,
              productName: si.orderItem.product.name,
              orderItemId: si.orderItemId,
              itemStage: 'PRINTING',
              activityType: data.activityType,
              sheetQuantity: updatedSheet.quantity,
              actualPrintedQuantity: updatedSheet.actualPrintedQuantity,
              sheetSize: updatedSheet.sizeInches,
              sheetGsm: updatedSheet.gsm,
              sheetQuality: updatedSheet.quality,
              sheetPrinting: updatedSheet.printing,
            },
          },
        });
      }
      return updatedSheet;
    }, { timeout: 30000 });
  }

  async getSheetOrderItems() {
      const sheetItems = await this.prisma.printSheetItem.findMany({
      include: { sheet: { include: { stageVendors: { include: { vendor: true } } } }, orderItem: { include: { product: true, order: { include: { customer: true, salesAgent: { select: { id: true, fullName: true } } } } } } },
    });
    return sheetItems.map(si => ({
      id: si.id, sheetId: si.sheetId, sheetNo: si.sheet.sheetNo, sheetStatus: si.sheet.status, sheetGsm: si.sheet.gsm,
      multiple: si.multiple, quantityOnSheet: si.quantityOnSheet, orderItemId: si.orderItemId,
      productName: si.orderItem.product.name, productionNotes: si.orderItem.productionNotes, artworkNotes: si.orderItem.artworkNotes,
      itemProductionStage: si.orderItem.itemProductionStage, quantity: si.orderItem.quantity,
      orderNo: (si.orderItem.order as any).orderNumber, customerName: (si.orderItem.order as any).customer.businessName,
      salesAgentName: (si.orderItem.order as any).salesAgent?.fullName ?? null,
      stageVendors: si.sheet.stageVendors.map(sv => ({ id: sv.id, stage: sv.stage, vendorName: sv.vendor.name, cost: Number(sv.cost) })),
    }));
  }

  async getSheetItems(sheetId: string) {
    return this.prisma.printSheetItem.findMany({ where: { sheetId }, include: this.sheetItemInclude() });
  }

  async getPlaceableItems(gsm: number) {
    const items = await this.prisma.orderItem.findMany({
      where: {
        productionCategory: 'SHEET_PRODUCTION',
        product: { gsm },
        itemProductionStage: { not: 'READY_FOR_DISPATCH' },
        order: { status: { in: ['APPROVED', 'IN_PRODUCTION'] }, isSample: false },
      },
      select: {
        id: true,
        quantity: true,
        productionNotes: true,
        product: { select: { name: true, sku: true, gsm: true, sizeInches: true, openSizeInches: true } },
        order: { select: { orderNumber: true, customer: { select: { businessName: true } } } },
        sheetItems: { select: { quantityOnSheet: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
    return items
      .filter(i => i.sheetItems.reduce((sum, si) => sum + si.quantityOnSheet, 0) < i.quantity)
      .map(i => ({ id: i.id, productName: i.product.name, sku: i.product.sku, gsm: i.product.gsm, openSizeInches: i.product.openSizeInches ?? i.product.sizeInches, quantity: i.quantity, productionNotes: i.productionNotes, orderNo: (i.order as any).orderNumber, customerName: (i.order as any).customer.businessName }));
  }

  async placeItemOnSheet(sheetId: string, data: { orderItemId: string; productId: string; multiple: number; quantityOnSheet: number; areaSqInches: number }, userId?: string) {
    const sheet = await this.prisma.printSheet.findUnique({ where: { id: sheetId } });
    if (!sheet) throw new NotFoundException('Sheet not found');
    let productId = data.productId;
    if (!productId || productId === data.orderItemId) {
      const orderItem = await this.prisma.orderItem.findUnique({ where: { id: data.orderItemId }, select: { productId: true } });
      if (!orderItem) throw new NotFoundException('Order item not found');
      productId = orderItem.productId;
    }
    const newUsed = data.areaSqInches > 1 ? sheet.usedAreaSqInches + data.areaSqInches : sheet.usedAreaSqInches;
    if (data.areaSqInches > 1 && newUsed > sheet.areaSqInches) throw new BadRequestException('Not enough space on sheet');
    const [, updatedSheet] = await this.prisma.$transaction([
      this.prisma.printSheetItem.create({ data: { sheetId, orderItemId: data.orderItemId, productId, multiple: data.multiple, quantityOnSheet: data.quantityOnSheet, areaSqInches: data.areaSqInches } }),
      this.prisma.printSheet.update({ where: { id: sheetId }, data: { usedAreaSqInches: newUsed } }),
    ]);
    const item = await this.prisma.printSheetItem.findFirstOrThrow({
      where: { sheetId, orderItemId: data.orderItemId },
      orderBy: { createdAt: 'desc' },
      include: this.sheetItemInclude(),
    });
    await this.prisma.statusLog.create({
      data: {
        orderId: item.orderItem.order.id,
        fromStatus: item.orderItem.order.status,
        toStatus: item.orderItem.order.status,
        changedById: userId,
        reason: `Sheet assigned: ${item.orderItem.product.name} → Sheet ${updatedSheet.sheetNo}`,
        metadata: {
          eventType: 'SHEET_ASSIGNED',
          sheetId: updatedSheet.id,
          sheetItemId: item.id,
          sheetNo: updatedSheet.sheetNo,
          sheetStatus: updatedSheet.status,
          productName: item.orderItem.product.name,
          quantityOnSheet: data.quantityOnSheet,
          multiple: data.multiple,
          sheetQuantity: updatedSheet.quantity,
          sheetSize: updatedSheet.sizeInches,
          sheetGsm: updatedSheet.gsm,
          sheetQuality: updatedSheet.quality,
          sheetPrinting: updatedSheet.printing,
          source: 'MANUAL',
        },
      },
    });
    return { item, sheet: updatedSheet };
  }

  async removeItemFromSheet(sheetItemId: string) {
    const si = await this.prisma.printSheetItem.findUnique({ where: { id: sheetItemId } });
    if (!si) throw new NotFoundException('Sheet item not found');
    const [, updatedSheet] = await this.prisma.$transaction([
      this.prisma.printSheetItem.delete({ where: { id: sheetItemId } }),
      this.prisma.printSheet.update({ where: { id: si.sheetId }, data: { usedAreaSqInches: { decrement: si.areaSqInches } } }),
    ]);
    return { success: true, sheetId: si.sheetId, sheet: updatedSheet };
  }

  async addSheetStageVendor(data: { sheetId: string; stage: SheetProductionStage; vendorId: string; description?: string; cost: number; vendorInvoiceNo?: string }, userId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const stageVendor = await tx.sheetStageVendor.create({ data, include: { vendor: true } });
      const sheetItems = await tx.printSheetItem.findMany({
        where: { sheetId: data.sheetId },
        include: { orderItem: { select: { orderId: true, product: { select: { name: true } } } } },
      });
      const sheet = await tx.printSheet.findUniqueOrThrow({ where: { id: data.sheetId } });
      for (const si of sheetItems) {
        await tx.statusLog.create({
          data: {
            orderId: si.orderItem.orderId,
            fromStatus: OrderStatus.IN_PRODUCTION,
            toStatus: OrderStatus.IN_PRODUCTION,
            changedById: userId,
            reason: `Sheet ${sheet.sheetNo}: ${data.stage} assigned to ${stageVendor.vendor.name}`,
            metadata: {
              eventType: 'SHEET_STAGE_VENDOR_ASSIGNED',
              sheetId: sheet.id,
              sheetNo: sheet.sheetNo,
              sheetStatus: sheet.status,
              productName: si.orderItem.product.name,
              orderItemId: si.orderItemId,
              stage: data.stage,
              vendorName: stageVendor.vendor.name,
              vendorInvoiceNo: data.vendorInvoiceNo,
              description: data.description,
              cost: data.cost,
            },
          },
        });
      }
      return stageVendor;
    });
  }

  async updateSheetItemDueDate(sheetItemId: string, dueDate?: string | null) {
    return this.prisma.printSheetItem.update({
      where: { id: sheetItemId },
      data: { dueDate: parseIstDateOnly(dueDate) },
      select: { id: true, dueDate: true },
    });
  }

  async deleteSheetStageVendor(id: string) {
    await this.prisma.sheetStageVendor.delete({ where: { id } });
    return { success: true };
  }

  async getSheetHistory({ search, toStatus, page = 1, limit = 50 }: { search?: string; toStatus?: string; page?: number; limit?: number }) {
    const where: any = {
      metadata: { path: ['eventType'], equals: 'SHEET_STATUS_CHANGED' },
      ...(toStatus ? { metadata: { path: ['sheetStatus'], equals: toStatus } } : {}),
      ...(search ? { OR: [{ reason: { contains: search, mode: 'insensitive' } }] } : {}),
    };

    const raw = await this.prisma.statusLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { changedBy: { select: { id: true, fullName: true } } },
    });

    const seen = new Set<string>();
    const deduped: typeof raw = [];
    for (const row of raw) {
      const sheetId = (row.metadata as any)?.sheetId ?? '';
      const key = `${sheetId}|${row.fromStatus}|${row.toStatus}`;
      if (!seen.has(key)) { seen.add(key); deduped.push(row); }
    }

    const total = deduped.length;
    const items = deduped.slice((page - 1) * limit, page * limit);
    return {
      items: items.map(r => ({
        id: r.id,
        sheetId: (r.metadata as any)?.sheetId,
        sheetNo: (r.metadata as any)?.sheetNo,
        fromStatus: r.fromStatus,
        toStatus: r.toStatus,
        reason: r.reason,
        createdAt: r.createdAt,
        changedBy: r.changedBy,
        metadata: r.metadata,
      })),
      total, page, limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
