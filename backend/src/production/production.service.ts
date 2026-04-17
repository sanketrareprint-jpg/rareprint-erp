// backend/src/production/production.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { OrderProductionStage, OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';

// Stage → human readable for WhatsApp
const STAGE_LABEL: Record<string, string> = {
  PRINTING:             'Printing 🖨️',
  PROCESSING:           'Processing ⚙️',
  READY_FOR_DISPATCH:   'Ready for Dispatch 📦',
  NOT_PRINTED:          'Not Started',
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
        designFiles: (i as any).designFiles ?? [],
      })),
    }));
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

    const anyInProgress = allItems.some(
      (i) =>
        i.itemProductionStage === OrderProductionStage.PRINTING ||
        i.itemProductionStage === OrderProductionStage.PROCESSING,
    );
    const anyReady = allItems.some(
      (i) => i.itemProductionStage === OrderProductionStage.READY_FOR_DISPATCH,
    );

    let newOrderStatus = item.order.status;
    if (anyInProgress || anyReady) newOrderStatus = OrderStatus.IN_PRODUCTION;

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

    // ── WhatsApp: send on meaningful stage changes (not NOT_PRINTED) ─────────
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