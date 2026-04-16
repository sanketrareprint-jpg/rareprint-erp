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
import { CreateOrderDto } from './dto/create-order.dto';

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function buildItemDetails(items: Array<{
  product: { name: string };
  productionNotes: string | null;
  quantity: number;
  unitPrice: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  itemProductionStage: string;
}>) {
  return items.map((i) => {
    const size = i.productionNotes?.match(/Size:\s*([^,|]+)/)?.[1]?.trim() ?? null;
    const gsm = i.productionNotes?.match(/GSM:\s*([^,|]+)/)?.[1]?.trim() ?? null;
    const sides = i.productionNotes?.match(/Sides:\s*([^,|]+)/)?.[1]?.trim() ?? null;
    const sidesLabel = sides === 'SINGLE_SIDE' ? 'Single' : sides === 'DOUBLE_SIDE' ? 'Double' : sides;
    return {
      productName: i.product.name,
      size: size ?? null,
      gsm: gsm ?? null,
      sides: sidesLabel ?? null,
      quantity: i.quantity,
      unitPrice: Number(i.unitPrice),
      lineTotal: Number(i.lineTotal),
      itemProductionStage: i.itemProductionStage,
    };
  });
}

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Generate next RP/N order number ────────────────────────────────────────
  private async generateOrderNumber(): Promise<string> {
    // Count all existing orders to get the next sequence number
    const count = await this.prisma.order.count();
    const seq = count + 1;
    return `RP/${seq}`;
  }

  async findAllForTable() {
    const orders = await this.prisma.order.findMany({
      orderBy: { orderDate: 'desc' },
      include: {
        customer: true,
        salesAgent: { select: { id: true, fullName: true } },
        items: {
          include: {
            product: true,
          },
        },
        payments: true,
      },
    });

    return orders.map((o) => {
      const total = Number(o.grandTotal);
      const advancePaid = o.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      const balanceDue = Math.max(0, total - advancePaid);
      const productsSummary = o.items.map((i) => {
        const size = i.productionNotes?.match(/Size:\s*([^,|]+)/)?.[1]?.trim();
        const gsm = i.productionNotes?.match(/GSM:\s*([^,|]+)/)?.[1]?.trim();
        const sides = i.productionNotes?.match(/Sides:\s*([^,|]+)/)?.[1]?.trim();
        const sidesLabel = sides === 'SINGLE_SIDE' ? 'Single' : sides === 'DOUBLE_SIDE' ? 'Double' : sides;
        const specs = [size, gsm ? `${gsm}gsm` : null, sidesLabel].filter(Boolean).join(', ');
        return `${i.product.name} ×${i.quantity}${specs ? ` (${specs})` : ''}`;
      }).join(' | ');

      return {
        id: o.id,
        orderNo: o.orderNumber,
        customerName: o.customer.businessName,
        customerPhone: o.customer.phone ?? null,
        salesAgentName: o.salesAgent?.fullName ?? null,
        products: productsSummary,
        totalAmount: total,
        advancePaid,
        balanceDue,
        status: o.status,
        date: o.orderDate.toISOString(),
        itemDetails: buildItemDetails(o.items),
        // Return items with IDs so agent can upload design files per item
        items: o.items.map((i) => ({
          id: i.id,
          productName: i.product.name,
          itemProductionStage: i.itemProductionStage,
        })),
      };
    });
  }

  async create(dto: CreateOrderDto, salesAgentId: string) {
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

    const shippingParts = [
      dto.customer.address,
      dto.customer.city,
      dto.customer.state,
      dto.customer.pincode,
    ].filter(Boolean);
    const shippingAddress = shippingParts.length > 0 ? shippingParts.join(', ') : undefined;

    const customerCode = `CUST-${Date.now()}-${randomSuffix()}`;
    // Use RP/N format for new orders
    const orderNumber = await this.generateOrderNumber();

    const itemsData = dto.items.map((i) => {
      const lineTotal = new Prisma.Decimal(i.quantity * i.unitPrice);
      return {
        productId: i.productId,
        quantity: i.quantity,
        unitPrice: new Prisma.Decimal(i.unitPrice),
        lineDiscount: new Prisma.Decimal(0),
        taxRatePct: new Prisma.Decimal(0),
        taxAmount: new Prisma.Decimal(0),
        lineTotal,
        artworkNotes: i.artworkNotes ?? null,
        productionNotes: i.productionNotes ?? null,
      };
    });

    const subtotal = itemsData.reduce((s, row) => s.plus(row.lineTotal), new Prisma.Decimal(0));
    const grandTotal = subtotal;

    const advance = dto.advanceAmount ?? 0;
    let paymentStatus: PaymentStatus = PaymentStatus.PENDING;
    if (advance > 0) {
      const cmp = new Prisma.Decimal(advance).comparedTo(grandTotal);
      if (cmp >= 0) paymentStatus = PaymentStatus.PAID;
      else paymentStatus = PaymentStatus.PARTIALLY_PAID;
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
          customerId: customer.id,
          salesAgentId,
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

      if (advance > 0) {
        const account = dto.paymentAccountId
          ? await tx.paymentAccount.findUnique({ where: { id: dto.paymentAccountId } })
          : await tx.paymentAccount.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } });
        if (!account) {
          throw new BadRequestException(
            'No active payment account is configured. Add one before recording advance payments.',
          );
        }
        await tx.payment.create({
          data: {
            orderId: order.id,
            paymentAccountId: account.id,
            receivedById: salesAgentId,
            amount: new Prisma.Decimal(advance),
            method: dto.paymentMethod ?? PaymentMethod.CASH,
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

    const rows = await this.findAllForTable();
    const row = rows.find((r) => r.id === orderId);
    if (!row) throw new NotFoundException('Order was created but could not be loaded');
    return row;
  }

  async addPayment(
    orderId: string,
    receivedById: string,
    data: {
      amount: number;
      method: string;
      paymentAccountId: string;
      referenceNumber?: string;
      notes?: string;
      paymentDate?: string;
    },
  ) {
    const { PaymentMethod, Prisma } = await import('@prisma/client');
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');

    const payment = await this.prisma.payment.create({
      data: {
        orderId,
        paymentAccountId: data.paymentAccountId,
        receivedById,
        amount: new Prisma.Decimal(data.amount),
        method: data.method as typeof PaymentMethod[keyof typeof PaymentMethod],
        referenceNumber: data.referenceNumber,
        notes: data.notes,
        paymentDate: data.paymentDate ? new Date(data.paymentDate) : new Date(),
      },
      include: { paymentAccount: true },
    });

    const allPayments = await this.prisma.payment.findMany({ where: { orderId } });
    const totalPaid = allPayments.reduce((s, p) => s + Number(p.amount), 0);
    const grandTotal = Number(order.grandTotal);

    let paymentStatus;
    const { PaymentStatus } = await import('@prisma/client');
    if (totalPaid >= grandTotal) paymentStatus = PaymentStatus.PAID;
    else if (totalPaid > 0) paymentStatus = PaymentStatus.PARTIALLY_PAID;
    else paymentStatus = PaymentStatus.PENDING;

    await this.prisma.order.update({ where: { id: orderId }, data: { paymentStatus } });
    return payment;
  }

  async getPayments(orderId: string) {
    return this.prisma.payment.findMany({
      where: { orderId },
      include: { paymentAccount: true },
      orderBy: { paymentDate: 'desc' },
    });
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
    data: { courierCharges: number; isCod: boolean; codAmount?: number; notes?: string },
  ) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');

    const dispatchNotes = [
      data.notes,
      `Courier charges: ₹${data.courierCharges}`,
      data.isCod ? `COD Amount: ₹${data.codAmount ?? 0}` : 'Prepaid',
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
    return order.items.map((i) => ({
      id: i.id,
      productName: i.product.name,
      sku: i.product.sku,
      quantity: i.quantity,
      unitPrice: Number(i.unitPrice),
      lineTotal: Number(i.lineTotal),
      productionNotes: i.productionNotes,
      itemProductionStage: i.itemProductionStage,
    }));
  }

  async submitDispatchBatch(
    orderIds: string[],
    agentId: string,
    data: {
      courierCharges: number;
      isCod: boolean;
      codAmount?: number;
      paymentMethod?: string;
      paymentAccountId?: string;
      paymentReference?: string;
      notes?: string;
    },
  ) {
    const results: string[] = [];
    for (const orderId of orderIds) {
      const order = await this.prisma.order.findUnique({ where: { id: orderId } });
      if (!order) continue;

      const dispatchNotes = [
        data.notes,
        `Courier: ₹${data.courierCharges}`,
        data.isCod ? `COD: ₹${data.codAmount}` : 'Prepaid',
        orderIds.length > 1 ? `Batch with: ${orderIds.filter(id => id !== orderId).join(', ')}` : '',
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

        if (!data.isCod && data.paymentAccountId) {
          const payments = await tx.payment.findMany({ where: { orderId } });
          const paid = payments.reduce((s, p) => s + Number(p.amount), 0);
          const balance = Number(order.grandTotal) - paid;
          if (balance > 0) {
            await tx.payment.create({
              data: {
                orderId,
                paymentAccountId: data.paymentAccountId,
                receivedById: agentId,
                amount: new Prisma.Decimal(balance),
                method: (data.paymentMethod ?? 'CASH') as PaymentMethod,
                referenceNumber: data.paymentReference,
                notes: 'Balance received at dispatch',
              },
            });
          }
        }

        await tx.statusLog.create({
          data: {
            orderId,
            fromStatus: order.status,
            toStatus: OrderStatus.PENDING_DISPATCH_APPROVAL,
            changedById: agentId,
            reason: dispatchNotes,
          },
        });
      });

      results.push(orderId);
    }
    return { success: true, processedOrders: results.length };
  }

  async getOrdersWithReadyItems() {
    const EXCLUDED_STATUSES = [
      OrderStatus.PENDING_DISPATCH_APPROVAL,
      OrderStatus.READY_FOR_DISPATCH,
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
      include: {
        customer: true,
        salesAgent: { select: { id: true, fullName: true } },
        items: { include: { product: true } },
        payments: true,
      },
    });

    return orders.map((o) => {
      const total = Number(o.grandTotal);
      const advancePaid = o.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      const balanceDue = Math.max(0, total - advancePaid);
      const readyCount = o.items.filter(i => i.itemProductionStage === 'READY_FOR_DISPATCH').length;

      return {
        id: o.id,
        orderNo: o.orderNumber,
        customerName: o.customer.businessName,
        customerPhone: o.customer.phone ?? null,
        salesAgentName: o.salesAgent?.fullName ?? null,
        customerId: o.customer.id,
        products: o.items.map((i) => `${i.product.name} (×${i.quantity})`).join(', '),
        totalAmount: total,
        advancePaid,
        balanceDue,
        status: o.status,
        date: o.orderDate.toISOString(),
        readyItemsCount: readyCount,
        totalItemsCount: o.items.length,
        itemDetails: buildItemDetails(o.items),
        items: o.items.map((i) => ({
          id: i.id,
          productName: i.product.name,
          itemProductionStage: i.itemProductionStage,
        })),
      };
    });
  }
}