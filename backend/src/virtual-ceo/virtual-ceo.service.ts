// backend/src/virtual-ceo/virtual-ceo.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import {
  OrderStatus,
  OrderProductionStage,
  PaymentVerificationStatus,
  ShipmentStatus,
  SheetStatus,
  JobWorkStatus,
  ProductionCategory,
} from '@prisma/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ActionItem {
  id: string;
  department: 'ACCOUNTS' | 'PRODUCTION' | 'DISPATCH' | 'STOCK';
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  category: string;
  title: string;
  detail: string;
  orderNo?: string;
  ageHours?: number;
  ageDays?: number;
  actionUrl?: string;
}

export interface VirtualCeoReport {
  generatedAt: string;
  summary: {
    totalActions: number;
    highPriority: number;
    mediumPriority: number;
    lowPriority: number;
    accounts: number;
    production: number;
    dispatch: number;
    stock: number;
  };
  accounts: ActionItem[];
  production: ActionItem[];
  dispatch: ActionItem[];
  stock: ActionItem[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ageHours(date: Date): number {
  return (Date.now() - date.getTime()) / 3_600_000;
}
function ageDays(date: Date): number {
  return ageHours(date) / 24;
}
function fmtAge(hours: number): string {
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}


// Returns true if today >= follow-up date in IST (show on and after the scheduled date)
function isDueOrOverdueIST(date: Date | null): boolean {
  if (!date) return true; // no date set => always show
  const IST_OFFSET = 330 * 60 * 1000;
  const nowD = new Date(Date.now() + IST_OFFSET);
  const dueD = new Date(date.getTime() + IST_OFFSET);
  const nowDay = Date.UTC(nowD.getUTCFullYear(), nowD.getUTCMonth(), nowD.getUTCDate());
  const dueDay = Date.UTC(dueD.getUTCFullYear(), dueD.getUTCMonth(), dueD.getUTCDate());
  return nowDay >= dueDay;
}

@Injectable()
export class VirtualCeoService {
  private readonly logger = new Logger(VirtualCeoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  // ─── IST Date Helpers ─────────────────────────────────────────────────────────

  private getTodayIST(): string {
    const d = new Date(Date.now() + 330 * 60 * 1000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }

  private getYesterdayIST(): string {
    const d = new Date(Date.now() + 330 * 60 * 1000 - 86400000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }

  // ─── Required Reviewers ───────────────────────────────────────────────────

  private async getRequiredReviewers(): Promise<string[]> {
    const row = await this.prisma.systemConfig.findUnique({ where: { key: 'vceo_required_reviewers' } });
    if (!row?.value) return [];
    try { return JSON.parse(row.value) as string[]; } catch { return []; }
  }

  async setRequiredReviewers(userIds: string[]) {
    await this.prisma.systemConfig.upsert({
      where: { key: 'vceo_required_reviewers' },
      update: { value: JSON.stringify(userIds) },
      create: { key: 'vceo_required_reviewers', value: JSON.stringify(userIds) },
    });
    return { requiredReviewers: userIds };
  }

  // ─── Review Status ────────────────────────────────────────────────────────

  async getReviewStatus(userId: string) {
    const reviewers = await this.getRequiredReviewers();
    if (!reviewers.includes(userId)) return { status: 'OK' as const };

    // Locked?
    const lockRow = await this.prisma.systemConfig.findUnique({ where: { key: `vceo_locked_${userId}` } });
    if (lockRow) {
      const lockData = JSON.parse(lockRow.value) as { lockedAt: string; reason: string };
      return { status: 'LOCKED' as const, ...lockData };
    }

    // Pending deadline?
    const pendingRow = await this.prisma.systemConfig.findUnique({ where: { key: `vceo_pending_${userId}` } });
    if (pendingRow) {
      const pending = JSON.parse(pendingRow.value) as { deadlineAt: string; shownAt: string };
      if (new Date() > new Date(pending.deadlineAt)) {
        await this.lockAccount(userId, 'CEO review not completed within 2 hours');
        return { status: 'LOCKED' as const, lockedAt: new Date().toISOString(), reason: 'CEO review not completed within 2 hours' };
      }
      return { status: 'REVIEW_PENDING' as const, deadlineAt: pending.deadlineAt };
    }

    // Today already completed?
    const today = this.getTodayIST();
    const todayRow = await this.prisma.systemConfig.findUnique({ where: { key: `vceo_review_${userId}_${today}` } });
    if (todayRow) {
      const data = JSON.parse(todayRow.value) as { completedAt?: string };
      if (data.completedAt) return { status: 'OK' as const, completedAt: data.completedAt };
    }

    // Yesterday missed?
    const yesterday = this.getYesterdayIST();
    const yRow = await this.prisma.systemConfig.findUnique({ where: { key: `vceo_review_${userId}_${yesterday}` } });
    const yesterdayDone = yRow ? (JSON.parse(yRow.value) as { completedAt?: string }).completedAt : null;

    if (!yesterdayDone) {
      return { status: 'REVIEW_REQUIRED' as const };
    }

    return { status: 'OK' as const };
  }

  async getTodayActions(userId: string) {
    const today = this.getTodayIST();
    const row = await this.prisma.systemConfig.findUnique({ where: { key: `vceo_review_${userId}_${today}` } });
    if (!row) return { taskActions: {} as Record<string, string>, completedAt: null as string | null };
    const data = JSON.parse(row.value) as { taskActions?: Record<string, string>; completedAt?: string };
    return { taskActions: data.taskActions ?? {}, completedAt: data.completedAt ?? null };
  }

  async markPopupShown(userId: string) {
    const existing = await this.prisma.systemConfig.findUnique({ where: { key: `vceo_pending_${userId}` } });
    if (existing) {
      // Already started, return existing deadline
      const data = JSON.parse(existing.value) as { deadlineAt: string };
      return { deadlineAt: data.deadlineAt };
    }
    const deadlineAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    await this.prisma.systemConfig.create({
      data: { key: `vceo_pending_${userId}`, value: JSON.stringify({ deadlineAt, shownAt: new Date().toISOString() }) },
    });
    return { deadlineAt };
  }

  async saveTaskAction(userId: string, itemId: string, action: string | null) {
    const today = this.getTodayIST();
    const key = `vceo_review_${userId}_${today}`;
    const row = await this.prisma.systemConfig.findUnique({ where: { key } });
    const current = row ? (JSON.parse(row.value) as { taskActions?: Record<string, string>; completedAt?: string }) : {};
    const taskActions = { ...(current.taskActions ?? {}) };
    if (action) taskActions[itemId] = action;
    else delete taskActions[itemId];
    const next = { ...current, taskActions };
    await this.prisma.systemConfig.upsert({
      where: { key },
      update: { value: JSON.stringify(next) },
      create: { key, value: JSON.stringify(next) },
    });
    return { taskActions };
  }

  async completeReview(userId: string) {
    const today = this.getTodayIST();
    const key = `vceo_review_${userId}_${today}`;
    const row = await this.prisma.systemConfig.findUnique({ where: { key } });
    const current = row ? JSON.parse(row.value) : {};
    await this.prisma.systemConfig.upsert({
      where: { key },
      update: { value: JSON.stringify({ ...current, completedAt: new Date().toISOString() }) },
      create: { key, value: JSON.stringify({ ...current, completedAt: new Date().toISOString() }) },
    });
    await this.prisma.systemConfig.deleteMany({ where: { key: `vceo_pending_${userId}` } });
    this.logger.log(`Virtual CEO: review completed by ${userId}`);
    return { ok: true };
  }

  private async lockAccount(userId: string, reason: string) {
    const lockedAt = new Date().toISOString();
    await this.prisma.systemConfig.upsert({
      where: { key: `vceo_locked_${userId}` },
      update: { value: JSON.stringify({ lockedAt, reason }) },
      create: { key: `vceo_locked_${userId}`, value: JSON.stringify({ lockedAt, reason }) },
    });
    await this.prisma.systemConfig.deleteMany({ where: { key: `vceo_pending_${userId}` } });
    try {
      await this.prisma.user.update({ where: { id: userId }, data: { isActive: false } });
    } catch (e) {
      this.logger.error(`Virtual CEO: could not deactivate user ${userId}`, e);
    }
    this.logger.warn(`Virtual CEO: locked account ${userId} — ${reason}`);
  }

  // ─── Cron: Enforce pending locks every hour ───────────────────────────────
  @Cron('0 * * * *', { timeZone: 'Asia/Kolkata' })
  async enforcePendingLocks() {
    const rows = await this.prisma.systemConfig.findMany({
      where: { key: { startsWith: 'vceo_pending_' } },
    });
    for (const row of rows) {
      const data = JSON.parse(row.value) as { deadlineAt: string };
      if (new Date() > new Date(data.deadlineAt)) {
        const userId = row.key.replace('vceo_pending_', '');
        await this.lockAccount(userId, 'CEO review not completed within 2 hours');
      }
    }
  }

  // ─── Admin: lock status ───────────────────────────────────────────────────

  async adminGetLockStatus() {
    const [locked, pending, reviewers] = await Promise.all([
      this.prisma.systemConfig.findMany({ where: { key: { startsWith: 'vceo_locked_' } } }),
      this.prisma.systemConfig.findMany({ where: { key: { startsWith: 'vceo_pending_' } } }),
      this.getRequiredReviewers(),
    ]);

    const userIds = Array.from(new Set([
      ...locked.map(r => r.key.replace('vceo_locked_', '')),
      ...pending.map(r => r.key.replace('vceo_pending_', '')),
      ...reviewers,
    ]));

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, fullName: true, email: true, isActive: true },
    });

    return {
      requiredReviewers: reviewers,
      users: users.map(u => ({
        ...u,
        isRequiredReviewer: reviewers.includes(u.id),
        lockData: (() => {
          const r = locked.find(x => x.key === `vceo_locked_${u.id}`);
          return r ? JSON.parse(r.value) as { lockedAt: string; reason: string } : null;
        })(),
        pendingData: (() => {
          const r = pending.find(x => x.key === `vceo_pending_${u.id}`);
          return r ? JSON.parse(r.value) as { deadlineAt: string; shownAt: string } : null;
        })(),
      })),
    };
  }

  async adminUnlockUser(targetUserId: string) {
    await this.prisma.systemConfig.deleteMany({ where: { key: `vceo_locked_${targetUserId}` } });
    await this.prisma.systemConfig.deleteMany({ where: { key: `vceo_pending_${targetUserId}` } });
    try {
      await this.prisma.user.update({ where: { id: targetUserId }, data: { isActive: true } });
    } catch (e) {
      this.logger.error(`Virtual CEO: could not reactivate user ${targetUserId}`, e);
    }
    this.logger.log(`Virtual CEO: admin unlocked account ${targetUserId}`);
    return { ok: true };
  }

  // ─── Admin: review history for a user ────────────────────────────────────
  async adminGetReviewHistory(userId: string) {
    const rows = await this.prisma.systemConfig.findMany({
      where: { key: { startsWith: `vceo_review_${userId}_` } },
      orderBy: { key: 'desc' },
    });
    return rows.map(r => {
      const date = r.key.replace(`vceo_review_${userId}_`, '');
      let data: Record<string, string> = {};
      try { data = JSON.parse(r.value); } catch {}
      return { date, completedAt: data.completedAt ?? null };
    });
  }

  // ─── Admin: all users review history (cross-user, last N days) ────────────
  async adminGetAllReviewHistory(days = 30) {
    const rows = await this.prisma.systemConfig.findMany({
      where: { key: { startsWith: 'vceo_review_' } },
      orderBy: { key: 'desc' },
    });
    // Get unique userIds
    const userIdSet = new Set(rows.map(r => {
      const parts = r.key.replace('vceo_review_', '').split('_');
      // key format: vceo_review_{userId}_{YYYY-MM-DD}  — userId has no underscores normally
      // date is last part (YYYY-MM-DD) = 10 chars
      return parts.slice(0, -1).join('_');
    }));
    const userIds = Array.from(userIdSet);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, fullName: true, email: true, role: true },
    });
    const userMap = new Map(users.map(u => [u.id, u]));

    // Build per-user history
    const historyMap = new Map<string, Array<{ date: string; completedAt: string | null }>>();
    for (const r of rows) {
      const withoutPrefix = r.key.replace('vceo_review_', '');
      const date = withoutPrefix.slice(-10); // last 10 chars = YYYY-MM-DD
      const uid = withoutPrefix.slice(0, -11); // remove _ + date
      let data: Record<string, string> = {};
      try { data = JSON.parse(r.value); } catch {}
      if (!historyMap.has(uid)) historyMap.set(uid, []);
      historyMap.get(uid)!.push({ date, completedAt: data.completedAt ?? null });
    }

    return Array.from(historyMap.entries()).map(([uid, history]) => ({
      userId: uid,
      user: userMap.get(uid) ?? { id: uid, fullName: 'Unknown', email: '', role: '' },
      history: history.sort((a, b) => b.date.localeCompare(a.date)),
    }));
  }

  // ─── Cron: Daily 10 AM IST (UTC 04:30) ─────────────────────────────────────
  @Cron('30 4 * * *', { timeZone: 'Asia/Kolkata' })
  async sendDailyWhatsAppReport() {
    this.logger.log('Virtual CEO: generating daily 10 AM report');
    try {
      const report = await this.generateReport();
      const message = this.formatWhatsAppMessage(report);

      // Send to Prajakta and Sanket (admin)
      const recipients = [
        { name: 'Prajakta', phone: process.env.VCEO_PRAJAKTA_PHONE ?? '' },
        { name: 'Sanket', phone: process.env.VCEO_SANKET_PHONE ?? '' },
      ];

      for (const r of recipients) {
        if (!r.phone) continue;
        await this.whatsapp.sendTextMessage(r.phone, message);
        this.logger.log(`Virtual CEO report sent to ${r.name} (${r.phone})`);
      }
    } catch (err) {
      this.logger.error('Virtual CEO daily report failed', err);
    }
  }

  // ─── Main Report Generator ────────────────────────────────────────────────

  async generateReport(): Promise<VirtualCeoReport> {
    const safeCheck = async (fn: () => Promise<ActionItem[]>, name: string): Promise<ActionItem[]> => {
      try { return await fn(); }
      catch (e) { this.logger.error(`Virtual CEO: ${name} check failed`, e); return []; }
    };
    const [accounts, production, dispatch, stock] = await Promise.all([
      safeCheck(() => this.checkAccounts(), 'accounts'),
      safeCheck(() => this.checkProduction(), 'production'),
      safeCheck(() => this.checkDispatch(), 'dispatch'),
      safeCheck(() => this.checkStock(), 'stock'),
    ]);

    const all = [...accounts, ...production, ...dispatch, ...stock];
    const high = all.filter(a => a.priority === 'HIGH').length;
    const med  = all.filter(a => a.priority === 'MEDIUM').length;
    const low  = all.filter(a => a.priority === 'LOW').length;

    return {
      generatedAt: new Date().toISOString(),
      summary: {
        totalActions: all.length,
        highPriority: high,
        mediumPriority: med,
        lowPriority: low,
        accounts: accounts.length,
        production: production.length,
        dispatch: dispatch.length,
        stock: stock.length,
      },
      accounts,
      production,
      dispatch,
      stock,
    };
  }

  // ─── ACCOUNTS ─────────────────────────────────────────────────────────────

  private async checkAccounts(): Promise<ActionItem[]> {
    const items: ActionItem[] = [];

    // 1. Orders pending approval
    const pendingApproval = await this.prisma.order.findMany({
      where: { status: OrderStatus.PENDING_APPROVAL },
      include: { customer: { select: { businessName: true } } },
      orderBy: { createdAt: 'asc' },
    });

    for (const o of pendingApproval) {
      const hours = ageHours(o.createdAt);
      items.push({
        id: `acc-approve-${o.id}`,
        department: 'ACCOUNTS',
        priority: hours > 6 ? 'HIGH' : 'MEDIUM',
        category: 'Order Approval',
        title: `Approve order ${o.orderNumber}`,
        detail: `${o.customer.businessName} — waiting ${fmtAge(hours)} for approval`,
        orderNo: o.orderNumber,
        ageHours: Math.round(hours),
        actionUrl: '/accounts',
      });
    }

    // 2. Payments pending verification (receipts to verify)
    const pendingPayments = await this.prisma.payment.findMany({
      where: { verificationStatus: PaymentVerificationStatus.PENDING_VERIFICATION },
      include: { order: { select: { orderNumber: true, customer: { select: { businessName: true } } } } },
      orderBy: { createdAt: 'asc' },
    });

    for (const p of pendingPayments) {
      const hours = ageHours(p.createdAt);
      items.push({
        id: `acc-verify-${p.id}`,
        department: 'ACCOUNTS',
        priority: hours > 4 ? 'HIGH' : 'MEDIUM',
        category: 'Receipt Verification',
        title: `Verify payment for ${p.order.orderNumber}`,
        detail: `₹${Number(p.amount).toLocaleString('en-IN')} from ${p.order.customer.businessName} — submitted ${fmtAge(hours)}`,
        orderNo: p.order.orderNumber,
        ageHours: Math.round(hours),
        actionUrl: '/accounts',
      });
    }

    // 3. Orders pending dispatch approval
    const pendingDispatchApproval = await this.prisma.order.findMany({
      where: { status: OrderStatus.PENDING_DISPATCH_APPROVAL },
      include: { customer: { select: { businessName: true } } },
      orderBy: { updatedAt: 'asc' },
    });

    for (const o of pendingDispatchApproval) {
      const days = ageDays(o.updatedAt);
      const hours = ageHours(o.updatedAt);
      items.push({
        id: `acc-dispatch-${o.id}`,
        department: 'ACCOUNTS',
        priority: days >= 1 ? 'HIGH' : 'MEDIUM',
        category: 'Dispatch Approval',
        title: `Approve dispatch for ${o.orderNumber}`,
        detail: `${o.customer.businessName} — waiting ${fmtAge(hours)} for dispatch approval`,
        orderNo: o.orderNumber,
        ageDays: Math.round(days),
        actionUrl: '/accounts',
      });
    }

    // 4. Orders ready for dispatch (production complete, awaiting shipment)
    const readyForDispatch = await this.prisma.order.findMany({
      where: {
        productionStage: OrderProductionStage.READY_FOR_DISPATCH,
        status: { in: [OrderStatus.READY_FOR_DISPATCH, OrderStatus.IN_PRODUCTION, OrderStatus.APPROVED] },
        shipments: { none: {} },
      },
      include: { customer: { select: { businessName: true } } },
      orderBy: { updatedAt: 'asc' },
      take: 30,
    });

    for (const o of readyForDispatch) {
      const days = ageDays(o.updatedAt);
      items.push({
        id: `acc-rfd-${o.id}`,
        department: 'ACCOUNTS',
        priority: days > 2 ? 'HIGH' : 'MEDIUM',
        category: 'Ready for Dispatch',
        title: `Ready to dispatch — ${o.orderNumber}`,
        detail: `${o.customer.businessName} — ready ${Math.round(days)}d, no shipment booked`,
        orderNo: o.orderNumber,
        ageDays: Math.round(days),
        actionUrl: '/dispatch',
      });
    }

    return items;
  }

  // ─── PRODUCTION ───────────────────────────────────────────────────────────

  private async checkProduction(): Promise<ActionItem[]> {
    const items: ActionItem[] = [];

    // 1. Orders approved but no production category assigned to items
    const unassignedOrders = await this.prisma.order.findMany({
      where: {
        status: { in: [OrderStatus.APPROVED, OrderStatus.IN_PRODUCTION] },
        items: { some: { productionCategory: null } },
      },
      include: {
        customer: { select: { businessName: true } },
        items: { where: { productionCategory: null }, select: { id: true, product: { select: { name: true } } } },
      },
      orderBy: { updatedAt: 'asc' },
    });

    for (const o of unassignedOrders) {
      const hours = ageHours(o.updatedAt);
      items.push({
        id: `prod-unassigned-${o.id}`,
        department: 'PRODUCTION',
        priority: hours > 12 ? 'HIGH' : 'MEDIUM',
        category: 'Unassigned Jobs',
        title: `Assign production category — ${o.orderNumber}`,
        detail: `${o.customer.businessName}: ${o.items.length} item(s) not yet assigned to Inhouse/Clubbing/Sheet — ${fmtAge(hours)}`,
        orderNo: o.orderNumber,
        ageHours: Math.round(hours),
        actionUrl: '/production',
      });
    }

    // 2. Inhouse items NOT yet printed — query at ITEM level (matches production page exactly)
    const inhouseNotPrintedItems = await this.prisma.orderItem.findMany({
      where: {
        productionCategory: ProductionCategory.INHOUSE,
        itemProductionStage: OrderProductionStage.NOT_PRINTED,
        order: { status: { in: [OrderStatus.APPROVED, OrderStatus.IN_PRODUCTION] } },
      },
      include: {
        order: { select: { orderNumber: true, customer: { select: { businessName: true } }, updatedAt: true } },
      },
      orderBy: { updatedAt: 'asc' },
    });

    for (const item of inhouseNotPrintedItems) {
      const hours = ageHours(item.updatedAt);
      if (hours < 4) continue;
      items.push({
        id: `prod-inhouse-np-${item.id}`,
        department: 'PRODUCTION',
        priority: hours > 24 ? 'HIGH' : 'MEDIUM',
        category: 'Inhouse Printing',
        title: `Start printing — ${item.order.orderNumber}`,
        detail: `${item.order.customer.businessName} — inhouse job not started, ${fmtAge(hours)}`,
        orderNo: item.order.orderNumber,
        ageHours: Math.round(hours),
        actionUrl: '/production',
      });
    }

    // 3. Inhouse items in PRINTING > 2 days — query at ITEM level
    const inhousePrintingItems = await this.prisma.orderItem.findMany({
      where: {
        productionCategory: ProductionCategory.INHOUSE,
        itemProductionStage: OrderProductionStage.PRINTING,
        order: { status: { in: [OrderStatus.APPROVED, OrderStatus.IN_PRODUCTION] } },
      },
      include: {
        order: { select: { orderNumber: true, customer: { select: { businessName: true } }, updatedAt: true } },
      },
      orderBy: { updatedAt: 'asc' },
    });

    for (const item of inhousePrintingItems) {
      const days = ageDays(item.updatedAt);
      if (days < 2) continue;
      items.push({
        id: `prod-delayed-printing-${item.id}`,
        department: 'PRODUCTION',
        priority: days > 3 ? 'HIGH' : 'MEDIUM',
        category: 'Delayed Printing',
        title: `Printing delayed — ${item.order.orderNumber}`,
        detail: `${item.order.customer.businessName} — stuck in printing for ${Math.round(days)} days`,
        orderNo: item.order.orderNumber,
        ageDays: Math.round(days),
        actionUrl: '/production',
      });
    }

    // 4. Inhouse items in PROCESSING — query at ITEM level, respect processingFollowUpDate
    const inhouseProcessingItems = await this.prisma.orderItem.findMany({
      where: {
        productionCategory: ProductionCategory.INHOUSE,
        itemProductionStage: OrderProductionStage.PROCESSING,
        order: { status: { in: [OrderStatus.APPROVED, OrderStatus.IN_PRODUCTION] } },
      },
      include: {
        order: { select: { orderNumber: true, customer: { select: { businessName: true } } } },
      },
      orderBy: { updatedAt: 'asc' },
    });

    for (const item of inhouseProcessingItems) {
      const followUpDate = (item as any).processingFollowUpDate as Date | null ?? null;
      if (!isDueOrOverdueIST(followUpDate)) continue;
      const days = ageDays(item.updatedAt);
      const dueDateStr = followUpDate ? ` · Follow-up: ${followUpDate.toLocaleDateString('en-IN')}` : ' · No follow-up date set';
      items.push({
        id: `prod-inhouse-proc-${item.id}`,
        department: 'PRODUCTION',
        priority: days > 3 ? 'HIGH' : 'MEDIUM',
        category: 'Inhouse Processing',
        title: `Processing follow-up — ${item.order.orderNumber}`,
        detail: `${item.order.customer.businessName} — in processing for ${Math.round(days)} days${dueDateStr}`,
        orderNo: item.order.orderNumber,
        ageDays: Math.round(days),
        actionUrl: '/production',
      });
    }

    // 5. Clubbing items without vendor assigned (no JobWork record)
    const clubbingNoVendor = await this.prisma.orderItem.findMany({
      where: {
        productionCategory: ProductionCategory.CLUBBING,
        jobWorks: { none: {} },
        order: { status: { in: [OrderStatus.APPROVED, OrderStatus.IN_PRODUCTION] } },
      },
      include: {
        order: { select: { orderNumber: true, customer: { select: { businessName: true } }, updatedAt: true } },
        product: { select: { name: true } },
      },
      take: 30,
    });

    for (const item of clubbingNoVendor) {
      const hours = ageHours(item.order.updatedAt);
      items.push({
        id: `prod-club-novend-${item.id}`,
        department: 'PRODUCTION',
        priority: hours > 12 ? 'HIGH' : 'MEDIUM',
        category: 'Clubbing — Assign Vendor',
        title: `No vendor for clubbing — ${item.order.orderNumber}`,
        detail: `${item.product.name} (${item.order.customer.businessName}) — assign vendor for clubbing, ${fmtAge(hours)}`,
        orderNo: item.order.orderNumber,
        ageHours: Math.round(hours),
        actionUrl: '/production',
      });
    }

    // 6. Clubbing items with vendor assigned but job not completed — follow up
    const clubbingFollowUp = await this.prisma.jobWork.findMany({
      where: {
        status: { in: [JobWorkStatus.PENDING, JobWorkStatus.IN_PROGRESS] },
        orderItem: {
          order: { status: { in: [OrderStatus.APPROVED, OrderStatus.IN_PRODUCTION] } },
        },
      },
      include: {
        vendor: { select: { name: true } },
        orderItem: {
          select: {
            product: { select: { name: true } },
            order: { select: { orderNumber: true, customer: { select: { businessName: true } } } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 30,
    });

    // Group by order+vendor to avoid duplicate cards when an order has multiple items at the same vendor
    const clubbingByKey = new Map<string, typeof clubbingFollowUp[0] & { itemCount: number; productNames: string[] }>();
    for (const jw of clubbingFollowUp) {
      const dueDate = (jw as any).dueDate as Date | null ?? null;
      if (!isDueOrOverdueIST(dueDate)) continue;
      const days = ageDays(jw.createdAt);
      if (!dueDate && days < 1) continue;
      const key = `${jw.orderItem.order.orderNumber}__${jw.vendor.name}`;
      if (clubbingByKey.has(key)) {
        const existing = clubbingByKey.get(key)!;
        existing.itemCount++;
        if (!existing.productNames.includes(jw.orderItem.product.name)) {
          existing.productNames.push(jw.orderItem.product.name);
        }
      } else {
        clubbingByKey.set(key, { ...jw, itemCount: 1, productNames: [jw.orderItem.product.name] });
      }
    }

    for (const [, jw] of clubbingByKey) {
      const days = ageDays(jw.createdAt);
      const dueDate = (jw as any).dueDate as Date | null ?? null;
      const dueDateStr = dueDate ? ` · Follow-up: ${dueDate.toLocaleDateString('en-IN')}` : '';
      const productStr = jw.itemCount > 1 ? `${jw.productNames[0]} +${jw.itemCount - 1} more` : jw.productNames[0];
      items.push({
        id: `prod-club-followup-${jw.orderItem.order.orderNumber}-${jw.vendor.name}`,
        department: 'PRODUCTION',
        priority: days > 3 ? 'HIGH' : 'MEDIUM',
        category: 'Clubbing — Vendor Follow-up',
        title: `Follow up: ${jw.vendor.name} — ${jw.orderItem.order.orderNumber}`,
        detail: `${jw.orderItem.order.customer.businessName} · ${productStr} · ${Math.round(days)}d with vendor${dueDateStr}`,
        orderNo: jw.orderItem.order.orderNumber,
        ageDays: Math.round(days),
        actionUrl: '/production',
      });
    }

    // 7. Sheets in INCOMPLETE or SETTING status that need arrangement
    const sheetsToArrange = await this.prisma.printSheet.findMany({
      where: { status: { in: [SheetStatus.INCOMPLETE, SheetStatus.SETTING] } },
      orderBy: { updatedAt: 'asc' },
      take: 20,
    });

    if (sheetsToArrange.length > 0) {
      items.push({
        id: 'prod-sheets-arrange',
        department: 'PRODUCTION',
        priority: 'MEDIUM',
        category: 'Sheet Production',
        title: `${sheetsToArrange.length} sheet(s) need arrangement/setting`,
        detail: `Sheets in INCOMPLETE/SETTING stage — auto-arrange items and finalize`,
        actionUrl: '/sheet-layout',
      });
    }

    // 8. Sheets COMPLETE — start next process
    const sheetsComplete = await this.prisma.printSheet.findMany({
      where: { status: SheetStatus.COMPLETE },
      include: { items: { select: { id: true } } },
      orderBy: { updatedAt: 'asc' },
      take: 20,
    });

    if (sheetsComplete.length > 0) {
      items.push({
        id: 'prod-sheets-complete',
        department: 'PRODUCTION',
        priority: 'MEDIUM',
        category: 'Sheet Production',
        title: `${sheetsComplete.length} completed sheet(s) — start next process`,
        detail: `Sheets are printed. Move items to processing (lamination, binding, cutting, etc.)`,
        actionUrl: '/sheet-layout',
      });
    }

    // 9. Sheet items in PROCESSING — respect item-level follow-up date
    const sheetsInProcessing = await this.prisma.printSheetItem.findMany({
      where: {
        sheet: { status: SheetStatus.PROCESSING },
        orderItem: { itemProductionStage: { not: OrderProductionStage.READY_FOR_DISPATCH } },
      },
      include: {
        sheet: { select: { sheetNo: true, gsm: true, sizeInches: true, updatedAt: true } },
        orderItem: {
          select: {
            product: { select: { name: true } },
            order: { select: { orderNumber: true, customer: { select: { businessName: true } } } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    for (const si of sheetsInProcessing) {
      const followUpDate = (si as any).dueDate as Date | null ?? null;
      if (!isDueOrOverdueIST(followUpDate)) continue;
      const days = ageDays(si.sheet.updatedAt);
      const isEnvelope = si.orderItem.product.name.toUpperCase().includes('ENVELOPE');
      // ENVELOPE items are handled by the daily Raza Envelope WhatsApp — show in CEO report only after 3d
      const minDays = isEnvelope ? 3 : 2;
      if (!followUpDate && days < minDays) continue;
      const dueDateStr = followUpDate ? ` · Follow-up: ${followUpDate.toLocaleDateString('en-IN')}` : '';
      items.push({
        id: `prod-sheet-proc-${si.id}`,
        department: 'PRODUCTION',
        priority: days > 4 ? 'HIGH' : 'MEDIUM',
        category: 'Sheet Processing Follow-up',
        title: `Sheet ${si.sheet.sheetNo} processing — ${si.orderItem.order.orderNumber}`,
        detail: `${si.orderItem.order.customer.businessName} · ${si.orderItem.product.name} · ${si.sheet.gsm} GSM, ${si.sheet.sizeInches}"${dueDateStr}`,
        orderNo: si.orderItem.order.orderNumber,
        ageDays: Math.round(days),
        actionUrl: '/sheet-layout',
      });
    }

    // 10. Orders past expectedDelivery in any active production stage
    const overdueOrders = await this.prisma.order.findMany({
      where: {
        status: { in: [OrderStatus.APPROVED, OrderStatus.IN_PRODUCTION] },
        expectedDelivery: { lt: new Date() },
      },
      include: { customer: { select: { businessName: true } } },
      orderBy: { expectedDelivery: 'asc' },
      take: 30,
    });

    for (const o of overdueOrders) {
      const days = ageDays(o.expectedDelivery!);
      items.push({
        id: `prod-overdue-${o.id}`,
        department: 'PRODUCTION',
        priority: days > 2 ? 'HIGH' : 'MEDIUM',
        category: 'Overdue Orders',
        title: `OVERDUE: ${o.orderNumber} — ${Math.round(days)}d past deadline`,
        detail: `${o.customer.businessName} — expected ${o.expectedDelivery!.toLocaleDateString('en-IN')}, stage: ${o.productionStage}`,
        orderNo: o.orderNumber,
        ageDays: Math.round(days),
        actionUrl: '/production',
      });
    }

    return items;
  }

  // ─── DISPATCH ─────────────────────────────────────────────────────────────

  private async checkDispatch(): Promise<ActionItem[]> {
    const items: ActionItem[] = [];

    // 1. Orders READY_FOR_DISPATCH > 2 days, no shipment initiated
    const readyNotBooked = await this.prisma.order.findMany({
      where: {
        productionStage: OrderProductionStage.READY_FOR_DISPATCH,
        status: { in: [OrderStatus.READY_FOR_DISPATCH, OrderStatus.IN_PRODUCTION, OrderStatus.APPROVED] },
        shipments: { none: {} },
      },
      include: { customer: { select: { businessName: true } } },
      orderBy: { updatedAt: 'asc' },
    });

    for (const o of readyNotBooked) {
      const days = ageDays(o.updatedAt);
      if (days < 2) continue;
      items.push({
        id: `disp-notbooked-${o.id}`,
        department: 'DISPATCH',
        priority: days > 3 ? 'HIGH' : 'MEDIUM',
        category: 'Booking Pending',
        title: `Book shipment — ${o.orderNumber}`,
        detail: `${o.customer.businessName} — ready ${Math.round(days)} days, no booking initiated`,
        orderNo: o.orderNumber,
        ageDays: Math.round(days),
        actionUrl: '/dispatch',
      });
    }

    // 2. Shipments PENDING (packed but not shipped)
    const pendingShipments = await this.prisma.shipment.findMany({
      where: { status: ShipmentStatus.PENDING },
      include: { order: { select: { orderNumber: true, customer: { select: { businessName: true } } } } },
      orderBy: { createdAt: 'asc' },
      take: 30,
    });

    for (const s of pendingShipments) {
      const hours = ageHours(s.createdAt);
      if (hours < 4) continue;
      items.push({
        id: `disp-pending-${s.id}`,
        department: 'DISPATCH',
        priority: hours > 24 ? 'HIGH' : 'MEDIUM',
        category: 'Unshipped Parcel',
        title: `Unshipped: ${s.order.orderNumber} — ${s.shipmentNumber}`,
        detail: `${s.order.customer.businessName} — parcel created but not picked up, ${fmtAge(hours)}`,
        orderNo: s.order.orderNumber,
        ageHours: Math.round(hours),
        actionUrl: '/dispatch',
      });
    }

    // 3. Returned shipments (RTO/NDR equivalent)
    const returnedShipments = await this.prisma.shipment.findMany({
      where: { status: ShipmentStatus.RETURNED },
      include: { order: { select: { orderNumber: true, customer: { select: { businessName: true } } } } },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });

    for (const s of returnedShipments) {
      items.push({
        id: `disp-rto-${s.id}`,
        department: 'DISPATCH',
        priority: 'HIGH',
        category: 'RTO / Returned',
        title: `RTO returned — ${s.order.orderNumber}`,
        detail: `${s.order.customer.businessName} — ${s.shipmentNumber} returned. Action needed.`,
        orderNo: s.order.orderNumber,
        actionUrl: '/dispatch',
      });
    }

    // 4. Courier charge mismatch — orders where shippingCharge differs from actual
    // (flag orders where salesAgent set a shipping charge — for audit)
    const shippingChargeOrders = await this.prisma.order.findMany({
      where: {
        shippingCharge: { gt: 0 },
        status: { in: [OrderStatus.DISPATCHED, OrderStatus.DELIVERED] },
      },
      include: {
        customer: { select: { businessName: true } },
        salesAgent: { select: { fullName: true } },
        shipments: { select: { carrierName: true, id: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    });

    if (shippingChargeOrders.length > 0) {
      items.push({
        id: 'disp-courier-audit',
        department: 'DISPATCH',
        priority: 'LOW',
        category: 'Courier Charge Audit',
        title: `Review courier charges — ${shippingChargeOrders.length} recent orders`,
        detail: `Compare agent-quoted shipping vs actual carrier charges for accuracy`,
        actionUrl: '/dispatch',
      });
    }

    return items;
  }

  // ─── STOCK / COSTS ────────────────────────────────────────────────────────

  private async checkStock(): Promise<ActionItem[]> {
    const items: ActionItem[] = [];

    // 1. Low paper stock (< 500 sheets)
    const lowStock = await this.prisma.paperInventory.findMany({
      where: { balanceSheets: { lt: 500 } },
      include: { press: { select: { name: true } } },
    });

    for (const inv of lowStock) {
      items.push({
        id: `stock-paper-${inv.id}`,
        department: 'STOCK',
        priority: inv.balanceSheets < 100 ? 'HIGH' : 'MEDIUM',
        category: 'Paper Stock',
        title: `Low paper stock — ${inv.gsm} GSM ${inv.quality}`,
        detail: `${inv.press.name}: only ${inv.balanceSheets} sheets remaining. Reorder now.`,
        actionUrl: '/paper-inventory',
      });
    }

    // 2. Vendor statements — jobworks pending payment
    const unpaidJobWorks = await this.prisma.jobWork.findMany({
      where: { status: JobWorkStatus.COMPLETED, isPaid: false },
      include: {
        vendor: { select: { name: true } },
        orderItem: { select: { order: { select: { orderNumber: true } } } },
      },
      orderBy: { createdAt: 'asc' },
      take: 30,
    });

    if (unpaidJobWorks.length > 0) {
      const totalDue = unpaidJobWorks.reduce((s, jw) => s + Number(jw.cost), 0);
      items.push({
        id: 'stock-vendor-payment',
        department: 'STOCK',
        priority: 'MEDIUM',
        category: 'Vendor Statement',
        title: `${unpaidJobWorks.length} vendor payments pending — ₹${totalDue.toLocaleString('en-IN')}`,
        detail: `Completed job works not yet paid. Review vendor statements and clear dues.`,
        actionUrl: '/vendors',
      });
    }

    return items;
  }

  // ─── WhatsApp Message Formatter ───────────────────────────────────────────

  private formatWhatsAppMessage(report: VirtualCeoReport): string {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

    const lines: string[] = [
      `🤖 *Virtual CEO Daily Report*`,
      `📅 ${dateStr}`,
      ``,
      `📊 *Summary: ${report.summary.totalActions} action items*`,
      `🔴 High: ${report.summary.highPriority} | 🟡 Medium: ${report.summary.mediumPriority} | 🟢 Low: ${report.summary.lowPriority}`,
      ``,
    ];

    const highItems = [
      ...report.accounts,
      ...report.production,
      ...report.dispatch,
      ...report.stock,
    ].filter(a => a.priority === 'HIGH').slice(0, 10);

    if (highItems.length > 0) {
      lines.push(`🔴 *URGENT ACTIONS:*`);
      for (const item of highItems) {
        lines.push(`• [${item.category}] ${item.title}`);
      }
      lines.push('');
    }

    if (report.summary.accounts > 0) {
      lines.push(`💰 *Accounts (${report.summary.accounts})*`);
      for (const a of report.accounts.slice(0, 4)) {
        lines.push(`• ${a.title}`);
      }
      if (report.accounts.length > 4) lines.push(`  ...+${report.accounts.length - 4} more`);
      lines.push('');
    }

    if (report.summary.production > 0) {
      lines.push(`🏭 *Production (${report.summary.production})*`);
      for (const a of report.production.slice(0, 5)) {
        lines.push(`• ${a.title}`);
      }
      if (report.production.length > 5) lines.push(`  ...+${report.production.length - 5} more`);
      lines.push('');
    }

    if (report.summary.dispatch > 0) {
      lines.push(`📦 *Dispatch (${report.summary.dispatch})*`);
      for (const a of report.dispatch.slice(0, 4)) {
        lines.push(`• ${a.title}`);
      }
      if (report.dispatch.length > 4) lines.push(`  ...+${report.dispatch.length - 4} more`);
      lines.push('');
    }

    if (report.summary.stock > 0) {
      lines.push(`📋 *Stock / Costs (${report.summary.stock})*`);
      for (const a of report.stock.slice(0, 3)) {
        lines.push(`• ${a.title}`);
      }
      lines.push('');
    }

    lines.push(`_Open the RarePrint ERP to take action ✅_`);

    return lines.join('\n');
  }

  // ─── Cron: Daily 9 AM IST — Envelope Pending List to Raza Envelope ───────────
  @Cron('0 9 * * *', { timeZone: 'Asia/Kolkata' })
  async sendDailyEnvelopeList() {
    this.logger.log('Sending daily envelope pending list to Raza Envelope');
    try {
      // Find Raza Envelope vendor
      const razaVendor = await this.prisma.vendor.findFirst({
        where: { name: { contains: 'Raza', mode: 'insensitive' } },
        select: { id: true, name: true, phone: true },
      });

      if (!razaVendor?.phone) {
        this.logger.warn('Raza Envelope vendor not found or has no phone — skipping daily list');
        return { sent: false, reason: 'vendor_not_found' };
      }

      // All PROCESSING sheets with their items
      const sheets = await this.prisma.printSheet.findMany({
        where: { status: SheetStatus.PROCESSING },
        select: {
          id: true,
          sheetNo: true,
          gsm: true,
          sizeInches: true,
          updatedAt: true,
          items: {
            select: {
              id: true,
              quantityOnSheet: true,
              dueDate: true,
              orderItem: {
                select: {
                  id: true,
                  itemProductionStage: true,
                  product: { select: { name: true } },
                  order: {
                    select: {
                      orderNumber: true,
                      customer: { select: { businessName: true } },
                    },
                  },
                },
              },
            },
          },
        },
      });

      // Collect ENVELOPE items only (exclude items already READY_FOR_DISPATCH)
      type EnvItem = {
        sheetNo: string; gsm: number; sizeInches: string;
        orderNo: string; customerName: string;
        qty: number; dueDate: Date | null; daysInStage: number;
      };
      const envelopeItems: EnvItem[] = [];

      for (const sheet of sheets) {
        const daysInStage = Math.floor(
          (Date.now() - new Date(sheet.updatedAt).getTime()) / 86_400_000,
        );
        for (const si of sheet.items) {
          const productName = si.orderItem.product.name;
          if (!productName.toUpperCase().includes('ENVELOPE')) continue;
          if (si.orderItem.itemProductionStage === OrderProductionStage.READY_FOR_DISPATCH) continue;

          envelopeItems.push({
            sheetNo: sheet.sheetNo,
            gsm: sheet.gsm,
            sizeInches: sheet.sizeInches,
            orderNo: si.orderItem.order.orderNumber,
            customerName: si.orderItem.order.customer.businessName,
            qty: si.quantityOnSheet,
            dueDate: si.dueDate ?? null,
            daysInStage,
          });
        }
      }

      if (envelopeItems.length === 0) {
        this.logger.log('No pending envelope items — skipping WhatsApp');
        return { sent: false, reason: 'no_items', razaPhone: razaVendor.phone };
      }

      // Build message
      const dateStr = new Date().toLocaleDateString('en-IN', {
        weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
        timeZone: 'Asia/Kolkata',
      });

      const lines: string[] = [
        `📋 *Envelope Pending List*`,
        `📅 ${dateStr}`,
        ``,
      ];

      // Group by sheet
      const bySheet = new Map<string, EnvItem[]>();
      for (const item of envelopeItems) {
        if (!bySheet.has(item.sheetNo)) bySheet.set(item.sheetNo, []);
        bySheet.get(item.sheetNo)!.push(item);
      }

      for (const [sheetNo, items] of bySheet) {
        const { gsm, sizeInches } = items[0];
        lines.push(`*Sheet ${sheetNo} — ${gsm} GSM ${sizeInches}*`);
        for (const item of items) {
          const due = item.dueDate
            ? new Date(item.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' })
            : '—';
          const age = item.daysInStage > 0 ? ` | ${item.daysInStage}d` : '';
          lines.push(`• #${item.orderNo} | ${item.customerName} | ${item.qty.toLocaleString('en-IN')} pcs | Due: ${due}${age}`);
        }
        lines.push('');
      }

      lines.push(`Total: ${envelopeItems.length} envelope item(s) pending`);
      lines.push(`Please confirm schedule 🙏`);

      const message = lines.join('\n');
      const ok = await this.whatsapp.sendTextMessage(razaVendor.phone, message);
      this.logger.log(
        ok
          ? `✅ Envelope daily list sent to ${razaVendor.name} (${razaVendor.phone}): ${envelopeItems.length} items`
          : `❌ Envelope daily list failed for ${razaVendor.phone}`,
      );
      return { sent: ok, itemCount: envelopeItems.length, razaPhone: razaVendor.phone };
    } catch (err) {
      this.logger.error('Envelope daily list error', err);
      return { sent: false, reason: String(err) };
    }
  }
}
