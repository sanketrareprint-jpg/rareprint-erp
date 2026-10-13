import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ActivityType, LeadSource, LeadStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CrmService } from '../crm/crm.service';
import {
  InboxUser, ShopifyService, assertInboxReviewer, assertInboxViewer, isShopifyEnabled,
} from './shopify.service';
import { MappedCheckout, SHOPIFY_GENERIC_PRODUCT_SKU, SHOPIFY_LEAD_TAG, describeCart, mapShopifyOrder } from './shopify.mapper';

// Shopify module screens (frontend/app/shopify). Reads + the small cart
// actions; approve/reject live in ShopifyService next to order creation.
// Every endpoint is unavailable unless SHOPIFY_WEBHOOK_SECRET is set.

const ORDER_STATUSES = ['NEW', 'APPROVED', 'REJECTED', 'CANCELLED'];
const CART_VIEWS = ['waiting', 'contacted', 'lead', 'converted', 'dismissed', 'all'] as const;
type CartView = (typeof CART_VIEWS)[number];

// "Waiting" = abandoned and nobody has acted on it yet (the sidebar badge).
const WAITING_CART: Prisma.ShopifyCheckoutWhereInput = { status: 'ABANDONED', contactedAt: null, dismissedAt: null, leadId: null };

function requireEnabled() {
  if (!isShopifyEnabled()) throw new ServiceUnavailableException('Shopify integration is not configured');
}

@Injectable()
export class ShopifyInboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crm: CrmService,
    private readonly shopify: ShopifyService,
  ) {}

  async counts(user: InboxUser) {
    if (!isShopifyEnabled()) return { enabled: false, newOrders: 0, waitingCarts: 0 };
    assertInboxViewer(user);
    const [newOrders, waitingCarts] = await Promise.all([
      this.prisma.shopifyInboxOrder.count({ where: { status: 'NEW' } }),
      this.prisma.shopifyCheckout.count({ where: WAITING_CART }),
    ]);
    return { enabled: true, newOrders, waitingCarts };
  }

  async listOrders(user: InboxUser, status?: string, q?: string) {
    requireEnabled();
    assertInboxViewer(user);
    const where: Prisma.ShopifyInboxOrderWhereInput = {};
    if (status && ORDER_STATUSES.includes(status)) where.status = status;
    const search = q?.trim();
    if (search) {
      const digits = search.replace(/\D/g, '');
      const erp = await this.prisma.order.findMany({
        where: { shopifyOrderId: { not: null }, orderNumber: { contains: search, mode: 'insensitive' } },
        select: { id: true },
        take: 50,
      });
      where.OR = [
        { shopifyName: { contains: search.replace(/^#/, ''), mode: 'insensitive' } },
        { customerName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        ...(digits.length >= 4 ? [{ phone: { contains: digits.slice(-10) } }] : []),
        ...(erp.length ? [{ orderId: { in: erp.map((o) => o.id) } }] : []),
      ];
    }
    const rows = await this.prisma.shopifyInboxOrder.findMany({
      where,
      orderBy: { orderDate: 'desc' },
      take: 200,
      select: {
        id: true, shopifyOrderId: true, shopifyName: true, status: true, isTest: true, orderDate: true,
        customerName: true, phone: true, city: true, state: true, itemsSummary: true, totalPrice: true,
        gateway: true, financialStatus: true, cancelledAt: true, orderId: true, rejectReason: true,
      },
    });
    const orderNumbers = await this.erpOrderNumbers(rows.map((r) => r.orderId));
    return rows.map((r) => ({ ...r, totalPrice: Number(r.totalPrice), erpOrderNumber: r.orderId ? orderNumbers.get(r.orderId) ?? null : null }));
  }

  async getOrder(user: InboxUser, id: string) {
    requireEnabled();
    assertInboxViewer(user);
    const row = await this.prisma.shopifyInboxOrder.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Shopify inbox order not found');
    const m = mapShopifyOrder(row.payload);
    const [customers, productMatches, generic, agents, erp] = await Promise.all([
      this.shopify.suggestCustomers(this.prisma, m.customer),
      this.shopify.suggestProducts(m.lines),
      this.prisma.product.findUnique({ where: { sku: SHOPIFY_GENERIC_PRODUCT_SKU }, select: { id: true } }),
      this.prisma.user.findMany({
        where: { isActive: true, role: { in: ['SALES_AGENT', 'ADMIN'] } },
        orderBy: { fullName: 'asc' },
        select: { id: true, fullName: true, role: true },
      }),
      row.orderId ? this.prisma.order.findUnique({ where: { id: row.orderId }, select: { orderNumber: true, status: true } }) : null,
    ]);
    const domain = row.shopDomain ?? process.env.SHOPIFY_STORE_DOMAIN?.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '') ?? null;
    const sd = m.shopifyData;
    return {
      id: row.id,
      status: row.status,
      isTest: row.isTest,
      shopifyName: m.shopifyName,
      shopifyOrderId: m.shopifyOrderId,
      orderNumberIfApproved: m.orderNumber,
      shopifyUrl: domain ? `https://${domain}/admin/orders/${m.shopifyOrderId}` : null,
      orderDate: m.orderDate,
      customer: m.customer,
      shippingAddress: sd.shippingAddress,
      billingAddress: sd.billingAddress,
      lines: m.lines.map((l, i) => ({ ...l, suggestedProduct: productMatches[i] })),
      itemsTotal: m.itemsTotal,
      shippingCharge: m.shippingCharge,
      totalPrice: m.totalPrice,
      totalsMismatch: m.totalsMismatch,
      gateway: m.gateway,
      gatewayNames: sd.gatewayNames,
      financialStatus: m.financialStatus,
      fulfillmentStatus: sd.fulfillmentStatus,
      cancelledAt: m.cancelledAt,
      cancelReason: sd.cancelReason,
      discountCodes: sd.discountCodes,
      note: sd.note,
      noteAttributes: sd.noteAttributes,
      tags: sd.tags,
      sourceName: sd.sourceName,
      fulfillments: sd.fulfillments,
      taxesIncluded: sd.taxesIncluded,
      suggestedCustomers: customers,
      genericProductId: generic?.id ?? null,
      agents,
      approvedByName: row.approvedByName,
      approvedAt: row.approvedAt,
      rejectedByName: row.rejectedByName,
      rejectedAt: row.rejectedAt,
      rejectReason: row.rejectReason,
      erpOrder: erp ? { id: row.orderId, ...erp } : null,
    };
  }

  async listCarts(user: InboxUser, view?: string, q?: string) {
    requireEnabled();
    assertInboxViewer(user);
    const v: CartView = (CART_VIEWS as readonly string[]).includes(view ?? '') ? (view as CartView) : 'waiting';
    const byView: Record<CartView, Prisma.ShopifyCheckoutWhereInput> = {
      waiting: WAITING_CART,
      contacted: { status: 'ABANDONED', contactedAt: { not: null }, dismissedAt: null, leadId: null },
      lead: { status: 'ABANDONED', leadId: { not: null } },
      // Only carts that had been shown as abandoned — not every checkout.
      converted: { status: 'CONVERTED', abandonedAt: { not: null } },
      dismissed: { status: 'ABANDONED', dismissedAt: { not: null } },
      all: { OR: [{ status: 'ABANDONED' }, { status: 'CONVERTED', abandonedAt: { not: null } }] },
    };
    const and: Prisma.ShopifyCheckoutWhereInput[] = [byView[v]];
    const search = q?.trim();
    if (search) {
      const digits = search.replace(/\D/g, '');
      and.push({
        OR: [
          { customerName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          ...(digits.length >= 4 ? [{ phone: { contains: digits.slice(-10) } }] : []),
        ],
      });
    }
    const rows = await this.prisma.shopifyCheckout.findMany({
      where: { AND: and },
      orderBy: { lastActivityAt: 'desc' },
      take: 200,
      select: {
        id: true, status: true, customerName: true, phone: true, email: true, cartItems: true, cartValue: true,
        recoveryUrl: true, lastActivityAt: true, abandonedAt: true, convertedAt: true, leadId: true,
        contactedAt: true, contactedByName: true, dismissedAt: true, dismissedByName: true, inboxOrderId: true,
      },
    });
    return rows.map((r) => ({ ...r, cartValue: Number(r.cartValue) }));
  }

  // Create Lead dialog: active sales agents + the default (fewest leads).
  async leadAgents(user: InboxUser) {
    requireEnabled();
    assertInboxReviewer(user);
    const [agents, suggested] = await Promise.all([
      this.prisma.user.findMany({ where: { isActive: true, role: 'SALES_AGENT' }, orderBy: { fullName: 'asc' }, select: { id: true, fullName: true } }),
      this.crm.getNextAgent().catch(() => null),
    ]);
    return { agents, defaultAgentId: suggested?.id ?? null };
  }

  async markContacted(user: InboxUser, id: string) {
    requireEnabled();
    assertInboxViewer(user);
    const res = await this.prisma.shopifyCheckout.updateMany({
      where: { id, status: 'ABANDONED', contactedAt: null },
      data: { contactedAt: new Date(), contactedById: user.id, contactedByName: user.fullName ?? null },
    });
    if (res.count === 0) throw new BadRequestException('Cart not found, not abandoned, or already marked contacted');
    return { ok: true };
  }

  async dismiss(user: InboxUser, id: string) {
    requireEnabled();
    assertInboxReviewer(user);
    const res = await this.prisma.shopifyCheckout.updateMany({
      where: { id, status: 'ABANDONED', dismissedAt: null },
      data: { dismissedAt: new Date(), dismissedById: user.id, dismissedByName: user.fullName ?? null },
    });
    if (res.count === 0) throw new BadRequestException('Cart not found, not abandoned, or already dismissed');
    return { ok: true };
  }

  // A cart with a phone → CRM lead (tag shopify-abandoned). An open lead for
  // the same phone gets a note + the tag instead of a duplicate lead.
  async createLead(user: InboxUser, id: string, agentId?: string | null) {
    requireEnabled();
    assertInboxReviewer(user);
    const cart = await this.prisma.shopifyCheckout.findUnique({ where: { id } });
    if (!cart || cart.status !== 'ABANDONED') throw new BadRequestException('Cart not found or not abandoned');
    if (cart.leadId) throw new BadRequestException('A lead already exists for this cart');
    if (!cart.phone) throw new BadRequestException('This cart has no phone number — a lead needs one');

    const cartItems = (Array.isArray(cart.cartItems) ? cart.cartItems : []) as unknown as MappedCheckout['cartItems'];
    const description = describeCart({ cartItems, cartValue: Number(cart.cartValue), recoveryUrl: cart.recoveryUrl });

    const open = await this.prisma.lead.findFirst({
      where: { phone: { endsWith: cart.phone }, status: { notIn: [LeadStatus.WON, LeadStatus.LOST] } },
      orderBy: { updatedAt: 'desc' },
      include: { agent: { select: { fullName: true } } },
    });
    if (open) {
      await this.prisma.$transaction([
        this.prisma.lead.update({
          where: { id: open.id },
          data: { tags: open.tags.includes(SHOPIFY_LEAD_TAG) ? open.tags : [...open.tags, SHOPIFY_LEAD_TAG] },
        }),
        this.prisma.leadActivity.create({
          data: { leadId: open.id, type: ActivityType.NOTE_ADDED, description, createdById: open.agentId },
        }),
        this.prisma.shopifyCheckout.update({ where: { id }, data: { leadId: open.id } }),
      ]);
      return { ok: true, leadId: open.id, existing: true, agentName: open.agent.fullName };
    }

    const agent = agentId
      ? await this.prisma.user.findFirst({ where: { id: agentId, isActive: true, role: 'SALES_AGENT' }, select: { id: true, fullName: true } })
      : await this.crm.getNextAgent();
    if (!agent) throw new BadRequestException('Sales agent not found or inactive');

    const leadId = await this.prisma.$transaction(async (tx) => {
      const lead = await tx.lead.create({
        data: {
          name: cart.customerName ?? `Shopify cart ${cart.phone!.slice(-4)}`,
          phone: cart.phone!,
          email: cart.email,
          productInterest: cartItems.map((i) => i.title).join(', ').slice(0, 250) || null,
          estimatedQty: cartItems.reduce((s, i) => s + (i.quantity || 0), 0) || null,
          estimatedValue: Number(cart.cartValue) || null,
          notes: description,
          tags: [SHOPIFY_LEAD_TAG],
          source: LeadSource.ONLINE_FORM,
          status: LeadStatus.NEW,
          agentId: agent.id,
        },
      });
      await tx.leadActivity.create({
        data: {
          leadId: lead.id, type: ActivityType.NOTE_ADDED, createdById: agent.id,
          description: `Lead created from an abandoned Shopify cart by ${user.fullName ?? user.id} and assigned to ${agent.fullName}`,
        },
      });
      await tx.shopifyCheckout.update({ where: { id }, data: { leadId: lead.id } });
      return lead.id;
    });
    return { ok: true, leadId, existing: false, agentName: agent.fullName };
  }

  private async erpOrderNumbers(ids: (string | null)[]) {
    const list = ids.filter((x): x is string => !!x);
    if (!list.length) return new Map<string, string>();
    const orders = await this.prisma.order.findMany({ where: { id: { in: list } }, select: { id: true, orderNumber: true } });
    return new Map(orders.map((o) => [o.id, o.orderNumber]));
  }
}
