// backend/src/accounts/accounts.service.ts
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus, PaymentMethod } from '@prisma/client';
import { WhatsAppService } from '../whatsapp/whatsapp.service';

type AccountsUser = { id: string; role: string };

type UpdatePendingPaymentDto = {
  amount?: number;
  method?: PaymentMethod;
  paymentAccountId?: string;
  referenceNumber?: string | null;
  notes?: string | null;
  paymentDate?: string;
};

function assertAccountsUser(user: AccountsUser) {
  if (!['ADMIN', 'ACCOUNTS'].includes(user.role)) {
    throw new ForbiddenException('Accounts approval is restricted to accounts/admin users');
  }
}

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
        customerPhone: order.customer.phone ?? '',
        customerEmail: order.customer.email,
        shippingAddress: order.customer.shippingAddress ?? order.customer.billingAddress ?? null,
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
      const balanceDue = grandTotal - totalPaid;
      const customerCredit = Math.max(0, totalPaid - grandTotal);

      const courierMatch      = order.notes?.match(/Courier(?:\s+charges)?:\s*₹?([\d.]+)/i);
      const paymentTypeMatch  = order.notes?.match(/\b(COD|Prepaid)\b/i);
      const codAmountMatch     = order.notes?.match(/COD(?:\s+amount)?:\s*₹?([\d.]+)/i);
      const courierCharge = courierMatch ? parseFloat(courierMatch[1]) : null;
      const courierCreditApplied = courierCharge == null ? 0 : Math.min(customerCredit, courierCharge);
      const netCourierCharge = courierCharge == null ? null : courierCharge - courierCreditApplied;

      return {
        id: order.id,
        orderNo: order.orderNumber,
        customerName:  order.customer.businessName,
        customerPhone: order.customer.phone ?? '',
        customerEmail: order.customer.email,
        shippingAddress: order.customer.shippingAddress ?? order.customer.billingAddress ?? null,
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
        courierCharge,
        courierCreditApplied,
        netCourierCharge,
        paymentType:   paymentTypeMatch ? paymentTypeMatch[1].toUpperCase() : null,
        codAmount:     codAmountMatch ? parseFloat(codAmountMatch[1]) : null,
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
  async approveOrder(orderId: string, user: AccountsUser) {
    assertAccountsUser(user);
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
        salesAgent: { select: { fullName: true } },
        items: { include: { product: true } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== OrderStatus.PENDING_APPROVAL) {
      throw new BadRequestException('Only pending accounts approval orders can be approved');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const approved = await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.APPROVED },
      });
      await tx.statusLog.create({
        data: {
          orderId,
          fromStatus: OrderStatus.PENDING_APPROVAL,
          toStatus: OrderStatus.APPROVED,
          changedById: user.id,
          reason: 'Accounts approved order',
        },
      });
      return approved;
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
  async approveDispatch(orderId: string, user: AccountsUser) {
    assertAccountsUser(user);
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

    const updated = await this.prisma.$transaction(async (tx) => {
      const approved = await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.READY_FOR_DISPATCH },
      });
      await tx.statusLog.create({
        data: {
          orderId,
          fromStatus: OrderStatus.PENDING_DISPATCH_APPROVAL,
          toStatus: OrderStatus.READY_FOR_DISPATCH,
          changedById: user.id,
          reason: 'Accounts approved dispatch',
        },
      });
      return approved;
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
      paymentAccountId: p.paymentAccountId,
      paymentAccountName: p.paymentAccount.name,
      receivedByName: p.receivedBy?.fullName ?? null,
      verificationStatus: p.verificationStatus,
      createdAt: p.createdAt,
    }));
  }

  async getPaymentAccounts() {
    return this.prisma.paymentAccount.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        bankName: true,
        accountType: true,
        upiId: true,
      },
    });
  }

  async getCustomerOutstanding() {
    const rows = await this.prisma.$queryRaw<any[]>`
      WITH order_paid AS (
        SELECT
          p."orderId",
          COALESCE(SUM(p.amount), 0) AS "paidAmount"
        FROM "Payment" p
        WHERE p."verificationStatus" = 'VERIFIED'
        GROUP BY p."orderId"
      ),
      order_balances AS (
        SELECT
          o.id,
          o."orderNumber",
          o."customerId",
          o."orderDate",
          o.status,
          o."grandTotal",
          COALESCE(op."paidAmount", 0) AS "paidAmount",
          GREATEST(o."grandTotal" - COALESCE(op."paidAmount", 0), 0) AS "balanceAmount"
        FROM "Order" o
        LEFT JOIN order_paid op ON op."orderId" = o.id
        WHERE o.status NOT IN ('DRAFT', 'CANCELLED')
      ),
      order_item_statuses AS (
        SELECT
          oi."orderId",
          STRING_AGG(DISTINCT oi."itemProductionStage"::text, ', ' ORDER BY oi."itemProductionStage"::text) AS "productStatuses"
        FROM "OrderItem" oi
        GROUP BY oi."orderId"
      )
      SELECT
        c.id AS "customerId",
        c."businessName" AS "customerName",
        c.phone AS "customerPhone",
        c.email AS "customerEmail",
        SUM(ob."grandTotal") AS "totalAmount",
        SUM(ob."paidAmount") AS "paidAmount",
        SUM(ob."balanceAmount") AS "outstandingAmount",
        COUNT(*)::int AS "orderCount",
        MAX(ob."orderDate") AS "lastOrderDate",
        STRING_AGG(ob."orderNumber", ', ' ORDER BY ob."orderDate" DESC) AS "orderNumbers",
        STRING_AGG(DISTINCT ob.status::text, ', ' ORDER BY ob.status::text) AS "orderStatuses",
        STRING_AGG(ob."orderNumber", ', ' ORDER BY ob."orderDate" DESC)
          FILTER (WHERE ob.status IN ('READY_FOR_DISPATCH', 'DELIVERED') AND ob."balanceAmount" > 0) AS "reminderOrderNumbers",
        COALESCE(
          SUM(ob."balanceAmount")
            FILTER (WHERE ob.status IN ('READY_FOR_DISPATCH', 'DELIVERED') AND ob."balanceAmount" > 0),
          0
        ) AS "reminderAmount",
        STRING_AGG(DISTINCT ois."productStatuses", ', ') AS "productStatuses"
      FROM order_balances ob
      JOIN "Customer" c ON c.id = ob."customerId"
      LEFT JOIN order_item_statuses ois ON ois."orderId" = ob.id
      GROUP BY c.id, c."businessName", c.phone, c.email
      HAVING SUM(ob."balanceAmount") > 0
      ORDER BY SUM(ob."balanceAmount") DESC, c."businessName" ASC
    `;

    return rows.map(row => ({
      ...row,
      totalAmount: Number(row.totalAmount),
      paidAmount: Number(row.paidAmount),
      outstandingAmount: Number(row.outstandingAmount),
      reminderAmount: Number(row.reminderAmount),
      canSendReminder: Number(row.reminderAmount) > 0 && Boolean(row.customerPhone),
      productStatuses: Array.from(new Set(String(row.productStatuses ?? '').split(', ').filter(Boolean))).join(', '),
      orderStatuses: Array.from(new Set(String(row.orderStatuses ?? '').split(', ').filter(Boolean))).join(', '),
      reminderOrderNumbers: row.reminderOrderNumbers ?? '',
    }));
  }

  async sendBalanceReminder(customerId: string, user: AccountsUser) {
    assertAccountsUser(user);
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        orders: {
          where: { status: { in: [OrderStatus.READY_FOR_DISPATCH, OrderStatus.DELIVERED] } },
          include: {
            salesAgent: { select: { fullName: true } },
            payments: { where: { verificationStatus: 'VERIFIED' } },
          },
          orderBy: { orderDate: 'desc' },
        },
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    if (!customer.phone) throw new BadRequestException('Customer has no phone number');

    const eligibleOrders = customer.orders
      .map(order => {
        const paid = order.payments.reduce((sum, p) => sum + Number(p.amount), 0);
        const balance = Math.max(0, Number(order.grandTotal) - paid);
        return { order, balance };
      })
      .filter(({ balance }) => balance > 0);

    if (eligibleOrders.length === 0) {
      throw new BadRequestException('No Ready or Delivered order has balance due for this customer');
    }

    const balanceAmount = eligibleOrders.reduce((sum, row) => sum + row.balance, 0);
    const orderNos = eligibleOrders.map(row => row.order.orderNumber).join(', ');
    const agentName = eligibleOrders[0]?.order.salesAgent?.fullName ?? 'Rareprint Team';
    const sent = await this.whatsapp.sendBalancePaymentReminder({
      customerName: customer.businessName,
      customerPhone: customer.phone,
      orderNos,
      balanceAmount,
      agentName,
    });

    if (!sent) throw new BadRequestException('Could not send WhatsApp reminder');
    return { success: true, orderNos, balanceAmount };
  }

  async updatePendingPayment(id: string, user: AccountsUser, data: UpdatePendingPaymentDto) {
    assertAccountsUser(user);
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment) throw new NotFoundException('Payment receipt not found');
    if (payment.verificationStatus !== 'PENDING_VERIFICATION') {
      throw new BadRequestException('Only pending receipts can be edited');
    }

    const updateData: Record<string, unknown> = {};
    if (data.amount !== undefined) {
      const amount = Number(data.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new BadRequestException('Payment amount must be greater than zero');
      }
      updateData.amount = amount;
    }

    if (data.method !== undefined) {
      if (!Object.values(PaymentMethod).includes(data.method)) {
        throw new BadRequestException('Invalid payment method');
      }
      updateData.method = data.method;
    }

    if (data.paymentAccountId !== undefined) {
      const account = await this.prisma.paymentAccount.findFirst({
        where: { id: data.paymentAccountId, isActive: true },
      });
      if (!account) throw new BadRequestException('Select an active payment account');
      updateData.paymentAccountId = data.paymentAccountId;
    }

    if (data.paymentDate !== undefined) {
      const paymentDate = new Date(data.paymentDate);
      if (Number.isNaN(paymentDate.getTime())) {
        throw new BadRequestException('Invalid payment date');
      }
      updateData.paymentDate = paymentDate;
    }

    if (data.referenceNumber !== undefined) {
      updateData.referenceNumber = data.referenceNumber?.trim() || null;
    }
    if (data.notes !== undefined) {
      updateData.notes = data.notes?.trim() || null;
    }

    return this.prisma.payment.update({
      where: { id },
      data: updateData,
      include: { paymentAccount: true },
    });
  }

  async verifyPayment(id: string, verifiedById: string, referenceNumber?: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        order: {
          include: {
            customer: true,
            payments: { where: { verificationStatus: 'VERIFIED' } },
          },
        },
        paymentAccount: true,
      },
    });
    if (!payment) throw new NotFoundException('Payment receipt not found');
    if (payment.verificationStatus !== 'PENDING_VERIFICATION') {
      throw new BadRequestException('Only pending receipts can be verified');
    }

    const updated = await this.prisma.payment.update({
      where: { id },
      data: {
        verificationStatus: 'VERIFIED',
        verifiedById,
        verifiedAt: new Date(),
        ...(referenceNumber !== undefined ? { referenceNumber: referenceNumber.trim() || null } : {}),
      },
    });

    return updated;
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
async getPaymentHistory() {
  const payments = await this.prisma.$queryRaw<any[]>`
    SELECT 
      p.id, p."orderId", p.amount, p.method, p."referenceNumber",
      p."paymentDate", p."verificationStatus", p."verifiedAt", p."rejectionReason",
      o."orderNumber" as "orderNo",
      c."businessName" as "customerName",
      c.phone as "customerPhone",
      sa."fullName" as "salesAgentName",
      pa.name as "paymentAccountName",
      vb."fullName" as "verifiedByName"
    FROM "Payment" p
    JOIN "Order" o ON p."orderId" = o.id
    JOIN "Customer" c ON o."customerId" = c.id
    LEFT JOIN "User" sa ON o."salesAgentId" = sa.id
    JOIN "PaymentAccount" pa ON p."paymentAccountId" = pa.id
    LEFT JOIN "User" vb ON p."verifiedById" = vb.id
    WHERE p."verificationStatus" IN ('VERIFIED', 'REJECTED')
    ORDER BY p."verifiedAt" DESC
  `;
  return payments.map(p => ({
    ...p,
    amount: Number(p.amount),
  }));
}
   
}
