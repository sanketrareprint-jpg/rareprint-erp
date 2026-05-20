import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';

@Injectable()
export class NotificationsService {
  private readonly reassuranceCampaigns = [
    'order_reassurance_01',
    'order_reassurance_02',
    'order_reassurance_03',
    'order_reassurance_04',
    'order_reassurance_05',
    'order_reassurance_06',
    'order_reassurance_07',
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async findUser(fullName: string) {
    return this.prisma.user.findFirst({ where: { fullName: { equals: fullName, mode: 'insensitive' } } });
  }

  private hoursAgo(hours: number): Date {
    const d = new Date();
    d.setHours(d.getHours() - hours);
    return d;
  }

  private async alreadyExists(type: string, orderId?: string, itemId?: string, sheetId?: string, jobWorkId?: string) {
    return this.prisma.notification.findFirst({
      where: { type, isResolved: false, ...(orderId && { orderId }), ...(itemId && { itemId }), ...(sheetId && { sheetId }), ...(jobWorkId && { jobWorkId }) },
    });
  }

  private async create(data: {
    type: string; title: string; message: string; priority?: string;
    toUserId: string; toUserName: string; orderId?: string; orderNo?: string;
    itemId?: string; sheetId?: string; jobWorkId?: string; copyToAdmin?: boolean;
  }) {
    return this.prisma.notification.create({ data: { ...data, priority: data.priority ?? 'NORMAL' } });
  }

  private async withProductDetails(notifications: any[]) {
    const itemIds = [...new Set(notifications.map(n => n.itemId).filter(Boolean))];
    const orderIds = [...new Set(notifications.map(n => n.orderId).filter(Boolean))];
    if (itemIds.length === 0 && orderIds.length === 0) return notifications;

    const items = await this.prisma.orderItem.findMany({
      where: {
        OR: [
          ...(itemIds.length ? [{ id: { in: itemIds } }] : []),
          ...(orderIds.length ? [{ orderId: { in: orderIds } }] : []),
        ],
      },
      include: {
        product: true,
        order: { include: { customer: true, salesAgent: true } },
      },
    });
    const byId = new Map(items.map(item => [item.id, item]));
    const byOrderId = new Map<string, typeof items>();
    for (const item of items) {
      const existing = byOrderId.get(item.orderId) ?? [];
      existing.push(item);
      byOrderId.set(item.orderId, existing);
    }

    const toProductDetails = (item: (typeof items)[number]) => {
      const product = item.product;
      const order = item.order as any;
      return {
        itemId: item.id,
        productName: product.name,
        sku: product.sku,
        quantity: item.quantity,
        size: product.sizeInches,
        openSize: product.openSizeInches,
        gsm: product.gsm,
        sides: product.sides,
        printingType: product.printingType,
        productionCategory: item.productionCategory,
        itemProductionStage: item.itemProductionStage,
        artworkNotes: item.artworkNotes,
        productionNotes: item.productionNotes,
        customerName: order.customer?.businessName,
        customerPhone: order.customer?.phone,
        salesAgentName: order.salesAgent?.fullName,
      };
    };

    return notifications.map(notification => {
      const item = notification.itemId ? byId.get(notification.itemId) : null;
      const orderItems = notification.orderId ? byOrderId.get(notification.orderId) ?? [] : [];
      const productItems = orderItems.map(toProductDetails);
      return {
        ...notification,
        productDetails: item ? toProductDetails(item) : productItems[0],
        productItems,
      };
    });
  }

  // ── Cron: runs every hour ─────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_HOUR)
  async runAllChecks() {
    await Promise.allSettled([
      this.sendDueOrderReassuranceMessages(),
      this.checkRule1_ProductionUnassigned(),
      this.checkRule2_InhouseDesignAttachedNotStarted(),
      this.checkRule3_InhouseDesignMissing(),
      this.checkRule4_InhousePrintingStuck(),
      this.checkRule5_InhouseProcessingStuck(),
      this.checkRule6_ClubbingVendorNotAssigned(),
      this.checkRule7a_ClubbingDueDateMissing(),
      this.checkRule7b_ClubbingFollowUp1DayBefore(),
      this.checkRule7c_ClubbingDueDatePassed(),
      this.checkRule8_SheetNotAssigned(),
      this.checkRule9_SheetCompleteNotMoved(),
      this.checkRule10_SheetPrintingStuck(),
      this.checkRule11b_SheetProcessingDueDateMissing(),
      this.checkRule11c_SheetProcessingFollowUp(),
      this.checkRule11d_SheetProcessingDueDatePassed(),
    ]);
  }

  async sendDueOrderReassuranceMessages() {
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const orders = await this.prisma.order.findMany({
      where: {
        status: {
          notIn: [
            OrderStatus.READY_FOR_DISPATCH,
            OrderStatus.PENDING_DISPATCH_APPROVAL,
            OrderStatus.PARTIALLY_DISPATCHED,
            OrderStatus.DISPATCHED,
            OrderStatus.DELIVERED,
            OrderStatus.CANCELLED,
          ],
        },
        orderDate: { lte: twoDaysAgo },
        customer: { phone: { not: null } },
        statusLogs: { none: { createdAt: { gte: startOfToday } } },
      },
      include: {
        customer: true,
        salesAgent: true,
        reassuranceLogs: { orderBy: { sentAt: 'desc' }, take: 1 },
        items: {
          select: {
            stageLogs: {
              where: { createdAt: { gte: startOfToday } },
              select: { id: true },
              take: 1,
            },
          },
        },
      },
      orderBy: { orderDate: 'asc' },
      take: 100,
    });

    let sent = 0;
    let skipped = 0;

    for (const order of orders) {
      if (order.items.some((item) => item.stageLogs.length > 0)) {
        skipped++;
        continue;
      }

      const lastLog = order.reassuranceLogs[0];
      if (lastLog && lastLog.sentAt > twoDaysAgo) {
        skipped++;
        continue;
      }

      const lastIndex = lastLog
        ? this.reassuranceCampaigns.indexOf(lastLog.campaignName)
        : -1;
      const campaignName = this.reassuranceCampaigns[(lastIndex + 1) % this.reassuranceCampaigns.length];
      const agentName = order.salesAgent?.fullName ?? 'Rareprint Team';

      const success = await this.whatsapp.sendOrderReassurance({
        campaignName,
        customerName: order.customer.businessName,
        customerPhone: order.customer.phone ?? '',
        orderNo: order.orderNumber,
        agentName,
      });

      await this.prisma.orderReassuranceLog.create({
        data: {
          orderId: order.id,
          orderNo: order.orderNumber,
          campaignName,
          success,
          error: success ? null : 'AiSensy send failed',
        },
      });

      if (success) sent++;
    }

    return { checked: orders.length, sent, skipped };
  }

  async getOrderReassuranceHistory(orderId: string) {
    return this.prisma.orderReassuranceLog.findMany({
      where: { orderId },
      orderBy: { sentAt: 'desc' },
      take: 30,
    });
  }

  // ── Rule 1: Production Unassigned 24h after approval ─────────────────────

  async checkRule1_ProductionUnassigned() {
    const prajakta = await this.findUser('PRAJAKTA DALAL');
    if (!prajakta) return;
    const orders = await this.prisma.order.findMany({
      where: { status: 'APPROVED', updatedAt: { lt: this.hoursAgo(24) } },
      include: { customer: true, items: true },
    });
    for (const order of orders) {
      const hasUnassigned = order.items.some(i => !i.productionCategory);
      if (!hasUnassigned) continue;
      const exists = await this.alreadyExists('PRODUCTION_UNASSIGNED', order.id);
      if (exists) continue;
      await this.create({
        type: 'PRODUCTION_UNASSIGNED', priority: 'HIGH',
        title: 'Production Category Not Assigned',
        message: `Order ${order.orderNumber} (${order.customer.businessName}) was approved over 24 hours ago but items have no production category assigned.`,
        toUserId: prajakta.id, toUserName: prajakta.fullName,
        orderId: order.id, orderNo: order.orderNumber,
      });
    }
  }

  // ── Rule 2: Inhouse design attached, not started ──────────────────────────

  async checkRule2_InhouseDesignAttachedNotStarted() {
    const prajakta = await this.findUser('PRAJAKTA DALAL');
    if (!prajakta) return;
    const items = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT oi.id, oi."orderId", oi."itemProductionStage", oi."designFiles",
             o."orderNumber", c."businessName"
      FROM "OrderItem" oi
      JOIN "Order" o ON o.id = oi."orderId"
      JOIN "Customer" c ON c.id = o."customerId"
      WHERE oi."productionCategory" = 'INHOUSE'
        AND oi."itemProductionStage" = 'NOT_PRINTED'
        AND o.status IN ('APPROVED','IN_PRODUCTION')
        AND jsonb_array_length(oi."designFiles"::jsonb) > 0
    `);
    for (const item of items) {
      const exists = await this.alreadyExists('INHOUSE_DESIGN_NOT_STARTED', item.orderId, item.id);
      if (exists) continue;
      await this.create({
        type: 'INHOUSE_DESIGN_NOT_STARTED', priority: 'NORMAL',
        title: 'Design Ready — Printing Not Started',
        message: `Order ${item.orderNumber} (${item.businessName}): Design files are uploaded but printing has not started yet.`,
        toUserId: prajakta.id, toUserName: prajakta.fullName,
        orderId: item.orderId, orderNo: item.orderNumber, itemId: item.id,
      });
    }
  }

  // ── Rule 3: Inhouse design missing ───────────────────────────────────────

  async checkRule3_InhouseDesignMissing() {
    const prajakta = await this.findUser('PRAJAKTA DALAL');
    if (!prajakta) return;
    const items = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT oi.id, oi."orderId", oi."itemProductionStage", oi."designFiles",
             o."orderNumber", c."businessName"
      FROM "OrderItem" oi
      JOIN "Order" o ON o.id = oi."orderId"
      JOIN "Customer" c ON c.id = o."customerId"
      WHERE oi."productionCategory" = 'INHOUSE'
        AND oi."itemProductionStage" = 'NOT_PRINTED'
        AND o.status IN ('APPROVED','IN_PRODUCTION')
        AND (oi."designFiles" IS NULL OR jsonb_array_length(oi."designFiles"::jsonb) = 0)
    `);
    for (const item of items) {
      const exists = await this.alreadyExists('INHOUSE_DESIGN_MISSING', item.orderId, item.id);
      if (exists) continue;
      await this.create({
        type: 'INHOUSE_DESIGN_MISSING', priority: 'HIGH',
        title: 'Design Files Missing',
        message: `Order ${item.orderNumber} (${item.businessName}): Item is INHOUSE but no design files uploaded. Ask sales agent to upload.`,
        toUserId: prajakta.id, toUserName: prajakta.fullName,
        orderId: item.orderId, orderNo: item.orderNumber, itemId: item.id,
      });
    }
  }

  // ── Rule 4: Inhouse printing stuck 24h ───────────────────────────────────

  async checkRule4_InhousePrintingStuck() {
    const prajakta = await this.findUser('PRAJAKTA DALAL');
    if (!prajakta) return;
    const items = await this.prisma.orderItem.findMany({
      where: { productionCategory: 'INHOUSE', itemProductionStage: 'PRINTING', updatedAt: { lt: this.hoursAgo(24) } },
      include: { order: { include: { customer: true } } },
    });
    for (const item of items) {
      const exists = await this.alreadyExists('INHOUSE_PRINTING_STUCK', item.orderId, item.id);
      if (exists) continue;
      await this.create({
        type: 'INHOUSE_PRINTING_STUCK', priority: 'HIGH',
        title: 'Printing Stuck for 24+ Hours',
        message: `Order ${(item.order as any).orderNumber} (${(item.order as any).customer.businessName}): Item has been in PRINTING stage for over 24 hours.`,
        toUserId: prajakta.id, toUserName: prajakta.fullName,
        orderId: item.orderId, orderNo: (item.order as any).orderNumber, itemId: item.id,
        copyToAdmin: true,
      });
    }
  }

  // ── Rule 5: Inhouse processing stuck 48h ─────────────────────────────────

  async checkRule5_InhouseProcessingStuck() {
    const prajakta = await this.findUser('PRAJAKTA DALAL');
    if (!prajakta) return;
    const items = await this.prisma.orderItem.findMany({
      where: { productionCategory: 'INHOUSE', itemProductionStage: 'PROCESSING', updatedAt: { lt: this.hoursAgo(48) } },
      include: { order: { include: { customer: true } } },
    });
    for (const item of items) {
      const exists = await this.alreadyExists('INHOUSE_PROCESSING_STUCK', item.orderId, item.id);
      if (exists) continue;
      await this.create({
        type: 'INHOUSE_PROCESSING_STUCK', priority: 'HIGH',
        title: 'Processing Stuck for 48+ Hours',
        message: `Order ${(item.order as any).orderNumber} (${(item.order as any).customer.businessName}): Item has been in PROCESSING stage for over 48 hours.`,
        toUserId: prajakta.id, toUserName: prajakta.fullName,
        orderId: item.orderId, orderNo: (item.order as any).orderNumber, itemId: item.id,
        copyToAdmin: true,
      });
    }
  }

  // ── Rule 6: Clubbing vendor not assigned 24h ──────────────────────────────

  async checkRule6_ClubbingVendorNotAssigned() {
    const prajakta = await this.findUser('PRAJAKTA DALAL');
    if (!prajakta) return;
    const items = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT oi.id, oi."orderId", o."orderNumber", c."businessName"
      FROM "OrderItem" oi
      JOIN "Order" o ON o.id = oi."orderId"
      JOIN "Customer" c ON c.id = o."customerId"
      WHERE oi."productionCategory" = 'CLUBBING'
        AND o.status IN ('APPROVED','IN_PRODUCTION')
        AND oi."updatedAt" < NOW() - INTERVAL '24 hours'
        AND jsonb_array_length(oi."designFiles"::jsonb) > 0
        AND NOT EXISTS (SELECT 1 FROM "JobWork" jw WHERE jw."orderItemId" = oi.id)
    `);
    for (const item of items) {
      const exists = await this.alreadyExists('CLUBBING_VENDOR_NOT_ASSIGNED', item.orderId, item.id);
      if (exists) continue;
      await this.create({
        type: 'CLUBBING_VENDOR_NOT_ASSIGNED', priority: 'HIGH',
        title: 'Clubbing Vendor Not Assigned',
        message: `Order ${item.orderNumber} (${item.businessName}): Design uploaded but no vendor assigned for clubbing after 24 hours.`,
        toUserId: prajakta.id, toUserName: prajakta.fullName,
        orderId: item.orderId, orderNo: item.orderNumber, itemId: item.id,
      });
    }
  }

  // ── Rule 7a: Clubbing due date missing ───────────────────────────────────

  async checkRule7a_ClubbingDueDateMissing() {
    const prajakta = await this.findUser('PRAJAKTA DALAL');
    if (!prajakta) return;
    const jobWorks = await this.prisma.jobWork.findMany({
      where: { dueDate: null, status: { not: 'COMPLETED' } },
      include: { orderItem: { include: { order: { include: { customer: true } } } } },
    });
    for (const jw of jobWorks) {
      const exists = await this.alreadyExists('CLUBBING_DUE_DATE_MISSING', undefined, undefined, undefined, jw.id);
      if (exists) continue;
      const order = (jw.orderItem.order as any);
      await this.create({
        type: 'CLUBBING_DUE_DATE_MISSING', priority: 'NORMAL',
        title: 'Clubbing Due Date Not Set',
        message: `Order ${order.orderNumber} (${order.customer.businessName}): JobWork created but no due date set.`,
        toUserId: prajakta.id, toUserName: prajakta.fullName,
        orderId: order.id, orderNo: order.orderNumber,
        itemId: jw.orderItemId, jobWorkId: jw.id,
      });
    }
  }

  // ── Rule 7b: Clubbing follow up 1 day before due ──────────────────────────

  async checkRule7b_ClubbingFollowUp1DayBefore() {
    const prajakta = await this.findUser('PRAJAKTA DALAL');
    if (!prajakta) return;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const start = new Date(tomorrow); start.setHours(0, 0, 0, 0);
    const end = new Date(tomorrow); end.setHours(23, 59, 59, 999);
    const jobWorks = await this.prisma.jobWork.findMany({
      where: { dueDate: { gte: start, lte: end }, status: { not: 'COMPLETED' } },
      include: { orderItem: { include: { order: { include: { customer: true } } } } },
    });
    for (const jw of jobWorks) {
      const exists = await this.alreadyExists('CLUBBING_FOLLOW_UP', undefined, undefined, undefined, jw.id);
      if (exists) continue;
      const order = (jw.orderItem.order as any);
      await this.create({
        type: 'CLUBBING_FOLLOW_UP', priority: 'HIGH',
        title: 'Clubbing Due Tomorrow — Follow Up',
        message: `Order ${order.orderNumber} (${order.customer.businessName}): Vendor delivery due tomorrow. Follow up now.`,
        toUserId: prajakta.id, toUserName: prajakta.fullName,
        orderId: order.id, orderNo: order.orderNumber,
        itemId: jw.orderItemId, jobWorkId: jw.id,
      });
    }
  }

  // ── Rule 7c: Clubbing due date passed ────────────────────────────────────

  async checkRule7c_ClubbingDueDatePassed() {
    const prajakta = await this.findUser('PRAJAKTA DALAL');
    const admin = await this.findUser('Sanket Admin');
    if (!prajakta) return;
    const jobWorks = await this.prisma.jobWork.findMany({
      where: { dueDate: { lt: new Date() }, status: { not: 'COMPLETED' } },
      include: { orderItem: { include: { order: { include: { customer: true } } } } },
    });
    for (const jw of jobWorks) {
      const exists = await this.alreadyExists('CLUBBING_OVERDUE', undefined, undefined, undefined, jw.id);
      if (exists) continue;
      const order = (jw.orderItem.order as any);
      await this.create({
        type: 'CLUBBING_OVERDUE', priority: 'URGENT',
        title: '🔴 Clubbing Overdue — Not Received',
        message: `Order ${order.orderNumber} (${order.customer.businessName}): Vendor due date has passed and job is not completed.`,
        toUserId: prajakta.id, toUserName: prajakta.fullName,
        orderId: order.id, orderNo: order.orderNumber,
        itemId: jw.orderItemId, jobWorkId: jw.id, copyToAdmin: true,
      });
      if (admin) {
        await this.create({
          type: 'CLUBBING_OVERDUE', priority: 'URGENT',
          title: '🔴 Clubbing Overdue — Admin Copy',
          message: `Order ${order.orderNumber} (${order.customer.businessName}): Vendor due date passed. Not received.`,
          toUserId: admin.id, toUserName: admin.fullName,
          orderId: order.id, orderNo: order.orderNumber,
          itemId: jw.orderItemId, jobWorkId: jw.id,
        });
      }
    }
  }

  // ── Rule 8: Sheet not assigned 24h ───────────────────────────────────────

  async checkRule8_SheetNotAssigned() {
    const prajakta = await this.findUser('PRAJAKTA DALAL');
    if (!prajakta) return;
    const items = await this.prisma.orderItem.findMany({
      where: { productionCategory: 'SHEET_PRODUCTION', updatedAt: { lt: this.hoursAgo(24) }, sheetItems: { none: {} } },
      include: { order: { include: { customer: true } } },
    });
    for (const item of items) {
      const order = item.order as any;
      if (!['APPROVED', 'IN_PRODUCTION'].includes(order.status)) continue;
      const exists = await this.alreadyExists('SHEET_NOT_ASSIGNED', item.orderId, item.id);
      if (exists) continue;
      await this.create({
        type: 'SHEET_NOT_ASSIGNED', priority: 'HIGH',
        title: 'Sheet Item Not Assigned to Sheet',
        message: `Order ${order.orderNumber} (${order.customer.businessName}): Item marked SHEET_PRODUCTION but not placed on any sheet after 24 hours.`,
        toUserId: prajakta.id, toUserName: prajakta.fullName,
        orderId: item.orderId, orderNo: order.orderNumber, itemId: item.id,
        copyToAdmin: true,
      });
    }
  }

  // ── Rule 9: Sheet COMPLETE not moved to printing 24h ─────────────────────

  async checkRule9_SheetCompleteNotMoved() {
    const prajakta = await this.findUser('PRAJAKTA DALAL');
    if (!prajakta) return;
    const sheets = await this.prisma.printSheet.findMany({
      where: { status: 'COMPLETE', updatedAt: { lt: this.hoursAgo(24) } },
    });
    for (const sheet of sheets) {
      const exists = await this.alreadyExists('SHEET_COMPLETE_STUCK', undefined, undefined, sheet.id);
      if (exists) continue;
      await this.create({
        type: 'SHEET_COMPLETE_STUCK', priority: 'HIGH',
        title: 'Sheet Complete — Not Moved to Printing',
        message: `Sheet ${sheet.sheetNo} has been in COMPLETE status for over 24 hours. Move it to PRINTING.`,
        toUserId: prajakta.id, toUserName: prajakta.fullName,
        sheetId: sheet.id, copyToAdmin: true,
      });
    }
  }

  // ── Rule 10: Sheet printing stuck 72h ────────────────────────────────────

  async checkRule10_SheetPrintingStuck() {
    const prajakta = await this.findUser('PRAJAKTA DALAL');
    if (!prajakta) return;
    const sheets = await this.prisma.printSheet.findMany({
      where: { status: { in: ['PRINTING', 'SETTING'] }, updatedAt: { lt: this.hoursAgo(72) } },
    });
    for (const sheet of sheets) {
      const exists = await this.alreadyExists('SHEET_PRINTING_STUCK', undefined, undefined, sheet.id);
      if (exists) continue;
      await this.create({
        type: 'SHEET_PRINTING_STUCK', priority: 'URGENT',
        title: '🔴 Sheet Printing Stuck 3+ Days',
        message: `Sheet ${sheet.sheetNo} has been in ${sheet.status} for over 72 hours. Immediate action needed.`,
        toUserId: prajakta.id, toUserName: prajakta.fullName,
        sheetId: sheet.id, copyToAdmin: true,
      });
    }
  }

  // ── Rule 11b: Sheet processing due date missing ───────────────────────────

  async checkRule11b_SheetProcessingDueDateMissing() {
    const prajakta = await this.findUser('PRAJAKTA DALAL');
    if (!prajakta) return;
    const items = await this.prisma.printSheetItem.findMany({
      where: { dueDate: null, sheet: { status: 'PROCESSING' } },
      include: { sheet: true, orderItem: { include: { order: { include: { customer: true } } } } },
    });
    for (const si of items) {
      const exists = await this.alreadyExists('SHEET_PROCESSING_DUE_DATE_MISSING', undefined, si.orderItemId, si.sheetId);
      if (exists) continue;
      const order = (si.orderItem.order as any);
      await this.create({
        type: 'SHEET_PROCESSING_DUE_DATE_MISSING', priority: 'NORMAL',
        title: 'Sheet Processing Due Date Missing',
        message: `Sheet ${si.sheet.sheetNo} is in PROCESSING but no due date set for order ${order.orderNumber} (${order.customer.businessName}).`,
        toUserId: prajakta.id, toUserName: prajakta.fullName,
        orderId: order.id, orderNo: order.orderNumber,
        itemId: si.orderItemId, sheetId: si.sheetId,
      });
    }
  }

  // ── Rule 11c: Sheet processing follow up 1 day before ────────────────────

  async checkRule11c_SheetProcessingFollowUp() {
    const prajakta = await this.findUser('PRAJAKTA DALAL');
    if (!prajakta) return;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const start = new Date(tomorrow); start.setHours(0, 0, 0, 0);
    const end = new Date(tomorrow); end.setHours(23, 59, 59, 999);
    const items = await this.prisma.printSheetItem.findMany({
      where: { dueDate: { gte: start, lte: end }, sheet: { status: 'PROCESSING' } },
      include: { sheet: true, orderItem: { include: { order: { include: { customer: true } } } } },
    });
    for (const si of items) {
      const exists = await this.alreadyExists('SHEET_PROCESSING_FOLLOW_UP', undefined, si.orderItemId, si.sheetId);
      if (exists) continue;
      const order = (si.orderItem.order as any);
      await this.create({
        type: 'SHEET_PROCESSING_FOLLOW_UP', priority: 'HIGH',
        title: 'Sheet Processing Due Tomorrow',
        message: `Sheet ${si.sheet.sheetNo}: Order ${order.orderNumber} (${order.customer.businessName}) processing due tomorrow. Follow up with vendor.`,
        toUserId: prajakta.id, toUserName: prajakta.fullName,
        orderId: order.id, orderNo: order.orderNumber,
        itemId: si.orderItemId, sheetId: si.sheetId,
      });
    }
  }

  // ── Rule 11d: Sheet processing due date passed ────────────────────────────

  async checkRule11d_SheetProcessingDueDatePassed() {
    const prajakta = await this.findUser('PRAJAKTA DALAL');
    const admin = await this.findUser('Sanket Admin');
    if (!prajakta) return;
    const items = await this.prisma.printSheetItem.findMany({
      where: { dueDate: { lt: new Date() }, sheet: { status: 'PROCESSING' }, orderItem: { itemProductionStage: { not: 'READY_FOR_DISPATCH' } } },
      include: { sheet: true, orderItem: { include: { order: { include: { customer: true } } } } },
    });
    for (const si of items) {
      const exists = await this.alreadyExists('SHEET_PROCESSING_OVERDUE', undefined, si.orderItemId, si.sheetId);
      if (exists) continue;
      const order = (si.orderItem.order as any);
      await this.create({
        type: 'SHEET_PROCESSING_OVERDUE', priority: 'URGENT',
        title: '🔴 Sheet Processing Overdue',
        message: `Sheet ${si.sheet.sheetNo}: Order ${order.orderNumber} (${order.customer.businessName}) processing due date passed. Not ready.`,
        toUserId: prajakta.id, toUserName: prajakta.fullName,
        orderId: order.id, orderNo: order.orderNumber,
        itemId: si.orderItemId, sheetId: si.sheetId, copyToAdmin: true,
      });
      if (admin) {
        await this.create({
          type: 'SHEET_PROCESSING_OVERDUE', priority: 'URGENT',
          title: '🔴 Sheet Processing Overdue — Admin Copy',
          message: `Sheet ${si.sheet.sheetNo}: Order ${order.orderNumber} processing overdue.`,
          toUserId: admin.id, toUserName: admin.fullName,
          orderId: order.id, orderNo: order.orderNumber,
          itemId: si.orderItemId, sheetId: si.sheetId,
        });
      }
    }
  }

  // ── API Methods ───────────────────────────────────────────────────────────

  async getMyNotifications(userId: string) {
    const notifications = await this.prisma.notification.findMany({
      where: { toUserId: userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return this.withProductDetails(notifications);
  }

  async getAdminNotifications() {
    const notifications = await this.prisma.notification.findMany({
      where: { copyToAdmin: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return this.withProductDetails(notifications);
  }

  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({ where: { toUserId: userId, isRead: false } });
    return { count };
  }

  async markRead(id: string) {
    return this.prisma.notification.update({ where: { id }, data: { isRead: true } });
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({ where: { toUserId: userId, isRead: false }, data: { isRead: true } });
    return { success: true };
  }

  async resolveNotification(id: string, actionTaken: string) {
    return this.prisma.notification.update({ where: { id }, data: { isResolved: true, resolvedAt: new Date(), actionTaken } });
  }

  async addExplanation(id: string, explanation: string) {
    const notif = await this.prisma.notification.update({ where: { id }, data: { explanation } });
    // Copy to admin with explanation
    const admin = await this.findUser('Sanket Admin');
    if (admin && notif.copyToAdmin) {
      await this.create({
        type: notif.type + '_ESCALATED', priority: 'HIGH',
        title: `[Explanation] ${notif.title}`,
        message: `${notif.message}\n\nExplanation: ${explanation}`,
        toUserId: admin.id, toUserName: admin.fullName,
        orderId: notif.orderId ?? undefined, orderNo: notif.orderNo ?? undefined,
        itemId: notif.itemId ?? undefined, sheetId: notif.sheetId ?? undefined,
        jobWorkId: notif.jobWorkId ?? undefined,
      });
    }
    return notif;
  }

  async escalateToAdmin(id: string) {
    const notif = await this.prisma.notification.update({ where: { id }, data: { copyToAdmin: true } });
    const admin = await this.findUser('Sanket Admin');
    if (admin) {
      await this.create({
        type: notif.type + '_ESCALATED', priority: 'URGENT',
        title: `[Escalated] ${notif.title}`,
        message: notif.message,
        toUserId: admin.id, toUserName: admin.fullName,
        orderId: notif.orderId ?? undefined, orderNo: notif.orderNo ?? undefined,
        itemId: notif.itemId ?? undefined,
        sheetId: notif.sheetId ?? undefined,
        jobWorkId: notif.jobWorkId ?? undefined,
      });
    }
    return notif;
  }

  async notifySalesAgentDesign(itemId: string) {
    const vaishali = await this.findUser('VAISHALI DHAKATE');
    if (!vaishali) return { error: 'Sales agent not found' };
    const item = await this.prisma.orderItem.findUnique({
      where: { id: itemId },
      include: { order: { include: { customer: true } } },
    });
    if (!item) return { error: 'Item not found' };
    const order = item.order as any;
    const exists = await this.alreadyExists('DESIGN_UPLOAD_REQUEST', order.id, itemId);
    if (exists) return { message: 'Already notified' };
    return this.create({
      type: 'DESIGN_UPLOAD_REQUEST', priority: 'HIGH',
      title: 'Design Upload Required',
      message: `Order ${order.orderNumber} (${order.customer.businessName}): Production is waiting for design files. Please upload immediately.`,
      toUserId: vaishali.id, toUserName: vaishali.fullName,
      orderId: order.id, orderNo: order.orderNumber, itemId,
    });
  }

  async setDueDate(type: 'jobwork' | 'sheetitem', id: string, dueDate: string) {
    const date = new Date(dueDate);
    if (type === 'jobwork') {
      return this.prisma.jobWork.update({ where: { id }, data: { dueDate: date } });
    } else {
      return this.prisma.printSheetItem.update({ where: { id }, data: { dueDate: date } });
    }
  }

  async triggerManualCheck() {
    await this.runAllChecks();
    return { success: true, message: 'All notification checks ran' };
  }
}
