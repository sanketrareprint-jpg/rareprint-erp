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

  async getVendorStatements() {
    const jobWorks = await this.prisma.jobWork.findMany({
      include: {
        vendor: true,
        orderItem: {
          include: {
            product: true,
            order: { include: { customer: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const sheetStages = await this.prisma.sheetStageVendor.findMany({
      include: {
        vendor: true,
        sheet: {
          include: {
            items: {
              include: {
                orderItem: {
                  include: {
                    product: true,
                    order: { include: { customer: true } },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const jwEntries = jobWorks.map(jw => ({
      id: jw.id,
      type: 'JOBWORK' as const,
      vendorId: jw.vendorId,
      vendorName: jw.vendor.name,
      description: jw.description,
      cost: Number(jw.cost),
      vendorInvoiceNo: jw.vendorInvoiceNo,
      isPaid: jw.isPaid,
      paidAt: jw.paidAt,
      createdAt: jw.createdAt,
      status: jw.status,
      productName: jw.orderItem.product.name,
      productSku: jw.orderItem.product.sku,
      quantity: jw.orderItem.quantity,
      orderNo: (jw.orderItem.order as any).orderNumber,
      customerName: (jw.orderItem.order as any).customer.businessName,
      productionNotes: jw.orderItem.productionNotes,
    }));

    const ssEntries = sheetStages.map(ss => ({
      id: ss.id,
      type: 'SHEET_STAGE' as const,
      vendorId: ss.vendorId,
      vendorName: ss.vendor.name,
      description: ss.description,
      cost: Number(ss.cost),
      vendorInvoiceNo: ss.vendorInvoiceNo,
      isPaid: ss.isPaid,
      paidAt: ss.paidAt,
      createdAt: ss.createdAt,
      status: null,
      stage: ss.stage,
      sheetNo: ss.sheet.sheetNo,
      sheetGsm: ss.sheet.gsm,
      sheetSize: ss.sheet.sizeInches,
      products: ss.sheet.items.map(si => ({
        productName: si.orderItem.product.name,
        orderNo: (si.orderItem.order as any).orderNumber,
        customerName: (si.orderItem.order as any).customer.businessName,
        quantity: si.quantityOnSheet,
      })),
    }));

    return [...jwEntries, ...ssEntries].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async markJobWorkPaid(id: string) {
    return this.prisma.jobWork.update({
      where: { id },
      data: { isPaid: true, paidAt: new Date() },
    });
  }

  async markSheetStagePaid(id: string) {
    return this.prisma.sheetStageVendor.update({
      where: { id },
      data: { isPaid: true, paidAt: new Date() },
    });
  }


  async getPendingPayments() {
    const payments = await this.prisma.payment.findMany({
      where: { verificationStatus: 'PENDING_VERIFICATION' },
      include: {
        order: { include: { customer: true, salesAgent: { select: { fullName: true } } } },
        paymentAccount: true,
        receivedBy: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return payments.map(p => ({
      id: p.id,
      orderId: p.orderId,
      orderNo: (p.order as any).orderNumber,
      customerName: (p.order as any).customer.businessName,
      customerPhone: (p.order as any).customer.phone,
      salesAgentName: (p.order as any).salesAgent?.fullName ?? null,
      amount: Number(p.amount),
      method: p.method,
      referenceNumber: p.referenceNumber,
      notes: p.notes,
      paymentDate: p.paymentDate,
      paymentAccountName: p.paymentAccount.name,
      receivedByName: p.receivedBy?.fullName ?? null,
      verificationStatus: p.verificationStatus,
      createdAt: p.createdAt,
    }));
  }

  async verifyPayment(id: string, verifiedById: string) {
    return this.prisma.payment.update({
      where: { id },
      data: {
        verificationStatus: 'VERIFIED',
        verifiedById,
        verifiedAt: new Date(),
      },
    });
  }

  async rejectPayment(id: string, verifiedById: string, reason: string) {
    return this.prisma.payment.update({
      where: { id },
      data: {
        verificationStatus: 'REJECTED',
        verifiedById,
        verifiedAt: new Date(),
        rejectionReason: reason,
      },
    });
  }


}