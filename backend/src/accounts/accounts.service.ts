// backend/src/accounts/accounts.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus } from '@prisma/client';
import { WhatsAppService } from '../whatsapp/whatsapp.service';

@Injectable()
export class AccountsService {
  constructor(
    private prisma: PrismaService,
    private whatsapp: WhatsAppService,
  ) {}

  async getPendingOrders() {
    const orders = await this.prisma.order.findMany({
      where: { status: OrderStatus.PENDING_APPROVAL },
      include: {
        customer: true,
        salesAgent: { select: { id: true, fullName: true } },
        items: { include: { product: true } },
        payments: {
          include: { paymentAccount: true },
          orderBy: { paymentDate: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return orders.map((order) => {
      const totalPaid  = order.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      const grandTotal = Number(order.grandTotal);
      const balanceDue = Math.max(0, grandTotal - totalPaid);

      return {
        id: order.id,
        orderNo: order.orderNumber,
        customerName:  order.customer.businessName,
        customerPhone: order.customer.phone,
        customerEmail: order.customer.email,
        salesAgentName: order.salesAgent?.fullName ?? null,
        customerAddress: [
          order.customer.billingAddress,
          order.customer.shippingAddress,
        ].filter(Boolean).join(' | ') || null,
        products: order.items.map((i) => `${i.product.name} (×${i.quantity})`).join(', '),
        items: order.items.map((i) => ({
          productName:     i.product.name,
          sku:             i.product.sku,
          quantity:        i.quantity,
          unitPrice:       Number(i.unitPrice),
          lineTotal:       Number(i.lineTotal),
          productionNotes: i.productionNotes,
          artworkNotes:    i.artworkNotes,
        })),
        totalAmount: grandTotal,
        totalPaid,
        balanceDue,
        orderDate: order.orderDate.toISOString(),
        notes: order.notes,
        payments: order.payments.map((p) => ({
          id: p.id,
          date: p.paymentDate.toISOString(),
          amount: Number(p.amount),
          method: p.method,
          referenceNumber: p.referenceNumber,
          notes: p.notes,
          accountName: p.paymentAccount.name,
        })),
      };
    });
  }

  async getPendingDispatchOrders() {
    const orders = await this.prisma.order.findMany({
      where: { status: OrderStatus.PENDING_DISPATCH_APPROVAL },
      include: {
        customer: true,
        salesAgent: { select: { id: true, fullName: true } },
        items: { include: { product: true } },
        payments: {
          include: { paymentAccount: true },
          orderBy: { paymentDate: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return orders.map((order) => {
      const totalPaid  = order.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      const grandTotal = Number(order.grandTotal);
      const balanceDue = Math.max(0, grandTotal - totalPaid);

      const courierMatch      = order.notes?.match(/Courier:\s*₹?([\d.]+)/);
      const paymentTypeMatch  = order.notes?.match(/\b(COD|Prepaid)\b/i);

      return {
        id: order.id,
        orderNo: order.orderNumber,
        customerName:  order.customer.businessName,
        customerPhone: order.customer.phone,
        customerEmail: order.customer.email,
        salesAgentName: order.salesAgent?.fullName ?? null,
        items: order.items.map((i) => ({
          productName:     i.product.name,
          sku:             i.product.sku,
          quantity:        i.quantity,
          unitPrice:       Number(i.unitPrice),
          lineTotal:       Number(i.lineTotal),
          productionNotes: i.productionNotes,
          artworkNotes:    i.artworkNotes,
        })),
        totalAmount: grandTotal,
        totalPaid,
        balanceDue,
        orderDate: order.orderDate.toISOString(),
        notes: order.notes,
        courierCharge: courierMatch ? parseFloat(courierMatch[1]) : null,
        paymentType:   paymentTypeMatch ? paymentTypeMatch[1].toUpperCase() : null,
        payments: order.payments.map((p) => ({
          id: p.id,
          date: p.paymentDate.toISOString(),
          amount: Number(p.amount),
          method: p.method,
          referenceNumber: p.referenceNumber,
          notes: p.notes,
          accountName: p.paymentAccount.name,
        })),
      };
    });
  }

  // ── Approve order → WhatsApp "Approved ✅" ────────────────────────────────
  async approveOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
        salesAgent: { select: { fullName: true } },
        items: { include: { product: true } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.APPROVED },
    });

    // Fire-and-forget WhatsApp
    void this.whatsapp.sendOrderUpdate({
      customerName:  order.customer.businessName,
      customerPhone: order.customer.phone ?? '',
      orderNo:       order.orderNumber,
      product:       order.items.map(i => i.product.name).join(', '),
      status:        WhatsAppService.statusLabel(OrderStatus.APPROVED),
      agentName:     order.salesAgent?.fullName ?? 'Rareprint Team',
    });

    return updated;
  }

  async rejectOrder(orderId: string, reason: string) {
    return this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.CANCELLED },
    });
  }

  // ── Approve dispatch → WhatsApp "Ready for Dispatch 📦" ──────────────────
  async approveDispatch(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
        salesAgent: { select: { fullName: true } },
        items: { include: { product: true } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== OrderStatus.PENDING_DISPATCH_APPROVAL) {
      throw new NotFoundException('Order is not pending dispatch approval');
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.READY_FOR_DISPATCH },
    });

    // Fire-and-forget WhatsApp
    void this.whatsapp.sendOrderUpdate({
      customerName:  order.customer.businessName,
      customerPhone: order.customer.phone ?? '',
      orderNo:       order.orderNumber,
      product:       order.items.map(i => i.product.name).join(', '),
      status:        WhatsAppService.statusLabel(OrderStatus.READY_FOR_DISPATCH),
      agentName:     order.salesAgent?.fullName ?? 'Rareprint Team',
    });

    return updated;
  }

  async rejectDispatch(orderId: string, reason: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    return this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.APPROVED },
    });
  }
}