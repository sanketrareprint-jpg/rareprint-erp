// backend/src/production/production.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { OrderProductionStage, OrderStatus, ProductionCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';

const STAGE_LABEL: Record<string, string> = {
  PRINTING:           'Printing 🖨️',
  PROCESSING:         'Processing ⚙️',
  READY_FOR_DISPATCH: 'Ready for Dispatch 📦',
  NOT_PRINTED:        'Not Started',
};

@Injectable()
export class ProductionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  async listInProduction() {
    const orders = await this.prisma.order.findMany({
      where: {
        status: { in: [OrderStatus.APPROVED, OrderStatus.IN_PRODUCTION] },
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        customer: true,
        salesAgent: { select: { id: true, fullName: true } },
        items: { include: { product: true } },
      },
    });

    return orders.map((o) => ({
      id: o.id,
      orderNo: o.orderNumber,
      customerName: o.customer.businessName,
      customerPhone: o.customer.phone,
      salesAgentName: o.salesAgent?.fullName ?? null,
      status: o.status,
      productionStage: o.productionStage,
      orderDate: o.orderDate.toISOString(),
      notes: o.notes,
      items: o.items.map((i) => ({
        id: i.id,
        productName: i.product.name,
        sku: i.product.sku,
        quantity: i.quantity,
        unitPrice: Number(i.unitPrice),
        lineTotal: Number(i.lineTotal),
        productionNotes: i.productionNotes,
        artworkNotes: i.artworkNotes,
        itemProductionStage: i.itemProductionStage,
        productionCategory: i.productionCategory ?? null,
        designFiles: (i as any).designFiles ?? [],
      })),
    }));
  }

  async assignCategory(
    itemId: string,
    productionCategory: ProductionCategory,
    userId: string,
  ) {
    const item = await this.prisma.orderItem.findUnique({
      where: { id: itemId },
      include: { order: true },
    });
    if (!item) throw new NotFoundException('Order item not found');

    await this.prisma.orderItem.update({
      where: { id: itemId },
      data: { productionCategory },
    });

    // Move order to IN_PRODUCTION if still APPROVED
    if (item.order.status === OrderStatus.APPROVED) {
      await this.prisma.order.update({
        where: { id: item.orderId },
        data: { status: OrderStatus.IN_PRODUCTION },
      });
      await this.prisma.statusLog.create({
        data: {
          orderId: item.orderId,
          fromStatus: item.order.status,
          toStatus: OrderStatus.IN_PRODUCTION,
          changedById: userId,
          reason: `Production category assigned: ${productionCategory}`,
        },
      });
    }

    return { success: true, itemId, productionCategory };
  }

  // Called when sheet status changes - updates all order items on that sheet
  async updateSheetItemStages(sheetId: string, sheetStatus: string, userId: string) {
    // Map sheet status to order item production stage
    const stageMap: Record<string, OrderProductionStage | null> = {
      INCOMPLETE: OrderProductionStage.NOT_PRINTED,
      COMPLETE:   OrderProductionStage.NOT_PRINTED,
      SETTING:    OrderProductionStage.NOT_PRINTED,
      PRINTING:   OrderProductionStage.PRINTING,
      PROCESSING: OrderProductionStage.PROCESSING,
      DONE:       OrderProductionStage.READY_FOR_DISPATCH,
    };

    const targetStage = stageMap[sheetStatus];
    if (!targetStage) return;

    // Get all order items on this sheet
    const sheet = await this.prisma.printSheet.findUnique({
      where: { id: sheetId },
      include: {
        items: {
          include: {
            orderItem: { include: { order: { include: { customer: true, salesAgent: { select: { fullName: true } }, items: { include: { product: true } } } } } },
          },
        },
      },
    });
    if (!sheet) return;

    // Update each order item's stage
    for (const si of sheet.items) {
      await this.prisma.orderItem.update({
        where: { id: si.orderItemId },
        data: { itemProductionStage: targetStage },
      });
    }

    // Send WhatsApp notifications for PRINTING stage
    if (targetStage === OrderProductionStage.PRINTING) {
      const uniqueOrders = [...new Map(sheet.items.map(si => [si.orderItem.orderId, si.orderItem.order])).values()];
      for (const order of uniqueOrders) {
        if (order.customer.phone) {
          const productNames = order.items.map(i => i.product.name).join(', ');
          void this.whatsapp.sendOrderUpdate({
            customerName:  order.customer.businessName,
            customerPhone: order.customer.phone,
            orderNo:       order.orderNumber,
            product:       productNames,
            status:        'Printing 🖨️',
            agentName:     order.salesAgent?.fullName ?? 'Rareprint Team',
          });
        }
      }
    }
  }

  async updateItemStage(
    itemId: string,
    stage: OrderProductionStage,
    userId: string,
  ) {
    const item = await this.prisma.orderItem.findUnique({
      where: { id: itemId },
      include: {
        order: {
          include: {
            customer: true,
            salesAgent: { select: { fullName: true } },
            items: { include: { product: true } },
          },
        },
        product: true,
      },
    });
    if (!item) throw new NotFoundException('Order item not found');

    await this.prisma.orderItem.update({
      where: { id: itemId },
      data: { itemProductionStage: stage },
    });

    const allItems = await this.prisma.orderItem.findMany({
      where: { orderId: item.orderId },
    });

    const allReady = allItems.every(
      (i) => i.itemProductionStage === OrderProductionStage.READY_FOR_DISPATCH,
    );
    const anyInProgress = allItems.some(
      (i) =>
        i.itemProductionStage === OrderProductionStage.PRINTING ||
        i.itemProductionStage === OrderProductionStage.PROCESSING,
    );
    const anyReady = allItems.some(
      (i) => i.itemProductionStage === OrderProductionStage.READY_FOR_DISPATCH,
    );

    let newOrderStatus = item.order.status;
    if (allReady) newOrderStatus = OrderStatus.READY_FOR_DISPATCH;
    else if (anyInProgress || anyReady) newOrderStatus = OrderStatus.IN_PRODUCTION;

    if (newOrderStatus !== item.order.status) {
      await this.prisma.order.update({
        where: { id: item.orderId },
        data: { status: newOrderStatus },
      });
      await this.prisma.statusLog.create({
        data: {
          orderId: item.orderId,
          fromStatus: item.order.status,
          toStatus: newOrderStatus,
          changedById: userId,
          reason: `Item stage updated to ${stage}`,
        },
      });
    }

    if (stage !== OrderProductionStage.NOT_PRINTED && item.order.customer.phone) {
      const stageLabel = STAGE_LABEL[stage] ?? stage.replace(/_/g, ' ');
      const productNames = item.order.items.map(i => i.product.name).join(', ');
      void this.whatsapp.sendOrderUpdate({
        customerName:  item.order.customer.businessName,
        customerPhone: item.order.customer.phone,
        orderNo:       item.order.orderNumber,
        product:       productNames,
        status:        stageLabel,
        agentName:     item.order.salesAgent?.fullName ?? 'Rareprint Team',
      });
    }

    return { success: true, itemId, stage };
  }
}

