// backend/src/production/clubbing-sheet.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { JobWorkStatus, SheetQuality, SheetStatus, SheetProductionStage, ProductSides } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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

@Injectable()
export class ClubbingSheetService {
  constructor(private readonly prisma: PrismaService) {}

  private sheetItemInclude() {
    return {
      orderItem: {
        select: {
          id: true,
          itemProductionStage: true,
          product: { select: { name: true, sizeInches: true, gsm: true } },
          order: { select: { orderNumber: true, orderDate: true, customer: { select: { businessName: true } } } },
        },
      },
    } as const;
  }

  async getJobWorks(orderItemId: string) {
    return this.prisma.jobWork.findMany({ where: { orderItemId }, include: { vendor: true }, orderBy: { createdAt: 'asc' } });
  }

  async addJobWork(data: { orderItemId: string; vendorId: string; description: string; cost: number; vendorInvoiceNo?: string }) {
    const item = await this.prisma.orderItem.findUnique({ where: { id: data.orderItemId } });
    if (!item) throw new NotFoundException('Order item not found');
    return this.prisma.jobWork.create({ data: { orderItemId: data.orderItemId, vendorId: data.vendorId, description: data.description, cost: data.cost, vendorInvoiceNo: data.vendorInvoiceNo }, include: { vendor: true } });
  }

  async updateJobWork(jobWorkId: string, data: { status?: JobWorkStatus; description?: string; cost?: number; vendorInvoiceNo?: string }) {
    return this.prisma.jobWork.update({ where: { id: jobWorkId }, data: { ...data, completedAt: data.status === JobWorkStatus.COMPLETED ? new Date() : undefined }, include: { vendor: true } });
  }

  async deleteJobWork(jobWorkId: string) {
    await this.prisma.jobWork.delete({ where: { id: jobWorkId } });
    return { success: true };
  }

  async getClubbingOrders() {
    const orders = await this.prisma.order.findMany({
      where: { status: { in: ['APPROVED', 'IN_PRODUCTION'] } },
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
          jobWorks: i.jobWorks.map(j => ({ id: j.id, vendorName: j.vendor.name, vendorId: j.vendorId, description: j.description, cost: Number(j.cost), vendorInvoiceNo: j.vendorInvoiceNo, status: j.status, completedAt: j.completedAt?.toISOString() ?? null })),
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
        items: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            multiple: true,
            quantityOnSheet: true,
            areaSqInches: true,
            orderItem: {
              select: {
                id: true,
                itemProductionStage: true,
                product: { select: { name: true, sizeInches: true, gsm: true } },
                order: { select: { orderNumber: true, orderDate: true, customer: { select: { businessName: true } } } },
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

  async createSheet(data: { gsm: number; quality: SheetQuality; quantity: number; sizeInches: string; printing: ProductSides }) {
    const count = await this.prisma.printSheet.count();
    const sheetNo = `SHT-${new Date().getFullYear()}-${String(count + 1).padStart(3, '0')}`;
    const [w, h] = data.sizeInches.split('x').map(Number);
    if (!w || !h) throw new BadRequestException('Invalid size format. Use WxH e.g. 18x23');
    return this.prisma.printSheet.create({ data: { sheetNo, ...data, areaSqInches: w * h } });
  }

  async updateSheet(sheetId: string, data: { sheetNo?: string; gsm?: number; quality?: SheetQuality; quantity?: number; sizeInches?: string; printing?: ProductSides }) {
    const sheet = await this.prisma.printSheet.findUnique({ where: { id: sheetId } });
    if (!sheet) throw new NotFoundException('Sheet not found');
    if (sheet.status !== 'INCOMPLETE') throw new BadRequestException('Only incomplete sheets can be edited');

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
        ...(data.sizeInches && { sizeInches: data.sizeInches, areaSqInches }),
        ...(data.printing && { printing: data.printing }),
      },
    });
  }

  async updateSheetStatus(sheetId: string, status: SheetStatus) {
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
        const sheetItems = await tx.printSheetItem.findMany({ where: { sheetId } });
        for (const si of sheetItems) {
          await tx.orderItem.update({
            where: { id: si.orderItemId },
            data: { itemProductionStage: targetStage as any },
          });
        }
      }

      return updatedSheet;
    });
  }

  async updateSheetStatusWithVendor(sheetId: string, data: { status: SheetStatus; vendorId: string; activityType: string; cost?: number; vendorInvoiceNo?: string; description?: string }) {
    const sheet = await this.prisma.printSheet.findUnique({ where: { id: sheetId } });
    if (!sheet) throw new NotFoundException('Sheet not found');
    const stageMap: Record<string, SheetProductionStage> = { PLATE_MAKING: SheetProductionStage.PLATE_MAKING, PRINTING: SheetProductionStage.PRINTING, BINDING: SheetProductionStage.BINDING, LAMINATION: SheetProductionStage.LAMINATION, EXTRA_PROCESSING: SheetProductionStage.EXTRA_PROCESSING, PAPER_PURCHASE: SheetProductionStage.PAPER_PURCHASE };
    const stage = stageMap[data.activityType] ?? SheetProductionStage.PRINTING;
    return this.prisma.$transaction(async (tx) => {
      const updatedSheet = await tx.printSheet.update({ where: { id: sheetId }, data: { status: data.status } });
      await tx.sheetStageVendor.create({ data: { sheetId, stage, vendorId: data.vendorId, description: data.description, cost: data.cost ?? 0, vendorInvoiceNo: data.vendorInvoiceNo } });
      const sheetItems = await tx.printSheetItem.findMany({ where: { sheetId } });
      for (const si of sheetItems) { await tx.orderItem.update({ where: { id: si.orderItemId }, data: { itemProductionStage: 'PRINTING' } }); }
      return updatedSheet;
    });
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
        order: { status: { in: ['APPROVED', 'IN_PRODUCTION'] } },
      },
      select: {
        id: true,
        quantity: true,
        productionNotes: true,
        product: { select: { name: true, sku: true, gsm: true, sizeInches: true } },
        order: { select: { orderNumber: true, customer: { select: { businessName: true } } } },
        sheetItems: { select: { quantityOnSheet: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
    return items
      .filter(i => i.sheetItems.reduce((sum, si) => sum + si.quantityOnSheet, 0) < i.quantity)
      .map(i => ({ id: i.id, productName: i.product.name, sku: i.product.sku, gsm: i.product.gsm, openSizeInches: i.product.sizeInches, quantity: i.quantity, productionNotes: i.productionNotes, orderNo: (i.order as any).orderNumber, customerName: (i.order as any).customer.businessName }));
  }

  async placeItemOnSheet(sheetId: string, data: { orderItemId: string; productId: string; multiple: number; quantityOnSheet: number; areaSqInches: number }) {
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

  async addSheetStageVendor(data: { sheetId: string; stage: SheetProductionStage; vendorId: string; description?: string; cost: number; vendorInvoiceNo?: string }) {
    return this.prisma.sheetStageVendor.create({ data, include: { vendor: true } });
  }

  async deleteSheetStageVendor(id: string) {
    await this.prisma.sheetStageVendor.delete({ where: { id } });
    return { success: true };
  }
}
