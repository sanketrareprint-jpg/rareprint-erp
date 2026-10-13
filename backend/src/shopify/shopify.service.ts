import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { createHash } from 'crypto';
import {
  ActivityType, LeadSource, LeadStatus, OrderProductionStage, OrderStatus, PaymentMethod,
  PaymentStatus, PaymentVerificationStatus, Prisma, PrintingType, ProductSides, TaskPriority, TaskStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CrmService } from '../crm/crm.service';
import {
  MappedCheckout, MappedCustomer, MappedOrder, SHOPIFY_GENERIC_GST_RATE_PCT, SHOPIFY_GENERIC_PRODUCT_SKU,
  SHOPIFY_LEAD_TAG, describeCart, mapGraphqlCheckout, mapShopifyCheckout, mapShopifyOrder, paymentToRecord,
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
        ? await this.syncOrder(log.payload)
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

  async syncOrder(payload: any): Promise<string> {
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
        const created = await this.createOrder(tx, m);
        orderId = created.id;
        result = `Created order ${created.orderNumber}`;
      } else {
        const prevUpdatedAt = (existing.shopifyData as any)?.updatedAt;
        if (prevUpdatedAt && m.updatedAt && Date.parse(m.updatedAt) < Date.parse(prevUpdatedAt)) {
          return `Skipped: older than the last update already applied to ${existing.orderNumber}`;
        }
        orderId = existing.id;
        result = await this.updateOrder(tx, existing, m);
      }

      const extras = [
        await this.recordPayment(tx, orderId, m),
        await this.applyCancellation(tx, orderId, m),
        await this.convertCheckouts(tx, orderId, m),
      ].filter(Boolean);
      return [result, ...extras].join('; ');
    }, { timeout: 30000, maxWait: 15000 });
  }

  private itemsCreateData(lines: MappedOrder['lines'], productIds: string[]) {
    return lines.map((l, i) => ({
      productId: productIds[i],
      quantity: l.quantity,
      unitPrice: new Prisma.Decimal(l.unitPrice),
      lineDiscount: new Prisma.Decimal(l.lineDiscount),
      taxRatePct: new Prisma.Decimal(0),
      taxAmount: new Prisma.Decimal(0),
      lineTotal: new Prisma.Decimal(l.lineTotal),
      productionNotes: l.productionNotes,
      artworkNotes: l.artworkNotes,
    }));
  }

  private async createOrder(tx: Tx, m: MappedOrder) {
    const customer = await this.findOrCreateCustomer(tx, m.customer);
    const productIds = await this.resolveProducts(tx, m.lines);
    const taken = await tx.order.findUnique({ where: { orderNumber: m.orderNumber }, select: { id: true } });
    const orderNumber = taken ? `${m.orderNumber}-${m.shopifyOrderId.slice(-6)}` : m.orderNumber;

    const order = await tx.order.create({
      data: {
        orderNumber,
        orderDate: m.orderDate,
        customerId: customer.id,
        status: OrderStatus.PENDING_APPROVAL,
        paymentStatus: PaymentStatus.PENDING,
        subtotal: new Prisma.Decimal(m.itemsTotal),
        discount: new Prisma.Decimal(0),
        taxAmount: new Prisma.Decimal(0),
        shippingCharge: new Prisma.Decimal(0),
        courierChargeQuoted: m.shippingCharge > 0 ? new Prisma.Decimal(m.shippingCharge) : null,
        grandTotal: new Prisma.Decimal(m.itemsTotal),
        notes: m.notes,
        leadSource: 'SHOPIFY',
        isTest: m.isTest,
        shopifyOrderId: m.shopifyOrderId,
        shopifyData: m.shopifyData as Prisma.InputJsonValue,
        items: { create: this.itemsCreateData(m.lines, productIds) },
      },
      select: { id: true, orderNumber: true },
    });
    await tx.statusLog.create({
      data: { orderId: order.id, fromStatus: null, toStatus: OrderStatus.PENDING_APPROVAL, reason: `Order received from Shopify ${m.shopifyName}` },
    });
    return order;
  }

  private async updateOrder(tx: Tx, existing: any, m: MappedOrder): Promise<string> {
    const prev = (existing.shopifyData ?? {}) as Record<string, any>;
    const shopifyData: Record<string, any> = { ...m.shopifyData, editFlaggedHash: prev.editFlaggedHash ?? null, cancelHandledAt: prev.cancelHandledAt ?? null };
    const data: Prisma.OrderUpdateInput = {};
    const addNotes: string[] = [];
    const actions: string[] = [];

    // Before Accounts approves (nothing invoiced, printed or placed on a sheet)
    // the ERP order simply follows Shopify. After that, items/amounts are never
    // changed automatically — the order is flagged for review instead.
    const itemIds = existing.items.map((i: any) => i.id);
    const linked = itemIds.length === 0 ? 0 : (await Promise.all([
      tx.printSheetItem.count({ where: { orderItemId: { in: itemIds } } }),
      tx.jobWork.count({ where: { orderItemId: { in: itemIds } } }),
      tx.itemStageLog.count({ where: { orderItemId: { in: itemIds } } }),
      tx.commissionOverride.count({ where: { orderItemId: { in: itemIds } } }),
    ])).reduce((a, b) => a + b, 0);
    const editable = existing.status === OrderStatus.PENDING_APPROVAL
      && !existing.invoice
      && !existing.cancellationRequestedAt
      && linked === 0
      && existing.items.every((i: any) => i.itemProductionStage === OrderProductionStage.NOT_PRINTED && !i.cancelledAt);

    if (editable) {
      const customer = await this.findOrCreateCustomer(tx, m.customer);
      if (customer.id !== existing.customerId) data.customer = { connect: { id: customer.id } };
      if (prev.contentHash !== m.contentHash) {
        const productIds = await this.resolveProducts(tx, m.lines);
        await tx.orderItem.deleteMany({ where: { orderId: existing.id } });
        await tx.orderItem.createMany({ data: this.itemsCreateData(m.lines, productIds).map((row) => ({ ...row, orderId: existing.id })) });
        data.subtotal = new Prisma.Decimal(m.itemsTotal);
        data.grandTotal = new Prisma.Decimal(m.itemsTotal);
        data.courierChargeQuoted = m.shippingCharge > 0 ? new Prisma.Decimal(m.shippingCharge) : null;
        addNotes.push(`Updated from Shopify edit ${new Date().toISOString().slice(0, 10)} (items now ₹${m.itemsTotal.toFixed(2)})`);
        actions.push('items replaced from Shopify edit');
      }
    } else if (prev.contentHash !== m.contentHash && prev.editFlaggedHash !== m.contentHash) {
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

  private async findOrCreateCustomer(tx: Tx, c: MappedCustomer) {
    const existing = c.phone
      ? await tx.customer.findFirst({
          where: { OR: [{ phone: c.phone }, { phone2: c.phone }, { phone: { endsWith: c.phone } }, { phone2: { endsWith: c.phone } }] },
          orderBy: { createdAt: 'asc' },
        })
      : c.email
        ? await tx.customer.findFirst({ where: { email: { equals: c.email, mode: 'insensitive' } }, orderBy: { createdAt: 'asc' } })
        : null;

    const upper = (v: string | null) => (v ? v.toUpperCase() : null);
    // Same as OrdersService.create: an existing customer's name is never
    // overwritten (every past invoice reads it); contact/address details are,
    // and state must follow this order's shipping state for GST.
    const details = {
      ...(c.email ? { email: c.email } : {}),
      ...(c.shippingAddress ? { shippingAddress: c.shippingAddress } : {}),
      ...(c.billingAddress ? { billingAddress: c.billingAddress } : {}),
      ...(c.city ? { city: upper(c.city) } : {}),
      ...(c.state ? { state: upper(c.state) } : {}),
      ...(c.pincode ? { pincode: c.pincode } : {}),
      ...(c.gstin ? { gstNumber: c.gstin } : {}),
    };
    if (existing) return tx.customer.update({ where: { id: existing.id }, data: details });

    const name = upper(c.company ?? c.name)!;
    return tx.customer.create({
      data: {
        customerCode: `SHOP-CUST-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        businessName: name,
        contactPerson: upper(c.name),
        phone: c.phone,
        ...details,
      },
    });
  }

  // SKU match against the ERP catalogue, else the one generic "Shopify Item"
  // product (GST 18%); the real title/variant/properties live on the item.
  private async resolveProducts(tx: Tx, lines: MappedOrder['lines']): Promise<string[]> {
    const ids: string[] = [];
    let genericId: string | null = null;
    for (const line of lines) {
      const match = line.sku
        ? await tx.product.findFirst({ where: { isActive: true, sku: { equals: line.sku, mode: 'insensitive' } }, select: { id: true } })
        : null;
      if (match) { ids.push(match.id); continue; }
      genericId ??= await this.genericProductId(tx);
      ids.push(genericId);
    }
    return ids;
  }

  private async genericProductId(tx: Tx): Promise<string> {
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
  // checkout from the same phone/email — and their follow-up lead (WON) /
  // task (DONE).
  private async convertCheckouts(tx: Tx, orderId: string, m: MappedOrder): Promise<string | null> {
    const or: Prisma.ShopifyCheckoutWhereInput[] = [];
    if (m.checkoutToken) or.push({ token: m.checkoutToken });
    if (m.customer.phone) or.push({ status: 'ABANDONED', phone: m.customer.phone, lastActivityAt: { lte: m.orderDate } });
    if (m.customer.email) or.push({ status: 'ABANDONED', email: { equals: m.customer.email, mode: 'insensitive' }, lastActivityAt: { lte: m.orderDate } });
    if (!or.length) return null;
    const rows = await tx.shopifyCheckout.findMany({ where: { status: { not: 'CONVERTED' }, OR: or } });
    if (!rows.length) return null;

    const order = await tx.order.findUnique({ where: { id: orderId }, select: { orderNumber: true } });
    for (const row of rows) {
      await tx.shopifyCheckout.update({ where: { id: row.id }, data: { status: 'CONVERTED', convertedAt: new Date(), orderId } });
      if (row.leadId) {
        const lead = await tx.lead.findUnique({ where: { id: row.leadId }, select: { id: true, status: true, agentId: true } });
        if (lead && lead.status !== LeadStatus.WON) {
          await tx.lead.update({ where: { id: lead.id }, data: { status: LeadStatus.WON, convertedOrderId: orderId } });
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

  // ─── Checkouts / abandoned carts ────────────────────────────────────────

  async syncCheckout(payload: any): Promise<string> {
    const c = mapShopifyCheckout(payload);
    const data = this.checkoutData(c, payload);
    let row = await this.prisma.shopifyCheckout.findUnique({ where: { token: c.token } });
    // The backup poller may already have saved it under its numeric id.
    if (!row && c.shopifyCheckoutId) {
      row = await this.prisma.shopifyCheckout.findUnique({ where: { token: `gql-${c.shopifyCheckoutId}` } });
    }
    row = row
      ? await this.prisma.shopifyCheckout.update({ where: { id: row.id }, data: { token: c.token, ...data } })
      : await this.prisma.shopifyCheckout.create({ data: { token: c.token, ...data } });

    // The order webhook can arrive before the checkout's last update.
    if (row.status !== 'CONVERTED') {
      const order = await this.prisma.order.findFirst({
        where: { shopifyData: { path: ['checkoutToken'], equals: c.token } },
        select: { id: true },
      });
      if (order) {
        await this.prisma.shopifyCheckout.update({ where: { id: row.id }, data: { status: 'CONVERTED', convertedAt: new Date(), orderId: order.id } });
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
        const sameCustomer: Prisma.CustomerWhereInput[] = [];
        if (row.phone) sameCustomer.push({ phone: { endsWith: row.phone } }, { phone2: { endsWith: row.phone } });
        if (row.email) sameCustomer.push({ email: { equals: row.email, mode: 'insensitive' } });
        const order = await this.prisma.order.findFirst({
          where: {
            OR: [
              { shopifyData: { path: ['checkoutToken'], equals: row.token } },
              ...(sameCustomer.length ? [{ shopifyOrderId: { not: null }, orderDate: { gte: row.createdAt }, customer: { OR: sameCustomer } }] : []),
            ],
          },
          select: { id: true },
        });
        if (order) {
          await this.prisma.shopifyCheckout.update({ where: { id: row.id }, data: { status: 'CONVERTED', convertedAt: new Date(), orderId: order.id } });
          continue;
        }
        const claimed = await this.prisma.shopifyCheckout.updateMany({
          where: { id: row.id, status: 'OPEN' },
          data: { status: 'ABANDONED', abandonedAt: new Date() },
        });
        if (claimed.count === 0) continue;
        try {
          const followUp = await this.createFollowUp(row);
          if (followUp.leadId || followUp.taskId) {
            await this.prisma.shopifyCheckout.update({ where: { id: row.id }, data: followUp });
          }
        } catch (err: any) {
          // e.g. no active sales agent — put it back so the next run retries.
          this.logger.error(`Shopify abandoned checkout ${row.token} follow-up failed: ${err?.message}`);
          await this.prisma.shopifyCheckout.update({ where: { id: row.id }, data: { status: 'OPEN', abandonedAt: null } });
        }
      }
    } finally {
      this.abandoning = false;
    }
  }

  // Phone → Lead (an open lead for the same phone gets a note instead of a
  // duplicate). Email only → Task (Lead.phone is required and the dialer
  // calls leads). Neither → saved, no follow-up.
  private async createFollowUp(row: {
    token: string; customerName: string | null; phone: string | null; email: string | null;
    cartItems: Prisma.JsonValue; cartValue: Prisma.Decimal; recoveryUrl: string | null;
  }): Promise<{ leadId?: string; taskId?: string }> {
    if (!row.phone && !row.email) return {};
    const cartItems = (Array.isArray(row.cartItems) ? row.cartItems : []) as unknown as MappedCheckout['cartItems'];
    const description = describeCart({ cartItems, cartValue: Number(row.cartValue), recoveryUrl: row.recoveryUrl });

    if (row.phone) {
      const open = await this.prisma.lead.findFirst({
        where: { phone: { endsWith: row.phone }, status: { notIn: [LeadStatus.WON, LeadStatus.LOST] } },
        orderBy: { updatedAt: 'desc' },
      });
      if (open) {
        await this.prisma.lead.update({
          where: { id: open.id },
          data: { tags: open.tags.includes(SHOPIFY_LEAD_TAG) ? open.tags : [...open.tags, SHOPIFY_LEAD_TAG] },
        });
        await this.prisma.leadActivity.create({
          data: { leadId: open.id, type: ActivityType.NOTE_ADDED, description, createdById: open.agentId },
        });
        return { leadId: open.id };
      }
      const agent = await this.crm.getNextAgent();
      const lead = await this.prisma.lead.create({
        data: {
          name: row.customerName ?? `Shopify cart ${row.phone.slice(-4)}`,
          phone: row.phone,
          email: row.email,
          productInterest: cartItems.map((i) => i.title).join(', ').slice(0, 250) || null,
          estimatedQty: cartItems.reduce((s, i) => s + (i.quantity || 0), 0) || null,
          estimatedValue: Number(row.cartValue) || null,
          notes: description,
          tags: [SHOPIFY_LEAD_TAG],
          source: LeadSource.ONLINE_FORM,
          status: LeadStatus.NEW,
          agentId: agent.id,
        },
      });
      await this.prisma.leadActivity.create({
        data: { leadId: lead.id, type: ActivityType.NOTE_ADDED, description: `Lead created from an abandoned Shopify checkout and assigned to ${agent.fullName}`, createdById: agent.id },
      });
      return { leadId: lead.id };
    }

    const agent = await this.crm.getNextAgent();
    const task = await this.prisma.task.create({
      data: {
        title: `Email follow-up: abandoned Shopify cart — ${row.customerName ?? row.email}`.slice(0, 200),
        description: `${description}\nEmail: ${row.email} (no phone given)`,
        priority: TaskPriority.HIGH,
        dueDate: new Date(),
        createdById: agent.id,
        assignedToId: agent.id,
      },
    });
    return { taskId: task.id };
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
          select: { id: true, recoveryUrl: true },
        });
        if (existing) {
          if (!existing.recoveryUrl && c.recoveryUrl) {
            await this.prisma.shopifyCheckout.update({ where: { id: existing.id }, data: { recoveryUrl: c.recoveryUrl } });
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
