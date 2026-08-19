// backend/src/production/production.service.ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderProductionStage, OrderStatus, ProductionCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { getPrintUnitMultiplier } from './clubbing-sheet.service';

const STAGE_LABEL: Record<string, string> = {
  PRINTING:           'Printing 🖨️',
  PROCESSING:         'Processing ⚙️',
  READY_FOR_DISPATCH: 'Ready for Dispatch 📦',
  NOT_PRINTED:        'Not Started',
};

function summarizeDesignFiles(value: unknown) {
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

// Resolve size / gsm / sides for a production item, preferring values
// embedded in productionNotes ("Size: 9*12, GSM: 300, Sides: DOUBLE_SIDE")
// and falling back to the product's own fields. Without this fallback,
// orders whose notes don't follow the exact format show as "—" in the UI.
function resolveItemDetails(item: {
  productionNotes?: string | null;
  product: { sizeInches?: string | null; gsm?: number | null; sides?: string | null };
}) {
  const notes = item.productionNotes ?? '';
  // Stop at commas/newlines so "GSM: 70, Sides: DOUBLE_SIDE" doesn't
  // capture "70," with a trailing comma.
  let size = notes.match(/Size[\s:]+([^\n,]+)/i)?.[1]?.trim() ?? null;
  let gsm = notes.match(/GSM[\s:]+([^,\n\s]+)/i)?.[1]?.trim() ?? null;
  let sidesRaw = notes.match(/Sides[\s:]+([^,\n\s]+)/i)?.[1]?.trim() ?? null;

  if (!size && item.product.sizeInches) size = item.product.sizeInches;
  if (!gsm && item.product.gsm != null) gsm = String(item.product.gsm);
  if (!sidesRaw && item.product.sides) sidesRaw = item.product.sides;

  const sides =
    sidesRaw === 'SINGLE_SIDE' ? 'Single'
    : sidesRaw === 'DOUBLE_SIDE' ? 'Double'
    : (sidesRaw ?? null);

  return { size, gsm, sides };
}

function parseIstDateOnly(value?: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00+05:30`);
  if (Number.isNaN(date.getTime())) throw new BadRequestException('Invalid follow-up date');
  return date;
}

@Injectable()
export class ProductionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  async listInProduction() {
    const orders = await this.prisma.order.findMany({
      where: {
        // Normally APPROVED/IN_PRODUCTION already implies "has an unfinished
        // item" (the rollup above only sets READY_FOR_DISPATCH once every
        // item is done). But an order can now have ONE item submitted for
        // dispatch early while a sibling item is still printing — that
        // pushes order.status past IN_PRODUCTION (PENDING_DISPATCH_APPROVAL /
        // READY_FOR_DISPATCH / PARTIALLY_DISPATCHED) even though there's
        // still real production work left. Include those statuses too, but
        // gate on the item-level check so a fully-finished order (all items
        // READY_FOR_DISPATCH) doesn't reappear here just because it's
        // working its way through the dispatch pipeline.
        status: {
          in: [
            OrderStatus.APPROVED,
            OrderStatus.IN_PRODUCTION,
            OrderStatus.PENDING_DISPATCH_APPROVAL,
            OrderStatus.READY_FOR_DISPATCH,
            OrderStatus.PARTIALLY_DISPATCHED,
          ],
        },
        // cancelledAt: null (plain key, not a spread -- same rule as
        // dispatchedAt elsewhere in this codebase) so an item whose
        // cancellation was approved no longer counts as "still needs
        // production" -- otherwise an order left with only cancelled items
        // outstanding would never leave this queue.
        items: { some: { itemProductionStage: { not: OrderProductionStage.READY_FOR_DISPATCH }, cancelledAt: null } },
        isSample: false,
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        customer: { select: { businessName: true, phone: true } },
        salesAgent: { select: { id: true, fullName: true } },
        // `include` instead of a narrow `select` here -- dropping the `as
        // any` cast (previous attempt) did NOT fix Railway's build, the
        // error was identical either way. Adding `cancelledAt` to this
        // relation's `select` alongside its already-large field list and a
        // nested `product: { select: {...} }` tips some Prisma+TS inference
        // complexity limit, and TS silently falls back to inferring `items`
        // as `Order[keyof Order]` (a union of every relation's array type)
        // instead of the actual OrderItem shape -- hence errors like
        // "Property 'name' does not exist" on what looks like an unrelated
        // model. `include` sidesteps the narrow-select inference path
        // entirely (same safe-alternative already documented for the
        // nested-any-spread gotcha). Pulls every OrderItem/Product scalar
        // column instead of a subset, which is harmless here since nothing
        // downstream needs a narrower shape. Broke a deploy 2026-08-18.
        items: { include: { product: true } },
      },
    });

    // Fetch designFiles separately since it's a JSON field not in TypeScript types


    return orders.map((o) => ({
      id: o.id,
      orderNo: o.orderNumber,
      customerName: o.customer.businessName,
      customerPhone: o.customer.phone,
      salesAgentName: o.salesAgent?.fullName ?? null,
      status: o.status,
      productionStage: o.productionStage,
      orderDate: o.orderDate.toISOString(),
      notes: o.notes,
      // Cancelled items shouldn't show up as production work at all -- see
      // the matching `where` exclusion above.
      items: o.items.filter((i) => !i.cancelledAt).map((i) => {
        const { size, gsm, sides } = resolveItemDetails(i);
        return {
          id: i.id,
          productName: i.product.name,
          sku: i.product.sku,
          quantity: i.quantity,
          // Some products (letterpad, reference pad, bill book) package many
          // physical printed sheets into one order-quantity unit. The
          // Sheets > Unassigned screen needs this converted figure -- not
          // raw `quantity` -- to correctly compare an item's remaining
          // balance against a PrintSheet's own (much larger) physical run
          // size. See getPrintUnitMultiplier for the shared ratio table.
          effectiveQuantity: i.quantity * getPrintUnitMultiplier(i.product.name, (i.product as any).category?.name),
          unitPrice: Number(i.unitPrice),
          lineTotal: Number(i.lineTotal),
          productionNotes: i.productionNotes,
          artworkNotes: i.artworkNotes,
          itemProductionStage: i.itemProductionStage,
          processingFollowUpDate: i.processingFollowUpDate?.toISOString() ?? null,
          productionCategory: i.productionCategory ?? null,
          // Resolved product details (prefer notes, fall back to product table)
          size,
          gsm,
          sides,
          designFiles: [],
        };
      }),
    }));
  }

  async assignCategory(
    itemId: string,
    productionCategory: ProductionCategory,
    userId: string,
  ) {
    const item = await this.prisma.orderItem.findUnique({
      where: { id: itemId },
      include: { order: true },
    });
    if (!item) throw new NotFoundException('Order item not found');

    await this.prisma.orderItem.update({
      where: { id: itemId },
      data: { productionCategory },
    });

    await this.prisma.statusLog.create({
      data: {
        orderId: item.orderId,
        fromStatus: item.order.status,
        toStatus: item.order.status,
        changedById: userId,
        reason: `Production category assigned: ${productionCategory}`,
        metadata: {
          eventType: 'PRODUCTION_CATEGORY_ASSIGNED',
          orderItemId: item.id,
          productionCategory,
        },
      },
    });

    // Move order to IN_PRODUCTION if still APPROVED
    if (item.order.status === OrderStatus.APPROVED) {
      await this.prisma.order.update({
        where: { id: item.orderId },
        data: { status: OrderStatus.IN_PRODUCTION },
      });
      await this.prisma.statusLog.create({
        data: {
          orderId: item.orderId,
          fromStatus: item.order.status,
          toStatus: OrderStatus.IN_PRODUCTION,
          changedById: userId,
          reason: `Production category assigned: ${productionCategory}`,
          metadata: {
            eventType: 'ORDER_MOVED_TO_PRODUCTION',
            orderItemId: item.id,
            productionCategory,
          },
        },
      });
    }

    return { success: true, itemId, productionCategory };
  }

  // Called when sheet status changes - updates all order items on that sheet
  async updateSheetItemStages(sheetId: string, sheetStatus: string, userId: string) {
    // Map sheet status to order item production stage
    const stageMap: Record<string, OrderProductionStage | null> = {
      INCOMPLETE: OrderProductionStage.NOT_PRINTED,
      COMPLETE:   OrderProductionStage.NOT_PRINTED,
      SETTING:    OrderProductionStage.NOT_PRINTED,
      PRINTING:   OrderProductionStage.PRINTING,
      PROCESSING: OrderProductionStage.PROCESSING,
      DONE:       OrderProductionStage.READY_FOR_DISPATCH,
    };

    const targetStage = stageMap[sheetStatus];
    if (!targetStage) return;

    // Get all order items on this sheet
    const sheet = await this.prisma.printSheet.findUnique({
      where: { id: sheetId },
      include: {
        items: {
          include: {
            orderItem: { include: { order: { include: { customer: true, salesAgent: { select: { fullName: true } }, items: { include: { product: true } } } } } },
          },
        },
      },
    });
    if (!sheet) return;

    // Update each order item's stage
    for (const si of sheet.items) {
      await this.prisma.orderItem.update({
        where: { id: si.orderItemId },
        data: { itemProductionStage: targetStage },
      });
    }

    // Send WhatsApp notifications for PRINTING stage
    if (targetStage === OrderProductionStage.PRINTING) {
      const uniqueOrders = [...new Map(sheet.items.map(si => [si.orderItem.orderId, si.orderItem.order])).values()];
      for (const order of uniqueOrders) {
        if (order.customer.phone) {
          const productNames = order.items.map(i => i.product.name).join(', ');
          void this.whatsapp.sendOrderUpdate({
            customerName:  order.customer.businessName,
            customerPhone: order.customer.phone,
            orderNo:       order.orderNumber,
            product:       productNames,
            status:        'Printing 🖨️',
            agentName:     order.salesAgent?.fullName ?? 'Rareprint Team',
          });
        }
      }
    }
  }

  async updateItemStage(
    itemId: string,
    stage: OrderProductionStage,
    userId: string,
  ) {
    const item = await this.prisma.orderItem.findUnique({
      where: { id: itemId },
      include: {
        order: {
          include: {
            customer: true,
            salesAgent: { select: { fullName: true } },
            items: { include: { product: true } },
          },
        },
        product: true,
      },
    });
    if (!item) throw new NotFoundException('Order item not found');
    if (item.cancelledAt) {
      throw new BadRequestException('This item was cancelled and can no longer move through production');
    }

    await this.prisma.orderItem.update({
      where: { id: itemId },
      data: { itemProductionStage: stage },
    });

    // ── Log every item stage change ───────────────────────────────────────
    const stageLabel = STAGE_LABEL[stage] ?? stage.replace(/_/g, ' ');
    const sizeInfo = item.productionNotes?.match(/Size:\s*([^,|]+)/)?.[1]?.trim()
      ?? (item.product as any).sizeInches ?? '';
    await this.prisma.statusLog.create({
      data: {
        orderId: item.orderId,
        fromStatus: item.order.status,
        toStatus: item.order.status,
        changedById: userId,
        reason: `Item: ${item.product.name}${sizeInfo ? ' ' + sizeInfo : ''} → ${stageLabel}`,
        metadata: {
          eventType: 'ITEM_STAGE_CHANGED',
          orderItemId: item.id,
          itemStage: stage,
          productName: item.product.name,
          productionCategory: item.productionCategory,
        },
      },
    });

    const allItems = await this.prisma.orderItem.findMany({
      where: { orderId: item.orderId },
    });

    const allReady = allItems.every(
      (i) => i.itemProductionStage === OrderProductionStage.READY_FOR_DISPATCH,
    );
    const anyInProgress = allItems.some(
      (i) =>
        i.itemProductionStage === OrderProductionStage.PRINTING ||
        i.itemProductionStage === OrderProductionStage.PROCESSING,
    );
    const anyReady = allItems.some(
      (i) => i.itemProductionStage === OrderProductionStage.READY_FOR_DISPATCH,
    );

    // Once an order has moved past normal production (e.g. one of its items
    // was already submitted for dispatch approval, or booked, while a
    // sibling item was still printing — see orders.service.ts's
    // submitDispatchBatch), this rollup must NOT touch order.status anymore.
    // Only recompute it while the order is still in its ordinary
    // APPROVED/IN_PRODUCTION lifecycle; PENDING_DISPATCH_APPROVAL/
    // READY_FOR_DISPATCH/PARTIALLY_DISPATCHED/DISPATCHED are owned by the
    // accounts-approval/dispatch flow from that point on. Without this
    // guard, a later item finishing production would silently overwrite an
    // already-submitted order's status back to IN_PRODUCTION.
    const stillInNormalProduction = item.order.status === OrderStatus.APPROVED || item.order.status === OrderStatus.IN_PRODUCTION;
    let newOrderStatus = item.order.status;
    if (stillInNormalProduction) {
      if (allReady) newOrderStatus = OrderStatus.READY_FOR_DISPATCH;
      else if (anyInProgress || anyReady) newOrderStatus = OrderStatus.IN_PRODUCTION;
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
          reason: `Order status updated: all items ${stage === 'READY_FOR_DISPATCH' ? 'ready for dispatch' : 'in production'}`,
        },
      });
    }

    if (stage !== OrderProductionStage.NOT_PRINTED && item.order.customer.phone) {
      const stageLabel = STAGE_LABEL[stage] ?? stage.replace(/_/g, ' ');
      const productNames = item.order.items.map(i => i.product.name).join(', ');
      void this.whatsapp.sendOrderUpdate({
        customerName:  item.order.customer.businessName,
        customerPhone: item.order.customer.phone,
        orderNo:       item.order.orderNumber,
        product:       productNames,
        status:        stageLabel,
        agentName:     item.order.salesAgent?.fullName ?? 'Rareprint Team',
      });
    }

    return { success: true, itemId, stage };
  }

  async updateItemFollowUpDate(itemId: string, processingFollowUpDate?: string | null) {
    const item = await this.prisma.orderItem.findUnique({ where: { id: itemId }, select: { id: true } });
    if (!item) throw new NotFoundException('Order item not found');
    return this.prisma.orderItem.update({
      where: { id: itemId },
      data: { processingFollowUpDate: parseIstDateOnly(processingFollowUpDate) },
      select: { id: true, processingFollowUpDate: true },
    });
  }
}
