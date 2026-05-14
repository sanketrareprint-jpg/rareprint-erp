import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function buildItemDetails(items: Array<{ product: { name: string; sizeInches?: string | null; gsm?: number | null; sides?: string | null }; productionNotes?: string | null; quantity: number; unitPrice: Prisma.Decimal; lineTotal: Prisma.Decimal; itemProductionStage: string }>) {
  return items.map((i) => {
    // Try to read from productionNotes first
    let size = (i.productionNotes?.match(/Size[\s:]+([^\n,]+)/i) ?? [])[1]?.trim() ?? null;
    let gsm = (i.productionNotes?.match(/GSM[\s:]+(\S+)/i) ?? [])[1]?.trim() ?? null;
    let sidesRaw = (i.productionNotes?.match(/Sides[\s:]+(\S+)/i) ?? [])[1]?.trim() ?? null;

    // Fall back to product's direct fields if not found in productionNotes
    if (!size && i.product.sizeInches) {
      size = i.product.sizeInches;
    }
    if (!gsm && i.product.gsm) {
      gsm = String(i.product.gsm);
    }
    if (!sidesRaw && i.product.sides) {
      sidesRaw = i.product.sides;
    }

    // Convert sides to label
    const sidesLabel = sidesRaw === 'SINGLE_SIDE' ? 'Single' : sidesRaw === 'DOUBLE_SIDE' ? 'Double' : (sidesRaw ?? null);

    return {
      productName: i.product.name,
      productionNotes: i.productionNotes ?? null,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      lineTotal: i.lineTotal,
      itemProductionStage: i.itemProductionStage,
      size,
      gsm,
      sides: sidesLabel,
    };
  });
}

type DesignFileSummary = {
  filename: string;
  originalName: string;
  uploadedAt?: string;
  size?: number;
};

function summarizeDesignFiles(value: unknown): DesignFileSummary[] {
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

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  private async getDesignFileCounts(itemIds: string[]): Promise<Record<string, number>> {
    if (itemIds.length === 0) return {};
    const rows = await this.prisma.$queryRawUnsafe<{ id: string; designFileCount: number | bigint }[]>(
      `SELECT id, jsonb_array_length(
        CASE
          WHEN jsonb_typeof("designFiles"::jsonb) = 'array' THEN "designFiles"::jsonb
          ELSE '[]'::jsonb
        END
      ) AS "designFileCount"
      FROM "OrderItem"
      WHERE id IN (${itemIds.map((_, i) => `$${i + 1}`).join(',')})`,
      ...itemIds,
    );
    return Object.fromEntries(rows.map((row) => [row.id, Number(row.designFileCount)]));
  }

  private async generateOrderNumber(): Promise<string> {
    const last = await this.prisma.order.findFirst({ orderBy: { createdAt: 'desc' } });
    const lastNum = last ? parseInt(last.orderNumber, 10) : 10588;
    const next = (isNaN(lastNum) ? 10588 : lastNum) + 1;
    const exists = await this.prisma.order.findUnique({ where: { orderNumber: String(next) } });
    if (exists) return String(Date.now());
    return String(next);
  }

  async findAllForTable() {
    const orders = await this.prisma.order.findMany({
      orderBy: { orderDate: 'desc' },
      select: {
        id: true,
        orderNumber: true,
        customerId: true,
        salesAgentId: true,
        orderDate: true,
        status: true,
        grandTotal: true,
        customer: true,
        salesAgent: { select: { id: true, fullName: true } },
        items: {
          select: {
            id: true,
            quantity: true,
            unitPrice: true,
            lineTotal: true,
            productionNotes: true,
            itemProductionStage: true,
            product: {
              select: {
                name: true,
                sizeInches: true,
                gsm: true,
                sides: true,
              }
            }
          }
        },
        payments: true,
      },
    });
    const designFileCounts = await this.getDesignFileCounts(
      orders.flatMap((o) => o.items.map((i) => i.id)),
    );

    return orders.map((o) => {
      const total = Number(o.grandTotal);
      const advancePaid = o.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      const balanceDue = Math.max(0, total - advancePaid);

      return {
        id: o.id,
        orderNo: o.orderNumber,
        customerName: o.customer.businessName,
        customerPhone: o.customer.phone ?? null,
        salesAgentName: o.salesAgent?.fullName ?? null,
        products: o.items.map((i) => `${i.product.name} ×${i.quantity}`).join(', '),
        totalAmount: total,
        advancePaid,
        balanceDue,
        status: o.status,
        date: o.orderDate.toISOString(),
        itemDetails: buildItemDetails(o.items as any),
        items: o.items.map((i) => ({
          id: i.id,
          productName: i.product.name,
          itemProductionStage: i.itemProductionStage,
          designFiles: Array.from({ length: designFileCounts[i.id] ?? 0 }),
        })),
      };
    });
  }

  async create(
    dto: {
      customer: { name: string; phone?: string; email?: string; address?: string; city?: string; state?: string; pincode?: string };
      items: Array<{ productId: string; quantity: number; unitPrice: number; itemProductionStage?: string; artworkNotes?: string; productionNotes?: string }>;
      notes?: string;
      leadSource?: string;
      advanceAmount?: number;
      paymentAccountId?: string;
      paymentMethod?: string;
    },
    salesAgentId: string,
  ) {
    if (!dto.items?.length) {
      throw new BadRequestException('At least one line item is required');
    }

    const productIds = [...new Set(dto.items.map((i) => i.productId))];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, isActive: true },
    });

    if (products.length !== productIds.length) {
      throw new NotFoundException('One or more products were not found');
    }

    const orderNumber = await this.generateOrderNumber();

    const shippingParts = [
      dto.customer.address,
      dto.customer.city,
      dto.customer.state,
      dto.customer.pincode,
    ].filter(Boolean);
    const shippingAddress = shippingParts.length > 0 ? shippingParts.join(', ') : undefined;

    const customerCode = `CUST-${Date.now()}-${randomSuffix()}`;

    const itemsData = dto.items.map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
      unitPrice: new Prisma.Decimal(i.unitPrice),
      lineDiscount: new Prisma.Decimal(0),
      taxRatePct: new Prisma.Decimal(0),
      taxAmount: new Prisma.Decimal(0),
      lineTotal: new Prisma.Decimal(i.quantity * i.unitPrice),
      itemProductionStage: (i.itemProductionStage as any) ?? 'NOT_PRINTED',
      artworkNotes: i.artworkNotes ?? null,
      productionNotes: i.productionNotes ?? null,
    }));

    const subtotal = itemsData.reduce(
      (s, row) => s.plus(row.lineTotal),
      new Prisma.Decimal(0),
    );
    const grandTotal = subtotal;
    const advance = dto.advanceAmount ?? 0;

    let paymentStatus: PaymentStatus = PaymentStatus.PENDING;
    if (advance > 0) {
      const cmp = new Prisma.Decimal(advance).comparedTo(grandTotal);
      paymentStatus = cmp >= 0 ? PaymentStatus.PAID : PaymentStatus.PARTIALLY_PAID;
    }

    const orderId = await this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: {
          customerCode,
          businessName: dto.customer.name,
          contactPerson: dto.customer.name,
          phone: dto.customer.phone,
          email: dto.customer.email,
          shippingAddress,
        },
      });

      const order = await tx.order.create({
        data: {
          orderNumber,
          orderDate: new Date(),
          customerId: customer.id,
          salesAgentId,
          leadSource: dto.leadSource ?? null,
          status: OrderStatus.PENDING_APPROVAL,
          paymentStatus,
          subtotal,
          grandTotal,
          discount: new Prisma.Decimal(0),
          taxAmount: new Prisma.Decimal(0),
          shippingCharge: new Prisma.Decimal(0),
          notes: dto.notes,
          items: { create: itemsData },
        },
      });

      if (advance > 0 && dto.paymentAccountId) {
        await tx.payment.create({
          data: {
            orderId: order.id,
            paymentAccountId: dto.paymentAccountId,
            receivedById: salesAgentId,
            amount: new Prisma.Decimal(advance),
            method: (dto.paymentMethod as PaymentMethod) ?? PaymentMethod.CASH,
          },
        });
      }

      await tx.statusLog.create({
        data: {
          orderId: order.id,
          fromStatus: null,
          toStatus: OrderStatus.PENDING_APPROVAL,
          changedById: salesAgentId,
          reason: 'Order created; pending accounts',
        },
      });

      return order.id;
    });

    // Send order created WhatsApp notification
    const fullOrder = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
        salesAgent: { select: { fullName: true } },
        items: { include: { product: true } },
        payments: true,
      },
    });

    if (fullOrder) {
      const totalAmount = Number(fullOrder.grandTotal);
      const advancePaid = fullOrder.payments.reduce((s, p) => s + Number(p.amount), 0);
      const balanceDue = Math.max(0, totalAmount - advancePaid);

      // Format product details: Name Size GSM Sides Qty @Rate = Total
      const productDetails = fullOrder.items.map((i) => {
        const notes = i.productionNotes ?? '';
        const size = (notes.match(/Size[:\s]+([^\n,]+)/i) ?? [])[1]?.trim() ?? '';
        const gsm = (notes.match(/GSM[:\s]+(\S+)/i) ?? [])[1]?.trim() ?? '';
        const sides = (notes.match(/Sides[:\s]+(\S+)/i) ?? [])[1]?.trim() ?? '';
        const sidesLabel = sides === 'SINGLE_SIDE' ? 'Single' : sides === 'DOUBLE_SIDE' ? 'Double' : sides;
        const rate = Number(i.unitPrice).toFixed(0);
        const total = Number(i.lineTotal).toFixed(0);
        return `• ${i.product.name} ${size} ${gsm}gsm ${sidesLabel} x${i.quantity} @₹${rate} = ₹${total}`;
      }).join('\n');

      void this.whatsapp.sendOrderCreated({
        customerName: fullOrder.customer.businessName,
        customerPhone: fullOrder.customer.phone ?? '',
        orderNo: fullOrder.orderNumber,
        productDetails,
        totalAmount: totalAmount.toFixed(0),
        advancePaid: advancePaid.toFixed(0),
        balanceDue: balanceDue.toFixed(0),
        agentName: fullOrder.salesAgent?.fullName ?? 'Rareprint Team',
      });
    }

    return orderId;
  }

  async editOrder(orderId: string, body: any, userId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new Error('Order not found');
    if (order.status !== OrderStatus.PENDING_APPROVAL) {
      throw new Error('Only PENDING_APPROVAL orders can be edited');
    }

    const shippingParts = [
      body.customer?.address,
      body.customer?.city,
      body.customer?.state,
      body.customer?.pincode,
    ].filter(Boolean);

    await this.prisma.$transaction(async (tx) => {
      await tx.customer.update({
        where: { id: order.customerId },
        data: {
          businessName: body.customer?.name,
          contactPerson: body.customer?.name,
          phone: body.customer?.phone,
          email: body.customer?.email,
          shippingAddress: shippingParts.join(', '),
        },
      });

      await tx.orderItem.deleteMany({ where: { orderId } });

      const itemsData = body.items.map((i: any) => ({
        productId: i.productId,
        quantity: i.quantity,
        unitPrice: new Prisma.Decimal(i.unitPrice),
        lineDiscount: new Prisma.Decimal(0),
        taxRatePct: new Prisma.Decimal(0),
        taxAmount: new Prisma.Decimal(0),
        lineTotal: new Prisma.Decimal(i.lineTotal ?? i.quantity * i.unitPrice),
        artworkNotes: i.artworkNotes ?? null,
        productionNotes: i.productionNotes ?? null,
      }));

      const subtotal = itemsData.reduce(
        (s: Prisma.Decimal, row: any) => s.plus(row.lineTotal),
        new Prisma.Decimal(0),
      );

      await tx.order.update({
        where: { id: orderId },
        data: {
          notes: body.notes,
          subtotal,
          grandTotal: subtotal,
          items: { create: itemsData },
        },
      });
    });

    return { success: true };
  }

  async deleteOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new Error('Order not found');
    if (order.status !== OrderStatus.PENDING_APPROVAL) {
      throw new Error('Only PENDING_APPROVAL orders can be deleted');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.statusLog.deleteMany({ where: { orderId } });
      await tx.payment.deleteMany({ where: { orderId } });
      await tx.orderItem.deleteMany({ where: { orderId } });
      await tx.order.delete({ where: { id: orderId } });
    });

    return { success: true };
  }

  async addPayment(
    orderId: string,
    receivedById: string,
    data: { amount: number; method: string; paymentAccountId: string; referenceNumber?: string; notes?: string; paymentDate?: string },
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    const payment = await this.prisma.payment.create({
      data: {
        orderId,
        paymentAccountId: data.paymentAccountId,
        receivedById,
        amount: new Prisma.Decimal(data.amount),
        method: data.method as PaymentMethod ?? PaymentMethod.CASH,
        referenceNumber: data.referenceNumber,
        notes: data.notes,
        paymentDate: data.paymentDate ? new Date(data.paymentDate) : new Date(),
      },
      include: { paymentAccount: true },
    });

    const allPayments = await this.prisma.payment.findMany({ where: { orderId } });
    const totalPaid = allPayments.reduce((s, p) => s + Number(p.amount), 0);
    const grandTotal = Number(order.grandTotal);

    let paymentStatus: PaymentStatus;
    if (totalPaid >= grandTotal) paymentStatus = PaymentStatus.PAID;
    else if (totalPaid > 0) paymentStatus = PaymentStatus.PARTIALLY_PAID;
    else paymentStatus = PaymentStatus.PENDING;

    await this.prisma.order.update({ where: { id: orderId }, data: { paymentStatus } });

    if (order.customer.phone) {
      void this.whatsapp.sendPaymentReceived({
        customerName: order.customer.businessName,
        customerPhone: order.customer.phone,
        orderNo: order.orderNumber,
        amountReceived: Number(payment.amount),
        paymentMode: payment.method,
        referenceNo: payment.referenceNumber ?? '',
        orderTotal: grandTotal,
        totalPaid,
        balanceRemaining: Math.max(0, grandTotal - totalPaid),
      });
    }

    return payment;
  }

  async getPayments(orderId: string) {
    return this.prisma.payment.findMany({
      where: { orderId },
      include: { paymentAccount: true },
      orderBy: { paymentDate: 'desc' },
    });
  }

  async getStatusLogs(orderId: string) {
    const logs = await this.prisma.statusLog.findMany({
      where: { orderId },
      include: { changedBy: { select: { fullName: true, role: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return logs.map((l) => ({
      id: l.id,
      fromStatus: l.fromStatus,
      toStatus: l.toStatus,
      reason: l.reason,
      changedAt: l.createdAt.toISOString(),
      changedBy: l.changedBy?.fullName ?? 'System',
      role: (l.changedBy as any)?.role ?? '',
    }));
  }

  async getPaymentAccounts() {
    return this.prisma.paymentAccount.findMany({
      where: { isActive: true },
      select: { id: true, name: true, accountType: true, bankName: true },
    });
  }

  async submitForDispatch(
    orderId: string,
    agentId: string,
    data: { courierCharges: number; isCod: boolean; codAmount?: number; notes?: string; dispatchType?: string; transportName?: string; lrNumber?: string; transportChargesType?: string; transportBy?: string; awbNumber?: string; deliveryBoyName?: string; collectedByName?: string; collectedByPhone?: string },
  ) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');

    const dispatchNotes = [
      data.notes,
      `Courier charges: ₹${data.courierCharges}`,
      data.isCod ? `COD amount: ₹${data.codAmount ?? 0}` : 'Prepaid',
    ].filter(Boolean).join(' | ');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.PENDING_DISPATCH_APPROVAL,
          shippingCharge: new Prisma.Decimal(data.courierCharges),
          notes: dispatchNotes,
        },
      });

      await tx.statusLog.create({
        data: {
          orderId,
          fromStatus: order.status,
          toStatus: OrderStatus.PENDING_DISPATCH_APPROVAL,
          changedById: agentId,
          reason: `Agent submitted for dispatch. ${dispatchNotes}`,
        },
      });

      return updated;
    });
  }

  async getOrderItems(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { product: true } } },
    });
    if (!order) throw new NotFoundException('Order not found');

    const itemIds = order.items.map((i) => i.id);
    let designFilesMap: Record<string, any[]> = {};

    if (itemIds.length > 0) {
      const results = await this.prisma.$queryRawUnsafe<{ id: string; designFiles: any[] }[]>(
        `SELECT id, "designFiles" FROM "OrderItem" WHERE id IN (${itemIds.map((_, i) => `$${i + 1}`).join(',')})`,
        ...itemIds,
      );
      designFilesMap = Object.fromEntries(results.map((r) => [r.id, Array.isArray(r.designFiles) ? r.designFiles : []]));
    }

    return order.items.map((i) => ({
      id: i.id,
      productName: i.product.name,
      sku: i.product.sku,
      quantity: i.quantity,
      unitPrice: Number(i.unitPrice),
      lineTotal: Number(i.lineTotal),
      productionNotes: i.productionNotes,
      itemProductionStage: i.itemProductionStage,
      designFiles: summarizeDesignFiles(designFilesMap[i.id]),
    }));
  }

  async submitDispatchBatch(
    orderIds: string[],
    agentId: string,
    data: { courierCharges: number; isCod: boolean; codAmount?: number; notes?: string; dispatchType?: string; transportName?: string; lrNumber?: string; transportChargesType?: string; transportBy?: string; awbNumber?: string; deliveryBoyName?: string; collectedByName?: string; collectedByPhone?: string },
  ) {
    const results: string[] = [];
    for (const orderId of orderIds) {
      const order = await this.prisma.order.findUnique({ where: { id: orderId } });
      if (!order) continue;

      const dispatchTypeLine = data.dispatchType === 'TRANSPORT'
        ? `Transport: ${data.transportName ?? ''}, LR: ${data.lrNumber ?? ''}, ${data.transportChargesType ?? ''}, By: ${data.transportBy ?? ''}`
        : data.dispatchType === 'COURIER'
        ? `Courier: ${data.transportName ?? ''}, AWB: ${data.awbNumber ?? ''}, ${data.transportChargesType ?? ''}, By: ${data.transportBy ?? ''}`
        : data.dispatchType === 'BY_HAND'
        ? `By Hand: ${data.deliveryBoyName ?? ''}`
        : data.dispatchType === 'SELF_COLLECTED'
        ? `Self Collected by: ${data.collectedByName ?? ''} ${data.collectedByPhone ?? ''}`
        : '';

      const dispatchNotes = [
        data.notes,
        dispatchTypeLine,
        `Courier charges: ₹${data.courierCharges}`,
        data.isCod ? `COD: ₹${data.codAmount ?? 0} to be collected on delivery` : 'Prepaid',
        orderIds.length > 1 ? `Batch with: ${orderIds.filter((id) => id !== orderId).join(', ')}` : '',
      ].filter(Boolean).join(' | ');

      await this.prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: orderId },
          data: {
            status: OrderStatus.PENDING_DISPATCH_APPROVAL,
            shippingCharge: new Prisma.Decimal(data.courierCharges / orderIds.length),
            notes: dispatchNotes,
          },
        });

        await tx.statusLog.create({
          data: {
            orderId,
            fromStatus: order.status,
            toStatus: OrderStatus.PENDING_DISPATCH_APPROVAL,
            changedById: agentId,
            reason: `Agent submitted for dispatch. ${dispatchNotes}`,
          },
        });

        const fullOrder = await tx.order.findUnique({
          where: { id: orderId },
          include: { customer: true, salesAgent: { select: { fullName: true } }, items: { include: { product: true } } },
        });

        if (fullOrder?.customer.phone) {
          const product = fullOrder.items.map((i) => i.product.name).join(', ');
          void this.whatsapp.sendOrderUpdate({
            customerName: fullOrder.customer.businessName,
            customerPhone: fullOrder.customer.phone,
            orderNo: fullOrder.orderNumber,
            product,
            status: `Shipment being arranged | ${dispatchNotes}`,
            agentName: fullOrder.salesAgent?.fullName ?? 'Rareprint Team',
          });
        }
      });

      results.push(orderId);
    }

    return { success: true, processedOrders: results.length };
  }

  async getOrdersWithReadyItems() {
    const EXCLUDED_STATUSES = [
      OrderStatus.PENDING_DISPATCH_APPROVAL,
      OrderStatus.DISPATCHED,
      OrderStatus.DELIVERED,
      OrderStatus.CANCELLED,
    ];

    const orders = await this.prisma.order.findMany({
      where: {
        status: { notIn: EXCLUDED_STATUSES },
        items: { some: { itemProductionStage: 'READY_FOR_DISPATCH' } },
      },
      orderBy: { orderDate: 'desc' },
      select: {
        id: true,
        orderNumber: true,
        customerId: true,
        salesAgentId: true,
        orderDate: true,
        status: true,
        grandTotal: true,
        customer: true,
        salesAgent: { select: { id: true, fullName: true } },
        items: {
          select: {
            id: true,
            quantity: true,
            unitPrice: true,
            lineTotal: true,
            productionNotes: true,
            itemProductionStage: true,
            product: {
              select: {
                name: true,
                sizeInches: true,
                gsm: true,
                sides: true,
              }
            }
          }
        },
        payments: true,
      },
    });
    const designFileCounts = await this.getDesignFileCounts(
      orders.flatMap((o) => o.items.map((i) => i.id)),
    );

    return orders.map((o) => {
      const total = Number(o.grandTotal);
      const advancePaid = o.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      const balanceDue = Math.max(0, total - advancePaid);
      const readyCount = o.items.filter((i) => i.itemProductionStage === 'READY_FOR_DISPATCH').length;

      return {
        id: o.id,
        orderNo: o.orderNumber,
        customerName: o.customer.businessName,
        customerPhone: o.customer.phone ?? null,
        salesAgentName: o.salesAgent?.fullName ?? null,
        products: o.items.map((i) => `${i.product.name} ×${i.quantity}`).join(', '),
        totalAmount: total,
        advancePaid,
        balanceDue,
        status: o.status,
        date: o.orderDate.toISOString(),
        readyItemsCount: readyCount,
        totalItemsCount: o.items.length,
        itemDetails: buildItemDetails(o.items as any),
        items: o.items.map((i) => ({
          id: i.id,
          productName: i.product.name,
          itemProductionStage: i.itemProductionStage,
          designFiles: Array.from({ length: designFileCounts[i.id] ?? 0 }),
        })),
      };
    });
  }
}



