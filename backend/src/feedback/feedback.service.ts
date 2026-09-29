// backend/src/feedback/feedback.service.ts
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { sanitizePhone } from '../orders/orders.service';
import {
  FEEDBACK_WINDOW_DAYS,
  FeedbackBody,
  agentLeadTemplateParams,
  hasSalesLead,
  validateFeedback,
} from './feedback.calc';

export type FeedbackUser = {
  id: string;
  role?: string;
  fullName?: string | null;
};

const FEEDBACK_ROLES = ['ADMIN', 'SALES_AGENT'];

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  // Admin sees every order; a sales agent only their own (server-side, from
  // the JWT — same rule as OrdersController's order list).
  private orderScope(user: FeedbackUser): Prisma.OrderWhereInput {
    if (!user?.role || !FEEDBACK_ROLES.includes(user.role)) {
      throw new ForbiddenException(
        'Feedback is available to admins and sales agents only',
      );
    }
    return user.role === 'SALES_AGENT' ? { salesAgentId: user.id } : {};
  }

  // Delivered date: the latest shipment deliveredAt, else the latest
  // DELIVERED status log (both are written when an order is marked delivered).
  private deliveredAt(order: {
    shipments: Array<{ deliveredAt: Date | null }>;
    statusLogs: Array<{ createdAt: Date }>;
  }): Date | null {
    const shipmentTimes = order.shipments
      .map((s) => s.deliveredAt?.getTime() ?? 0)
      .filter((t) => t > 0);
    const times = shipmentTimes.length
      ? shipmentTimes
      : order.statusLogs.map((l) => l.createdAt.getTime());
    return times.length ? new Date(Math.max(...times)) : null;
  }

  async listPending(user: FeedbackUser) {
    const scope = this.orderScope(user);
    const cutoff = new Date(
      Date.now() - FEEDBACK_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );
    const orders = await this.prisma.order.findMany({
      where: {
        ...scope,
        status: OrderStatus.DELIVERED,
        isTest: false,
        feedback: { is: null },
        OR: [
          { shipments: { some: { deliveredAt: { gte: cutoff } } } },
          {
            statusLogs: {
              some: {
                toStatus: OrderStatus.DELIVERED,
                createdAt: { gte: cutoff },
              },
            },
          },
        ],
      },
      select: {
        id: true,
        orderNumber: true,
        orderDate: true,
        customer: { select: { businessName: true, phone: true, city: true } },
        salesAgent: { select: { fullName: true } },
        items: {
          where: { cancelledAt: null },
          select: { product: { select: { name: true } } },
        },
        shipments: { select: { deliveredAt: true, carrierName: true } },
        statusLogs: {
          where: { toStatus: OrderStatus.DELIVERED },
          select: { createdAt: true },
        },
      },
    });

    return orders
      .map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        orderDate: o.orderDate,
        deliveredAt: this.deliveredAt(o),
        customerName: o.customer.businessName,
        customerPhone: o.customer.phone,
        city: o.customer.city,
        salesAgentName: o.salesAgent?.fullName ?? null,
        products: o.items.map((i) => i.product.name),
        carrierName:
          o.shipments.find((s) => s.carrierName)?.carrierName ?? null,
      }))
      .sort(
        (a, b) =>
          (b.deliveredAt?.getTime() ?? 0) - (a.deliveredAt?.getTime() ?? 0),
      );
  }

  async getOrder(orderId: string, user: FeedbackUser) {
    const scope = this.orderScope(user);
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, ...scope },
      select: {
        id: true,
        orderNumber: true,
        orderDate: true,
        status: true,
        isTest: true,
        notes: true,
        grandTotal: true,
        customer: {
          select: {
            businessName: true,
            contactPerson: true,
            phone: true,
            city: true,
            state: true,
          },
        },
        salesAgent: { select: { fullName: true } },
        items: {
          where: { cancelledAt: null },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            quantity: true,
            lineTotal: true,
            artworkNotes: true,
            product: {
              select: {
                name: true,
                sku: true,
                sizeInches: true,
                gsm: true,
                paperType: true,
                sides: true,
              },
            },
          },
        },
        shipments: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            status: true,
            carrierName: true,
            awbNumber: true,
            trackingNumber: true,
            dispatchType: true,
            transportName: true,
            lrNumber: true,
            dispatchDate: true,
            createdAt: true,
            deliveredAt: true,
          },
        },
        statusLogs: {
          where: { toStatus: OrderStatus.DELIVERED },
          select: { createdAt: true },
        },
        feedback: true,
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    // statusLogs was only selected to work out deliveredAt; not sent to the client.
    return {
      ...order,
      statusLogs: undefined,
      deliveredAt: this.deliveredAt(order),
    };
  }

  async submit(orderId: string, body: FeedbackBody, user: FeedbackUser) {
    const scope = this.orderScope(user);
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, ...scope },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        isTest: true,
        customer: { select: { businessName: true, phone: true } },
        salesAgent: { select: { fullName: true, phone: true } },
        items: {
          where: { cancelledAt: null },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            quantity: true,
            product: { select: { name: true } },
          },
        },
        feedback: { select: { id: true } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== OrderStatus.DELIVERED || order.isTest) {
      throw new BadRequestException(
        'Feedback can only be recorded for delivered orders',
      );
    }
    if (order.feedback)
      throw new ConflictException(
        'Feedback has already been recorded for this order',
      );

    const input = body ?? {};
    const result = validateFeedback(
      {
        ...input,
        referralPhone:
          typeof input.referralPhone === 'string'
            ? sanitizePhone(input.referralPhone)
            : input.referralPhone,
      },
      order.items.map((i) => ({
        id: i.id,
        productName: i.product.name,
        quantity: i.quantity,
      })),
    );
    if (result.ok === false) throw new BadRequestException(result.error);
    const feedback = result.value;

    let created: { id: string };
    try {
      created = await this.prisma.customerFeedback.create({
        data: {
          orderId: order.id,
          overallRating: feedback.overallRating,
          productRatings:
            feedback.productRatings as unknown as Prisma.InputJsonValue,
          serviceRating: feedback.serviceRating,
          deliveryRating: feedback.deliveryRating,
          improvement: feedback.improvement,
          wouldRecommend: feedback.wouldRecommend,
          referralName: feedback.referralName,
          referralPhone: feedback.referralPhone,
          needsMore: feedback.needsMore,
          requirementNote: feedback.requirementNote,
          willRateOnGoogle: feedback.willRateOnGoogle,
          submittedById: user.id,
          submittedByName: user.fullName ?? null,
        },
        select: { id: true },
      });
    } catch (err: unknown) {
      if ((err as { code?: string } | null)?.code === 'P2002')
        throw new ConflictException(
          'Feedback has already been recorded for this order',
        );
      throw err;
    }

    // WhatsApp sends happen after the feedback is saved and never undo it —
    // a missing template/phone only produces a warning for the caller.
    const warnings: string[] = [];

    let customerWhatsappSent = false;
    const reviewUrl = process.env.GOOGLE_REVIEW_URL?.trim();
    if (!reviewUrl) {
      warnings.push(
        'Customer WhatsApp not sent: GOOGLE_REVIEW_URL is not configured on the server.',
      );
    } else if (!order.customer.phone) {
      warnings.push(
        'Customer WhatsApp not sent: customer has no phone number.',
      );
    } else {
      customerWhatsappSent = await this.whatsapp.sendFeedbackThankYou({
        customerName: order.customer.businessName,
        customerPhone: order.customer.phone,
        orderNo: order.orderNumber,
        overallRating: feedback.overallRating,
        reviewUrl,
      });
      if (!customerWhatsappSent)
        warnings.push(
          'Customer WhatsApp could not be sent (check the AiSensy template).',
        );
    }

    const agentMessageNeeded = hasSalesLead(feedback);
    let agentWhatsappSent = false;
    if (agentMessageNeeded) {
      if (!order.salesAgent) {
        warnings.push(
          'Sales agent WhatsApp not sent: this order has no sales agent.',
        );
      } else if (!order.salesAgent.phone) {
        warnings.push(
          `Sales agent WhatsApp not sent: ${order.salesAgent.fullName} has no phone number saved.`,
        );
      } else {
        agentWhatsappSent = await this.whatsapp.sendFeedbackLeadToAgent({
          agentName: order.salesAgent.fullName,
          agentPhone: order.salesAgent.phone,
          orderNo: order.orderNumber,
          templateParams: agentLeadTemplateParams({
            agentName: order.salesAgent.fullName,
            customerName: order.customer.businessName,
            customerPhone: order.customer.phone,
            orderNo: order.orderNumber,
            feedback,
          }),
        });
        if (!agentWhatsappSent)
          warnings.push(
            'Sales agent WhatsApp could not be sent (check the AiSensy template).',
          );
      }
    }

    if (customerWhatsappSent || agentWhatsappSent) {
      await this.prisma.customerFeedback
        .update({
          where: { id: created.id },
          data: { customerWhatsappSent, agentWhatsappSent },
        })
        .catch((err) =>
          this.logger.error(
            `Could not record WhatsApp status for feedback ${created.id}: ${err}`,
          ),
        );
    }

    return {
      id: created.id,
      customerWhatsappSent,
      agentMessageNeeded,
      agentWhatsappSent,
      warnings,
    };
  }

  async listSubmitted(user: FeedbackUser) {
    const scope = this.orderScope(user);
    return this.prisma.customerFeedback.findMany({
      where: { order: scope },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            customer: { select: { businessName: true, phone: true } },
            salesAgent: { select: { fullName: true } },
          },
        },
      },
    });
  }
}
