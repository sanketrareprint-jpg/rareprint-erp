import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { createHash } from 'crypto';
import {
  ActivityType, LeadStatus, OrderProductionStage, OrderStatus, PaymentMethod,
  PaymentStatus, PaymentVerificationStatus, Prisma, PrintingType, ProductSides, TaskStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CrmService } from '../crm/crm.service';
import {
  MappedCheckout, MappedCustomer, MappedOrder, SHOPIFY_GENERIC_GST_RATE_PCT, SHOPIFY_GENERIC_PRODUCT_SKU,
  mapGraphqlCheckout, mapShopifyCheckout, mapShopifyOrder, paymentToRecord,
} from './shopify.mapper';

// Shopify → ERP sync. Webhooks are saved raw first (ShopifyWebhookLog) and
// processed right after the 200 is sent; retryFailed() picks up anything that
// failed or never finished. Every entry point is a no-op unless
// SHOPIFY_WEBHOOK_SECRET is set, so deployments without it are untouched.

export const isShopifyEnabled = () => !!process.env.SHOPIFY_WEBHOOK_SECRET?.trim();

// No order within this long of a checkout's last update = abandoned.
const ABANDON_AFTER_MS = 60 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const ORDER_TOPICS = ['orders/create', 'orders/updated', 'orders/paid', 'orders/cancelled', 'orders/fulfilled', 'orders/edited', 'orders/partially_fulfilled'];
const CHECKOUT_TOPICS = ['checkouts/create', 'checkouts/update'];
const TERMINAL_STATUSES: OrderStatus[] = [OrderStatus.CANCELLED, OrderStatus.DISPATCHED, OrderStatus.DELIVERED];

const ABANDONED_CHECKOUTS_QUERY = `query AbandonedCheckouts($query: String) {
  abandonedCheckouts(first: 50, query: $query, sortKey: CREATED_AT, reverse: true) {
    nodes {
      id name abandonedCheckoutUrl createdAt updatedAt completedAt taxesIncluded
      totalPriceSet { shopMoney { amount currencyCode } }
      customer { firstName lastName defaultEmailAddress { emailAddress } defaultPhoneNumber { phoneNumber } }
      shippingAddress { name phone company address1 address2 city province zip }
      billingAddress { name phone company }
      lineItems(first: 50) { nodes { title variantTitle sku quantity originalUnitPriceSet { shopMoney { amount } } customAttributes { key value } } }
    }
  }
}`;

type Tx = Prisma.TransactionClient;

export interface InboxUser { id: string; role: string; fullName?: string | null }
export interface ApproveLine { productId: string; size: string; gsm: string; paper: string; sides: string }
export interface ApproveInput {
  customer: { mode: 'existing'; customerId: string } | { mode: 'new' };
  // remember: also save this line's Shopify product → chosen ERP product as a
  // ShopifyProductLink, so the next order for it is pre-filled.
  lines: { productId?: string | null; size?: string; gsm?: string; paper?: string; sides?: string; remember?: boolean }[];
  salesAgentId?: string | null;
  note?: string | null;
}

// Shopify module permissions (Sanket, 2026-10-13): Admin/Accounts review and
// act; sales agents only view, WhatsApp and mark carts contacted.
export const INBOX_REVIEWER_ROLES = ['ADMIN', 'ACCOUNTS'];
export const INBOX_VIEWER_ROLES = ['ADMIN', 'ACCOUNTS', 'SALES_AGENT'];
export function assertInboxReviewer(user: InboxUser) {
  if (!INBOX_REVIEWER_ROLES.includes(user?.role)) throw new ForbiddenException('Only Admin and Accounts can do this');
}
export function assertInboxViewer(user: InboxUser) {
  if (!INBOX_VIEWER_ROLES.includes(user?.role)) throw new ForbiddenException('No access to the Shopify module');
}

@Injectable()
export class ShopifyService {
  private readonly logger = new Logger(ShopifyService.name);
  private retrying = false;
  private abandoning = false;
  private polling = false;

  constructor(private readonly prisma: PrismaService, private readonly crm: CrmService) {}

  // ─── Webhook intake ─────────────────────────────────────────────────────

  async receive(kind: 'orders' | 'checkouts', headers: Record<string, any>, body: any, rawBody: Buffer) {
    const header = (name: string) => {
      const v = headers[name];
      return (Array.isArray(v) ? v[0] : v)?.toString().trim() || null;
    };
    const topic = header('x-shopify-topic') ?? 'unknown';
    // A delivery without a webhook id (e.g. a hand-made curl) is keyed by its
    // own bytes, so resending the identical request is still a duplicate.
    const webhookId = header('x-shopify-webhook-id')
      ?? `nohdr-${createHash('sha256').update(topic).update(rawBody).digest('hex')}`;
    const handled = kind === 'orders' ? ORDER_TOPICS : CHECKOUT_TOPICS;

    let log;
    try {
      log = await this.prisma.shopifyWebhookLog.create({
        data: {
          webhookId,
          topic,
          shopDomain: header('x-shopify-shop-domain'),
          resourceId: body?.id != null ? String(body.id) : (body?.token ?? null),
          payload: (body ?? {}) as Prisma.InputJsonValue,
          ...(handled.includes(topic) ? {} : { status: 'IGNORED', result: `Topic ${topic} is not handled on /shopify/${kind}`, processedAt: new Date() }),
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return { ok: true, duplicate: true };
      }
      throw err;
    }

    if (log.status === 'RECEIVED') {
      // Not awaited: Shopify only waits 5s. retryFailed() covers a crash here.
      setImmediate(() => { void this.processLog(log.id, ['RECEIVED']); });
    }
    return { ok: true, logId: log.id, status: log.status };
  }

  async processLog(logId: string, fromStatuses: string[]) {
    // Claim the row so the immediate run and the retry job never both run it.
    const claimed = await this.prisma.shopifyWebhookLog.updateMany({
      where: { id: logId, status: { in: fromStatuses } },
      data: { status: 'PROCESSING', attempts: { increment: 1 } },
    });
    if (claimed.count === 0) return;
    const log = await this.prisma.shopifyWebhookLog.findUnique({ where: { id: logId } });
    if (!log) return;
    try {
      const result = log.topic.startsWith('orders/')
        ? await this.syncOrder(log.payload, log.shopDomain)
        : await this.syncCheckout(log.payload);
      await this.prisma.shopifyWebhookLog.update({
        where: { id: logId },
        data: { status: 'PROCESSED', result, error: null, processedAt: new Date() },
      });
    } catch (err: any) {
      this.logger.error(`Shopify webhook ${log.topic} ${log.resourceId} failed: ${err?.message}`, err?.stack);
      await this.prisma.shopifyWebhookLog.update({
        where: { id: logId },
        data: { status: 'FAILED', error: String(err?.message ?? err).slice(0, 2000) },
      });
    }
  }

  @Cron('0 * * * * *')
  async retryFailed() {
    if (!isShopifyEnabled() || this.retrying) return;
    this.retrying = true;
    try {
      const now = Date.now();
      const logs = await this.prisma.shopifyWebhookLog.findMany({
        where: {
          attempts: { lt: MAX_ATTEMPTS },
          OR: [
            { status: 'FAILED' },
            // Held by the 2026-10-13 stop-gap, before the inbox existed.
            { status: 'HELD' },
            { status: 'RECEIVED', receivedAt: { lt: new Date(now - 2 * 60 * 1000) } },
            // Stuck mid-run (process restarted while processing).
            { status: 'PROCESSING', receivedAt: { lt: new Date(now - 10 * 60 * 1000) } },
          ],
        },
        orderBy: { receivedAt: 'asc' },
        take: 20,
        select: { id: true, status: true },
      });
      for (const log of logs) await this.processLog(log.id, [log.status]);
    } finally {
      this.retrying = false;
    }
  }

  // ─── Orders ─────────────────────────────────────────────────────────────

  async syncOrder(payload: any, shopDomain: string | null = null): Promise<string> {
    const m = mapShopifyOrder(payload);
    return this.prisma.$transaction(async (tx) => {
      // orders/create, /paid and /updated for one order often arrive together;
      // serialise them so the order and its payment are only created once.
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `shopify-order:${m.shopifyOrderId}`);
      const existing = await tx.order.findUnique({
        where: { shopifyOrderId: m.shopifyOrderId },
        include: { items: { select: { id: true, itemProductionStage: true, cancelledAt: true } }, invoice: { select: { id: true } } },
      });

      let orderId: string;
      let result: string;
      if (!existing) {
        // Not approved yet: the order lives in the Shopify inbox only. An ERP
        // order is created solely by approve() (Sanket, 2026-10-13).
        return this.upsertInbox(tx, m, payload, shopDomain);
      } else {
        const prevUpdatedAt = (existing.shopifyData as any)?.updatedAt;
        if (prevUpdatedAt && m.updatedAt && Date.parse(m.updatedAt) < Date.parse(prevUpdatedAt)) {
          return `Skipped: older than the last update already applied to ${existing.orderNumber}`;
        }
        orderId = existing.id;
        result = await this.updateOrder(tx, existing, m);
      }

      await this.refreshInboxDisplay(tx, m, payload);
      const extras = [
        await this.recordPayment(tx, orderId, m),
        await this.applyCancellation(tx, orderId, m),
        await this.convertCheckouts(tx, m, { orderId }),
      ].filter(Boolean);
      return [result, ...extras].join('; ');
    }, { timeout: 30000, maxWait: 15000 });
  }

  // Spec line first, in the format resolveItemDetails() parses — Production,
  // Dispatch and the invoice read Size/GSM/Paper/Sides from it, so an edit made
  // in the inbox lands on this item only and the catalogue Product is never
  // changed. Shopify title/variant/SKU follow on the next line.
  private itemsCreateData(lines: MappedOrder['lines'], review: ApproveLine[]) {
    return lines.map((l, i) => {
      const spec = review[i];
      const specLine = `Size: ${spec.size || '-'}, GSM: ${spec.gsm || '-'}${spec.paper ? `, Paper: ${spec.paper}` : ''}, Sides: ${spec.sides || '-'}`;
      return {
        productId: spec.productId,
        quantity: l.quantity,
        unitPrice: new Prisma.Decimal(l.unitPrice),
        lineDiscount: new Prisma.Decimal(l.lineDiscount),
        taxRatePct: new Prisma.Decimal(0),
        taxAmount: new Prisma.Decimal(0),
        lineTotal: new Prisma.Decimal(l.lineTotal),
        productionNotes: `${specLine}
${l.productionNotes}`,
        artworkNotes: l.artworkNotes,
      };
    });
  }

  private async createOrder(tx: Tx, m: MappedOrder, input: {
    customerId: string; lines: ApproveLine[]; salesAgentId: string | null; note: string | null;
    approver: InboxUser; inboxNote: string;
  }) {
    const taken = await tx.order.findUnique({ where: { orderNumber: m.orderNumber }, select: { id: true } });
    const orderNumber = taken ? `${m.orderNumber}-${m.shopifyOrderId.slice(-6)}` : m.orderNumber;

    const order = await tx.order.create({
      data: {
        orderNumber,
        orderDate: m.orderDate,
        customerId: input.customerId,
        salesAgentId: input.salesAgentId,
        status: OrderStatus.PENDING_APPROVAL,
        paymentStatus: PaymentStatus.PENDING,
        subtotal: new Prisma.Decimal(m.itemsTotal),
        discount: new Prisma.Decimal(0),
        taxAmount: new Prisma.Decimal(0),
        shippingCharge: new Prisma.Decimal(0),
        courierChargeQuoted: m.shippingCharge > 0 ? new Prisma.Decimal(m.shippingCharge) : null,
        grandTotal: new Prisma.Decimal(m.itemsTotal),
        notes: [m.notes, input.inboxNote, input.note ? `Review note: ${input.note}` : null].filter(Boolean).join(' | '),
        leadSource: 'SHOPIFY',
        isTest: m.isTest,
        shopifyOrderId: m.shopifyOrderId,
        shopifyData: m.shopifyData as Prisma.InputJsonValue,
        items: { create: this.itemsCreateData(m.lines, input.lines) },
      },
      select: { id: true, orderNumber: true },
    });
    await tx.statusLog.create({
      data: {
        orderId: order.id, fromStatus: null, toStatus: OrderStatus.PENDING_APPROVAL, changedById: input.approver.id,
        reason: `Shopify ${m.shopifyName} approved in the Shopify inbox by ${input.approver.fullName ?? input.approver.id}; pending accounts`,
      },
    });
    return order;
  }

  private async updateOrder(tx: Tx, existing: any, m: MappedOrder): Promise<string> {
    const prev = (existing.shopifyData ?? {}) as Record<string, any>;
    const shopifyData: Record<string, any> = { ...m.shopifyData, editFlaggedHash: prev.editFlaggedHash ?? null, cancelHandledAt: prev.cancelHandledAt ?? null };
    const data: Prisma.OrderUpdateInput = {};
    const addNotes: string[] = [];
    const actions: string[] = [];

    // The ERP order exists only because a reviewer approved it in the inbox
    // (customer, products and specs chosen by hand), so a later Shopify edit
    // never changes its items/amounts — it is flagged for review instead.
    if (prev.contentHash !== m.contentHash && prev.editFlaggedHash !== m.contentHash) {
      addNotes.push(`⚠ Edited on Shopify ${new Date().toISOString().slice(0, 10)} after approval — items/amounts NOT changed in ERP; review Shopify ${m.shopifyName} (Shopify total now ₹${m.totalPrice.toFixed(2)})`);
      shopifyData.editFlaggedHash = m.contentHash;
      actions.push('edit flagged for review');
    }

    for (const f of m.shopifyData.fulfillments as any[]) {
      for (const [i, trackingNumber] of (f.trackingNumbers as string[]).entries()) {
        if ((existing.notes ?? '').includes(trackingNumber)) continue;
        addNotes.push(`Shopify fulfilment: ${f.trackingCompany ?? 'courier'} ${trackingNumber}${f.trackingUrls[i] ? ` ${f.trackingUrls[i]}` : ''}`);
        actions.push('tracking noted');
      }
    }

    data.shopifyData = shopifyData as Prisma.InputJsonValue;
    if (addNotes.length) data.notes = [existing.notes, ...addNotes].filter(Boolean).join(' | ');
    await tx.order.update({ where: { id: existing.id }, data });
    return `Updated ${existing.orderNumber}${actions.length ? ` (${actions.join(', ')})` : ''}`;
  }

  // Suggested existing customer: phone (last 10 digits) first, then email.
  async suggestCustomers(db: Tx | PrismaService, c: Pick<MappedCustomer, 'phone' | 'email'>) {
    const or: Prisma.CustomerWhereInput[] = [];
    if (c.phone) or.push({ phone: { endsWith: c.phone } }, { phone2: { endsWith: c.phone } });
    if (c.email) or.push({ email: { equals: c.email, mode: 'insensitive' } });
    if (!or.length) return [];
    const rows = await db.customer.findMany({
      where: { OR: or },
      orderBy: { createdAt: 'asc' },
      take: 5,
      select: { id: true, customerCode: true, businessName: true, contactPerson: true, phone: true, phone2: true, email: true, city: true, state: true, gstNumber: true },
    });
    return rows.map((r) => ({
      ...r,
      matchedBy: c.phone && [r.phone, r.phone2].some((p) => p?.endsWith(c.phone!)) ? 'phone' : 'email',
    }));
  }

  // Same rule as OrdersService.create: an existing customer's name is never
  // overwritten (every past invoice reads it); contact/address details are,
  // and state must follow this order's shipping state for GST.
  private customerDetails(c: MappedCustomer) {
    const upper = (v: string | null) => (v ? v.toUpperCase() : null);
    return {
      ...(c.email ? { email: c.email } : {}),
      ...(c.shippingAddress ? { shippingAddress: c.shippingAddress } : {}),
      ...(c.billingAddress ? { billingAddress: c.billingAddress } : {}),
      ...(c.city ? { city: upper(c.city) } : {}),
      ...(c.state ? { state: upper(c.state) } : {}),
      ...(c.pincode ? { pincode: c.pincode } : {}),
      ...(c.gstin ? { gstNumber: c.gstin } : {}),
    };
  }

  private async createCustomer(tx: Tx, c: MappedCustomer) {
    const upper = (v: string | null) => (v ? v.toUpperCase() : null);
    return tx.customer.create({
      data: {
        customerCode: `SHOP-CUST-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        businessName: upper(c.company ?? c.name)!,
        contactPerson: upper(c.name),
        phone: c.phone,
        ...this.customerDetails(c),
      },
    });
  }

  // Pre-fill for the review screen, most specific first (CLAUDE.md §29):
  //  1. a saved ShopifyProductLink for this Shopify product (set by a reviewer),
  //  2. a SKU match against the ERP catalogue,
  //  3. null = the one generic "Shopify Item" product (GST 18%).
  // A link to an inactive/missing product is skipped, falling through to SKU.
  async suggestProducts(lines: MappedOrder['lines']) {
    const select = { id: true, name: true, sku: true, sizeInches: true, gsm: true, paperType: true, sides: true } as const;
    type Suggested = Prisma.ProductGetPayload<{ select: typeof select }> & { matchedBy: 'link' | 'sku' };
    const ids = [...new Set(lines.map((l) => l.shopifyProductId).filter((x): x is string => !!x))];
    const links = ids.length
      ? await this.prisma.shopifyProductLink.findMany({ where: { shopifyProductId: { in: ids } }, select: { shopifyProductId: true, productId: true } })
      : [];
    const linkByShopifyId = new Map(links.map((l) => [l.shopifyProductId, l.productId]));
    const out: (Suggested | null)[] = [];
    for (const line of lines) {
      const linkedId = line.shopifyProductId ? linkByShopifyId.get(line.shopifyProductId) : undefined;
      const linked = linkedId
        ? await this.prisma.product.findFirst({ where: { id: linkedId, isActive: true, sku: { not: SHOPIFY_GENERIC_PRODUCT_SKU } }, select })
        : null;
      if (linked) { out.push({ ...linked, matchedBy: 'link' }); continue; }
      const bySku = line.sku
        ? await this.prisma.product.findFirst({ where: { isActive: true, sku: { equals: line.sku, mode: 'insensitive' } }, select })
        : null;
      out.push(bySku ? { ...bySku, matchedBy: 'sku' } : null);
    }
    return out;
  }

  // Saves (or re-points) the Shopify product → ERP product link. Never links
  // to the generic "Shopify Item" — that would just hide unmatched lines.
  private async saveProductLink(tx: Tx, line: MappedOrder['lines'][number], productId: string, genericId: string | null, user: InboxUser) {
    if (!line.shopifyProductId || productId === genericId) return;
    const data = { productId, shopifyTitle: line.title.slice(0, 250), linkedById: user.id, linkedByName: user.fullName ?? null };
    await tx.shopifyProductLink.upsert({
      where: { shopifyProductId: line.shopifyProductId },
      update: data,
      create: { shopifyProductId: line.shopifyProductId, ...data },
    });
  }

  async genericProductId(tx: Tx): Promise<string> {
    const existing = await tx.product.findUnique({ where: { sku: SHOPIFY_GENERIC_PRODUCT_SKU }, select: { id: true } });
    if (existing) return existing.id;
    const category = await tx.productCategory.upsert({
      where: { name: 'Shopify' },
      update: {},
      create: { name: 'Shopify', description: 'Shopify orders whose SKU matched no ERP product' },
    });
    const created = await tx.product.create({
      data: {
        sku: SHOPIFY_GENERIC_PRODUCT_SKU,
        name: 'Shopify Item',
        description: 'Generic product for Shopify lines with no matching ERP SKU — see the item notes for the real product',
        categoryId: category.id,
        gsm: 0,
        sizeInches: 'Custom',
        printingType: PrintingType.OFFSET,
        sides: ProductSides.SINGLE_SIDE,
        gstRatePct: new Prisma.Decimal(SHOPIFY_GENERIC_GST_RATE_PCT),
      },
      select: { id: true },
    });
    return created.id;
  }

  // Pending-verification Payment for an online/manual paid order, once per
  // order (referenceNumber SHOPIFY-<id>). Accounts verifies it like any other
  // payment; Order.paymentStatus moves only on that verification.
  private async recordPayment(tx: Tx, orderId: string, m: MappedOrder): Promise<string | null> {
    const amount = paymentToRecord(m.gateway, m.financialStatus, m.totalPrice, m.shopifyData.totalOutstanding);
    if (amount == null) return null;
    const referenceNumber = `SHOPIFY-${m.shopifyOrderId}`;
    const existing = await tx.payment.findFirst({ where: { orderId, referenceNumber } });
    if (existing) {
      if (Number(existing.amount) === amount) return null;
      // Same rule as items: follows Shopify only until Accounts acts.
      const order = await tx.order.findUnique({ where: { id: orderId }, select: { status: true, notes: true } });
      if (order?.status === OrderStatus.PENDING_APPROVAL && existing.verificationStatus === PaymentVerificationStatus.PENDING_VERIFICATION) {
        await tx.payment.update({ where: { id: existing.id }, data: { amount: new Prisma.Decimal(amount) } });
        return `payment amount updated to ₹${amount}`;
      }
      const flag = `⚠ Shopify ${m.shopifyName} paid amount is now ₹${amount.toFixed(2)} — ERP payment ₹${Number(existing.amount).toFixed(2)} left unchanged, review`;
      if (!(order?.notes ?? '').includes(flag)) {
        await tx.order.update({ where: { id: orderId }, data: { notes: [order?.notes, flag].filter(Boolean).join(' | ') } });
      }
      return 'payment amount change flagged for review';
    }
    const accountName = m.gateway === 'RAZORPAY' ? 'Shopify Razorpay' : 'Shopify (manual/other)';
    const account = await tx.paymentAccount.findFirst({ where: { name: accountName, isActive: true } })
      ?? await tx.paymentAccount.create({ data: { name: accountName, accountType: 'ONLINE_GATEWAY', currentBalance: new Prisma.Decimal(0) } });
    await tx.payment.create({
      data: {
        orderId,
        paymentAccountId: account.id,
        paymentDate: m.orderDate,
        amount: new Prisma.Decimal(amount),
        method: m.gateway === 'RAZORPAY' ? PaymentMethod.CARD : PaymentMethod.BANK_TRANSFER,
        referenceNumber,
        notes: `Shopify ${m.shopifyName}: ${(m.shopifyData.gatewayNames as string[]).join(', ') || 'unknown gateway'} — ${m.financialStatus}. Verify against the gateway settlement.`,
        verificationStatus: PaymentVerificationStatus.PENDING_VERIFICATION,
      },
    });
    return `payment ₹${amount} recorded (pending verification)`;
  }

  // A Shopify cancellation raises the ERP's normal cancellation request
  // (Accounts > Cancellation Approval), never a direct cancel.
  private async applyCancellation(tx: Tx, orderId: string, m: MappedOrder): Promise<string | null> {
    if (!m.cancelledAt) return null;
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { status: true, notes: true, cancellationRequestedAt: true, shopifyData: true, items: { select: { itemProductionStage: true, cancelledAt: true } } },
    });
    const data = (order?.shopifyData ?? {}) as Record<string, any>;
    if (!order || data.cancelHandledAt || order.status === OrderStatus.CANCELLED || order.cancellationRequestedAt) return null;

    const reason = `Cancelled on Shopify ${m.shopifyName}${m.shopifyData.cancelReason ? ` (${m.shopifyData.cancelReason})` : ''}`;
    const cancellable = !TERMINAL_STATUSES.includes(order.status)
      && order.items.every((i) => i.itemProductionStage === OrderProductionStage.NOT_PRINTED && !i.cancelledAt);
    await tx.order.update({
      where: { id: orderId },
      data: cancellable
        ? {
            cancellationRequestedAt: new Date(),
            cancellationRequestedByName: 'Shopify',
            cancellationReason: reason,
            pendingCancelItemIds: [],
            shopifyData: { ...data, cancelHandledAt: new Date().toISOString() },
          }
        : {
            notes: [order.notes, `⚠ ${reason} — order already in production/dispatched, handle manually`].filter(Boolean).join(' | '),
            shopifyData: { ...data, cancelHandledAt: new Date().toISOString() },
          },
    });
    return cancellable ? 'cancellation requested for Accounts approval' : 'cancellation flagged (already in production)';
  }

  // Marks the order's own checkout CONVERTED, plus any earlier ABANDONED
  // checkout from the same phone/email. With an ERP order (approval, or an
  // update to an approved order) the cart's lead becomes WON / task DONE.
  private async convertCheckouts(tx: Tx, m: MappedOrder, ids: { inboxOrderId?: string | null; orderId?: string | null }): Promise<string | null> {
    const or: Prisma.ShopifyCheckoutWhereInput[] = [];
    if (m.checkoutToken) or.push({ token: m.checkoutToken });
    if (m.customer.phone) or.push({ status: 'ABANDONED', phone: m.customer.phone, lastActivityAt: { lte: m.orderDate } });
    if (m.customer.email) or.push({ status: 'ABANDONED', email: { equals: m.customer.email, mode: 'insensitive' }, lastActivityAt: { lte: m.orderDate } });
    if (!or.length) return null;
    const rows = await tx.shopifyCheckout.findMany({
      where: {
        OR: or,
        AND: [{ OR: [{ status: { not: 'CONVERTED' } }, ...(ids.inboxOrderId && ids.orderId ? [{ inboxOrderId: ids.inboxOrderId, orderId: null }] : [])] }],
      },
    });
    if (!rows.length) return null;

    const order = ids.orderId ? await tx.order.findUnique({ where: { id: ids.orderId }, select: { orderNumber: true } }) : null;
    for (const row of rows) {
      await tx.shopifyCheckout.update({
        where: { id: row.id },
        data: {
          status: 'CONVERTED',
          convertedAt: row.convertedAt ?? new Date(),
          ...(ids.inboxOrderId ? { inboxOrderId: ids.inboxOrderId } : {}),
          ...(ids.orderId ? { orderId: ids.orderId } : {}),
        },
      });
      if (!ids.orderId) continue;
      if (row.leadId) {
        const lead = await tx.lead.findUnique({ where: { id: row.leadId }, select: { id: true, status: true, agentId: true } });
        if (lead && lead.status !== LeadStatus.WON) {
          await tx.lead.update({ where: { id: lead.id }, data: { status: LeadStatus.WON, convertedOrderId: ids.orderId } });
          await tx.leadActivity.create({
            data: { leadId: lead.id, type: ActivityType.NOTE_ADDED, description: `Converted: placed Shopify order ${m.shopifyName} (ERP order ${order?.orderNumber})`, createdById: lead.agentId },
          });
        }
      }
      if (row.taskId) {
        await tx.task.updateMany({
          where: { id: row.taskId, status: { in: [TaskStatus.OPEN, TaskStatus.IN_PROGRESS] } },
          data: { status: TaskStatus.DONE, completedAt: new Date() },
        });
      }
    }
    return `${rows.length} checkout(s) marked converted`;
  }

  // ─── Shopify inbox (orders waiting for review) ──────────────────────────

  private inboxColumns(m: MappedOrder, payload: any) {
    return {
      shopifyName: m.shopifyName,
      isTest: m.isTest,
      orderDate: m.orderDate,
      customerName: m.customer.name,
      phone: m.customer.phone,
      email: m.customer.email,
      city: m.customer.city,
      state: m.customer.state,
      itemsSummary: m.lines.map((l) => `${l.quantity} × ${l.title}${l.variantTitle ? ` (${l.variantTitle})` : ''}`).join(', ').slice(0, 500) || null,
      totalPrice: new Prisma.Decimal(m.totalPrice),
      gateway: m.gateway,
      financialStatus: m.financialStatus,
      cancelledAt: m.cancelledAt ? new Date(m.cancelledAt) : null,
      shopifyUpdatedAt: m.updatedAt,
      payload: payload as Prisma.InputJsonValue,
    };
  }

  // Not yet approved → the inbox row follows Shopify fully (edits, payment,
  // cancellation). Cancelled on Shopify → CANCELLED, which can't be approved.
  // A REJECTED row keeps its status but still stores the latest payload.
  private async upsertInbox(tx: Tx, m: MappedOrder, payload: any, shopDomain: string | null): Promise<string> {
    const row = await tx.shopifyInboxOrder.findUnique({ where: { shopifyOrderId: m.shopifyOrderId } });
    if (!row) {
      const created = await tx.shopifyInboxOrder.create({
        data: { shopifyOrderId: m.shopifyOrderId, shopDomain, status: m.cancelledAt ? 'CANCELLED' : 'NEW', ...this.inboxColumns(m, payload) },
      });
      const converted = await this.convertCheckouts(tx, m, { inboxOrderId: created.id });
      return [`Saved to Shopify inbox (${created.status}) — no ERP order until approved`, converted].filter(Boolean).join('; ');
    }
    if (row.shopifyUpdatedAt && m.updatedAt && Date.parse(m.updatedAt) < Date.parse(row.shopifyUpdatedAt)) {
      return `Skipped: older than the inbox copy of ${m.shopifyName}`;
    }
    const status = row.status === 'NEW' || row.status === 'CANCELLED' ? (m.cancelledAt ? 'CANCELLED' : 'NEW') : row.status;
    await tx.shopifyInboxOrder.update({
      where: { id: row.id },
      data: { status, ...(shopDomain && !row.shopDomain ? { shopDomain } : {}), ...this.inboxColumns(m, payload) },
    });
    const converted = await this.convertCheckouts(tx, m, { inboxOrderId: row.id });
    return [`Inbox ${m.shopifyName} updated (${status})`, converted].filter(Boolean).join('; ');
  }

  // Approved order: keep the inbox row's list columns current (display only).
  private async refreshInboxDisplay(tx: Tx, m: MappedOrder, payload: any) {
    await tx.shopifyInboxOrder.updateMany({
      where: { shopifyOrderId: m.shopifyOrderId, status: 'APPROVED' },
      data: this.inboxColumns(m, payload),
    });
  }

  async approve(inboxId: string, user: InboxUser, input: ApproveInput) {
    assertInboxReviewer(user);
    if (!Array.isArray(input?.lines)) throw new BadRequestException('lines are required');
    const salesAgentId = input.salesAgentId?.trim() || null;
    const note = input.note?.trim() || null;

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.shopifyInboxOrder.findUnique({ where: { id: inboxId }, select: { shopifyOrderId: true } });
      if (!row) throw new NotFoundException('Shopify inbox order not found');
      // Same lock as syncOrder, so a webhook can't change it mid-approval.
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `shopify-order:${row.shopifyOrderId}`);
      const fresh = (await tx.shopifyInboxOrder.findUnique({ where: { id: inboxId } }))!;
      if (fresh.status !== 'NEW') {
        throw new BadRequestException(fresh.status === 'CANCELLED'
          ? 'This order was cancelled on Shopify and cannot be approved'
          : `This order is already ${fresh.status.toLowerCase()}`);
      }
      if (await tx.order.findUnique({ where: { shopifyOrderId: fresh.shopifyOrderId }, select: { id: true } })) {
        throw new BadRequestException('An ERP order already exists for this Shopify order');
      }

      const m = mapShopifyOrder(fresh.payload);
      if (input.lines.length !== m.lines.length) {
        throw new BadRequestException(`Expected ${m.lines.length} line(s) — the Shopify order changed; reload and review again`);
      }

      // Products: chosen id, or empty = the generic "Shopify Item".
      let genericId: string | null = null;
      const lines: ApproveLine[] = [];
      const toLink: { line: MappedOrder['lines'][number]; productId: string }[] = [];
      for (const [i, l] of input.lines.entries()) {
        const chosen = l?.productId?.trim() || '';
        let productId = chosen;
        if (!productId) productId = genericId ??= await this.genericProductId(tx);
        const product = await tx.product.findFirst({ where: { id: productId, isActive: true }, select: { id: true, sku: true } });
        if (!product) throw new BadRequestException(`Line ${i + 1}: product not found or inactive`);
        if (l?.remember === true && chosen && product.sku !== SHOPIFY_GENERIC_PRODUCT_SKU) toLink.push({ line: m.lines[i], productId });
        // Commas/newlines/pipes would break the spec line's parser.
        const clean = (v: any) => String(v ?? '').replace(/[,\n|]/g, ' ').trim().slice(0, 60);
        lines.push({ productId, size: clean(l.size), gsm: clean(l.gsm), paper: clean(l.paper), sides: clean(l.sides) });
      }

      if (salesAgentId) {
        const agent = await tx.user.findFirst({ where: { id: salesAgentId, isActive: true, role: { in: ['SALES_AGENT', 'ADMIN'] } }, select: { id: true } });
        if (!agent) throw new BadRequestException('Sales agent not found or inactive');
      }

      let customerId: string;
      if (input.customer?.mode === 'existing') {
        const existing = await tx.customer.findUnique({ where: { id: String(input.customer.customerId ?? '') }, select: { id: true } });
        if (!existing) throw new BadRequestException('Selected customer not found');
        await tx.customer.update({ where: { id: existing.id }, data: this.customerDetails(m.customer) });
        customerId = existing.id;
      } else if (input.customer?.mode === 'new') {
        customerId = (await this.createCustomer(tx, m.customer)).id;
      } else {
        throw new BadRequestException('Choose an existing customer or create a new one');
      }

      for (const { line, productId } of toLink) await this.saveProductLink(tx, line, productId, genericId, user);

      const approvedAt = new Date();
      const order = await this.createOrder(tx, m, {
        customerId, lines, salesAgentId, note, approver: user,
        inboxNote: `Approved in Shopify inbox by ${user.fullName ?? user.id} ${approvedAt.toISOString().slice(0, 10)}`,
      });
      const extras = [
        await this.recordPayment(tx, order.id, m),
        await this.convertCheckouts(tx, m, { inboxOrderId: fresh.id, orderId: order.id }),
      ].filter(Boolean);
      await tx.shopifyInboxOrder.update({
        where: { id: fresh.id },
        data: { status: 'APPROVED', orderId: order.id, approvedById: user.id, approvedByName: user.fullName ?? null, approvedAt },
      });
      return { ok: true, orderId: order.id, orderNumber: order.orderNumber, notes: extras };
    }, { timeout: 30000, maxWait: 15000 });
  }

  async reject(inboxId: string, user: InboxUser, reason: string) {
    assertInboxReviewer(user);
    const why = reason?.trim();
    if (!why) throw new BadRequestException('A reason is required to reject');
    const res = await this.prisma.shopifyInboxOrder.updateMany({
      where: { id: inboxId, status: { in: ['NEW', 'CANCELLED'] } },
      data: { status: 'REJECTED', rejectedById: user.id, rejectedByName: user.fullName ?? null, rejectedAt: new Date(), rejectReason: why.slice(0, 1000) },
    });
    if (res.count === 0) throw new BadRequestException('Only new or cancelled inbox orders can be rejected');
    return { ok: true };
  }

  // ─── Checkouts / abandoned carts ────────────────────────────────────────

  async syncCheckout(payload: any): Promise<string> {
    const c = mapShopifyCheckout(payload);
    const data = this.checkoutData(c, payload);
    let row = await this.prisma.shopifyCheckout.findUnique({ where: { token: c.token } });
    // The backup poller may already have saved it under its numeric id.
    if (!row && c.shopifyCheckoutId) {
      row = await this.prisma.shopifyCheckout.findUnique({ where: { token: `gql-${c.shopifyCheckoutId}` } });
    }
    // A later update with blank contact fields must not wipe a name/phone/email
    // saved from an earlier event.
    if (row) {
      data.customerName = data.customerName ?? row.customerName;
      data.phone = data.phone ?? row.phone;
      data.email = data.email ?? row.email;
    }
    row = row
      ? await this.prisma.shopifyCheckout.update({ where: { id: row.id }, data: { token: c.token, ...data } })
      : await this.prisma.shopifyCheckout.create({ data: { token: c.token, ...data } });

    // The order webhook can arrive before the checkout's last update.
    if (row.status !== 'CONVERTED') {
      const inbox = await this.prisma.shopifyInboxOrder.findFirst({
        where: { payload: { path: ['checkout_token'], equals: c.token } },
        select: { id: true, orderId: true },
      });
      if (inbox) {
        await this.prisma.shopifyCheckout.update({ where: { id: row.id }, data: { status: 'CONVERTED', convertedAt: new Date(), inboxOrderId: inbox.id, orderId: inbox.orderId } });
        return `Checkout ${c.token} saved and marked converted`;
      }
    }
    return `Checkout ${c.token} saved (${row.status})`;
  }

  private checkoutData(c: MappedCheckout, raw: any) {
    return {
      shopifyCheckoutId: c.shopifyCheckoutId,
      customerName: c.customerName,
      phone: c.phone,
      email: c.email,
      cartItems: c.cartItems as Prisma.InputJsonValue,
      cartValue: new Prisma.Decimal(c.cartValue),
      currency: c.currency,
      recoveryUrl: c.recoveryUrl,
      completedAt: c.completedAt,
      lastActivityAt: c.lastActivityAt,
      raw: raw as Prisma.InputJsonValue,
    };
  }

  // OPEN → ABANDONED after 60 min with no order. No automatic lead/task
  // (Sanket, 2026-10-13) — the team acts on it from the inbox.
  @Cron('0 */5 * * * *')
  async markAbandoned() {
    if (!isShopifyEnabled() || this.abandoning) return;
    this.abandoning = true;
    try {
      const due = await this.prisma.shopifyCheckout.findMany({
        where: { status: 'OPEN', completedAt: null, lastActivityAt: { lt: new Date(Date.now() - ABANDON_AFTER_MS) } },
        orderBy: { lastActivityAt: 'asc' },
        take: 50,
      });
      for (const row of due) {
        // Its own order, or a later order by the same customer from another cart.
        const sameCustomer: Prisma.ShopifyInboxOrderWhereInput[] = [];
        if (row.phone) sameCustomer.push({ phone: row.phone });
        if (row.email) sameCustomer.push({ email: { equals: row.email, mode: 'insensitive' } });
        const inbox = await this.prisma.shopifyInboxOrder.findFirst({
          where: {
            OR: [
              { payload: { path: ['checkout_token'], equals: row.token } },
              ...(sameCustomer.length ? [{ orderDate: { gte: row.createdAt }, OR: sameCustomer }] : []),
            ],
          },
          select: { id: true, orderId: true },
        });
        if (inbox) {
          await this.prisma.shopifyCheckout.update({ where: { id: row.id }, data: { status: 'CONVERTED', convertedAt: new Date(), inboxOrderId: inbox.id, orderId: inbox.orderId } });
          continue;
        }
        await this.prisma.shopifyCheckout.updateMany({
          where: { id: row.id, status: 'OPEN' },
          data: { status: 'ABANDONED', abandonedAt: new Date() },
        });
      }
    } finally {
      this.abandoning = false;
    }
  }

  // Backup for missed checkout webhooks: pull recent abandoned checkouts from
  // the Admin GraphQL API. Off unless SHOPIFY_STORE_DOMAIN and
  // SHOPIFY_ADMIN_TOKEN (scopes read_orders, read_customers) are also set.
  @Cron('0 */30 * * * *')
  async pollAbandonedCheckouts() {
    const domain = process.env.SHOPIFY_STORE_DOMAIN?.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
    const token = process.env.SHOPIFY_ADMIN_TOKEN?.trim();
    if (!isShopifyEnabled() || !domain || !token || this.polling) return;
    this.polling = true;
    try {
      const version = process.env.SHOPIFY_API_VERSION?.trim() || '2026-07';
      const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      const res = await fetch(`https://${domain}/admin/api/${version}/graphql.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
        body: JSON.stringify({ query: ABANDONED_CHECKOUTS_QUERY, variables: { query: `updated_at:>='${since}'` } }),
        signal: AbortSignal.timeout(20000),
      });
      const json: any = await res.json().catch(() => null);
      if (!res.ok || json?.errors) {
        this.logger.error(`Shopify abandonedCheckouts poll failed: HTTP ${res.status} ${JSON.stringify(json?.errors ?? json)?.slice(0, 500)}`);
        return;
      }
      let added = 0;
      for (const node of json?.data?.abandonedCheckouts?.nodes ?? []) {
        if (node?.completedAt) continue;
        const c = mapGraphqlCheckout(node);
        const existing = await this.prisma.shopifyCheckout.findFirst({
          where: { OR: [{ shopifyCheckoutId: c.shopifyCheckoutId }, { token: c.token }] },
          select: { id: true, recoveryUrl: true, customerName: true, phone: true, email: true },
        });
        if (existing) {
          // The webhook row is often saved before the customer types any
          // contact details; fill only the fields it is still missing.
          const fill: Prisma.ShopifyCheckoutUpdateInput = {};
          if (!existing.recoveryUrl && c.recoveryUrl) fill.recoveryUrl = c.recoveryUrl;
          if (!existing.customerName && c.customerName) fill.customerName = c.customerName;
          if (!existing.phone && c.phone) fill.phone = c.phone;
          if (!existing.email && c.email) fill.email = c.email;
          if (Object.keys(fill).length) {
            await this.prisma.shopifyCheckout.update({ where: { id: existing.id }, data: fill });
          }
          continue;
        }
        await this.prisma.shopifyCheckout.create({ data: { token: c.token, ...this.checkoutData(c, node) } });
        added++;
      }
      if (added) this.logger.log(`Shopify poll: saved ${added} abandoned checkout(s) missed by webhooks`);
    } catch (err: any) {
      this.logger.error(`Shopify abandonedCheckouts poll failed: ${err?.message}`);
    } finally {
      this.polling = false;
    }
  }
}
