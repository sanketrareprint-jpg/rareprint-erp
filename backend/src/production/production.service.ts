import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderProductionStage, OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProductionService {
  constructor(private readonly prisma: PrismaService) {}

  async listInProduction() {
    const orders = await this.prisma.order.findMany({
      where: {
        status: { in: [OrderStatus.APPROVED, OrderStatus.IN_PRODUCTION] },
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        customer: true,
        items: { include: { product: true } },
      },
    });

    return orders.map((o) => ({
      id: o.id,
      orderNo: o.orderNumber,
      customerName: o.customer.businessName,
      customerPhone: o.customer.phone,
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
      include: { order: true },
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

    // Production ONLY moves order between APPROVED and IN_PRODUCTION
    // READY_FOR_DISPATCH is set ONLY by Accounts after approving dispatch batch
    let newOrderStatus = item.order.status;

    if (anyInProgress || anyReady) {
      newOrderStatus = OrderStatus.IN_PRODUCTION;
    }

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

    return { success: true, itemId, stage };
  }
}