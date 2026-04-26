// backend/src/production/clubbing-sheet.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { JobWorkStatus, SheetQuality, SheetStatus, SheetProductionStage, ProductSides } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ClubbingSheetService {
  constructor(private readonly prisma: PrismaService) {}

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
      include: { customer: true, salesAgent: { select: { id: true, fullName: true } }, items: { where: { productionCategory: 'CLUBBING' }, include: { product: true, jobWorks: { include: { vendor: true } } } } },
      orderBy: { updatedAt: 'desc' },
    });
    return orders.filter(o => o.items.length > 0).map(o => ({
      id: o.id, orderNo: o.orderNumber, customerName: o.customer.businessName, customerPhone: o.customer.phone,
      salesAgentName: o.salesAgent?.fullName ?? null, orderDate: o.orderDate.toISOString(),
      items: o.items.map(i => ({ id: i.id, productName: i.product.name, quantity: i.quantity, productionNotes: i.productionNotes, artworkNotes: i.artworkNotes, itemProductionStage: i.itemProductionStage,
        jobWorks: i.jobWorks.map(j => ({ id: j.id, vendorName: j.vendor.name, vendorId: j.vendorId, description: j.description, cost: Number(j.cost), vendorInvoiceNo: j.vendorInvoiceNo, status: j.status, completedAt: j.completedAt?.toISOString() ?? null })) })),
    }));
  }

  async listSheets() {
    return this.prisma.printSheet.findMany({ orderBy: { createdAt: 'desc' }, include: { items: { include: { orderItem: { include: { product: true, order: { include: { customer: true } } } } } }, stageVendors: { include: { vendor: true } } } });
  }

  async createSheet(data: { gsm: number; quality: SheetQuality; quantity: number; sizeInches: string; printing: ProductSides }) {
    const count = await this.prisma.printSheet.count();
    const sheetNo = `SHT-${new Date().getFullYear()}-${String(count + 1).padStart(3, '0')}`;
    const [w, h] = data.sizeInches.split('x').map(Number);
    if (!w || !h) throw new BadRequestException('Invalid size format. Use WxH e.g. 18x23');
    return this.prisma.printSheet.create({ data: { sheetNo, ...data, areaSqInches: w * h } });
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
    return this.prisma.printSheetItem.findMany({ where: { sheetId }, include: { orderItem: { include: { product: true, order: { include: { customer: true } } } } } });
  }

  async getPlaceableItems(gsm: number) {
    const items = await this.prisma.orderItem.findMany({ where: { productionCategory: 'SHEET_PRODUCTION', product: { gsm } }, include: { product: true, order: { include: { customer: true } }, sheetItems: true } });
    return items.filter(i => i.sheetItems.length === 0).map(i => ({ id: i.id, productName: i.product.name, sku: i.product.sku, gsm: i.product.gsm, openSizeInches: i.product.sizeInches, quantity: i.quantity, productionNotes: i.productionNotes, orderNo: (i.order as any).orderNumber, customerName: (i.order as any).customer.businessName }));
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
    const [item, updatedSheet] = await this.prisma.$transaction([
      this.prisma.printSheetItem.create({ data: { sheetId, orderItemId: data.orderItemId, productId, multiple: data.multiple, quantityOnSheet: data.quantityOnSheet, areaSqInches: data.areaSqInches } }),
      this.prisma.printSheet.update({ where: { id: sheetId }, data: { usedAreaSqInches: newUsed } }),
    ]);
    return { item, sheet: updatedSheet };
  }

  async removeItemFromSheet(sheetItemId: string) {
    const si = await this.prisma.printSheetItem.findUnique({ where: { id: sheetItemId } });
    if (!si) throw new NotFoundException('Sheet item not found');
    await this.prisma.$transaction([
      this.prisma.printSheetItem.delete({ where: { id: sheetItemId } }),
      this.prisma.printSheet.update({ where: { id: si.sheetId }, data: { usedAreaSqInches: { decrement: si.areaSqInches } } }),
    ]);
    return { success: true };
  }

  async addSheetStageVendor(data: { sheetId: string; stage: SheetProductionStage; vendorId: string; description?: string; cost: number; vendorInvoiceNo?: string }) {
    return this.prisma.sheetStageVendor.create({ data, include: { vendor: true } });
  }

  async deleteSheetStageVendor(id: string) {
    await this.prisma.sheetStageVendor.delete({ where: { id } });
    return { success: true };
  }
}
