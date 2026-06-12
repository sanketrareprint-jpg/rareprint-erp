// backend/src/dashboard/dashboard.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus, OrderProductionStage, ProductionCategory } from '@prisma/client';

type ProductionKpiMetric = {
  key: string;
  label: string;
  avgHours: number | null;
  avgDays: number | null;
  sampleSize: number;
  note: string;
};

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary() {
    const [statsResult, agentsResult, catStagesResult, avgProdResult, leadDataResult, productionKpisResult] = await Promise.allSettled([
      this.getStats(),
      this.getAgentLeaderboard(),
      this.getCategoryStageQuantities(),
      this.getAvgProductionTime(),
      this.getLeadSourceAnalytics(),
      this.withTimeout(this.getProductionKpis(), 10000, this.getEmptyProductionKpis()),
    ]);

    return {
      stats: statsResult.status === 'fulfilled' ? statsResult.value : this.getEmptyStats(),
      agents: agentsResult.status === 'fulfilled' ? agentsResult.value : [],
      catStages: catStagesResult.status === 'fulfilled' ? catStagesResult.value : [],
      avgProd: avgProdResult.status === 'fulfilled' ? avgProdResult.value : [],
      leadData: leadDataResult.status === 'fulfilled' ? leadDataResult.value : { allTime: [], thisMonth: [] },
      productionKpis: productionKpisResult.status === 'fulfilled'
        ? productionKpisResult.value
        : { metrics: [], categoryCycleTimes: [], bottlenecks: [] },
    };
  }

  private getEmptyProductionKpis() {
    return { metrics: [], categoryCycleTimes: [], bottlenecks: [] };
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(fallback), timeoutMs);
      promise
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch(() => {
          clearTimeout(timer);
          resolve(fallback);
        });
    });
  }

  private getEmptyStats() {
    const last7Days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      return {
        date: date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
        count: 0,
        revenue: 0,
      };
    });

    return {
      revenue: {
        today: 0,
        thisMonth: 0,
        lastMonth: 0,
        growth: 0,
        averagePerDay: 0,
        monthlyRunRate: 0,
        daysElapsed: new Date().getDate(),
        daysInMonth: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate(),
      },
      orders: { total: 0, thisMonth: 0, byStatus: {}, last7Days },
      finance: { totalOrderValue: 0, totalPaid: 0, totalOutstanding: 0 },
      pending: { approval: 0, dispatchApproval: 0, inProduction: 0, readyForDispatch: 0 },
      recentOrders: [],
    };
  }

  async getStats() {
    const now = new Date();
    const istOffsetMs = 330 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffsetMs);
    const istYear = istNow.getUTCFullYear();
    const istMonth = istNow.getUTCMonth();
    const istDate = istNow.getUTCDate();
    const daysInMonth = new Date(Date.UTC(istYear, istMonth + 1, 0)).getUTCDate();
    const daysElapsed = istDate;
    const fromIstStart = (year: number, month: number, day: number) =>
      new Date(Date.UTC(year, month, day) - istOffsetMs);

    const startOfToday = fromIstStart(istYear, istMonth, istDate);
    const startOfTomorrow = fromIstStart(istYear, istMonth, istDate + 1);
    const startOfMonth = fromIstStart(istYear, istMonth, 1);
    const startOfNextMonth = fromIstStart(istYear, istMonth + 1, 1);
    const startOfLastMonth = fromIstStart(istYear, istMonth - 1, 1);
    const endOfLastMonth = startOfMonth;

    const [
      allOrderAgg,
      thisMonthOrderCount,
      todayOrderAgg,
      thisMonthOrderAgg,
      lastMonthOrderAgg,
      allPaymentAgg,
      statusCounts,
      last7DaysOrders,
      recentOrders,
    ] = await Promise.all([
      this.prisma.order.aggregate({
        where: { status: { not: OrderStatus.CANCELLED } },
        _count: { _all: true },
        _sum: { grandTotal: true },
      }),
      this.prisma.order.count({
        where: { orderDate: { gte: startOfMonth, lt: startOfNextMonth }, status: { not: OrderStatus.CANCELLED } },
      }),
      this.prisma.order.aggregate({
        where: { orderDate: { gte: startOfToday, lt: startOfTomorrow }, status: { not: OrderStatus.CANCELLED } },
        _sum: { grandTotal: true },
      }),
      this.prisma.order.aggregate({
        where: { orderDate: { gte: startOfMonth, lt: startOfNextMonth }, status: { not: OrderStatus.CANCELLED } },
        _sum: { grandTotal: true },
      }),
      this.prisma.order.aggregate({
        where: { orderDate: { gte: startOfLastMonth, lt: endOfLastMonth }, status: { not: OrderStatus.CANCELLED } },
        _sum: { grandTotal: true },
      }),
      this.prisma.payment.aggregate({ _sum: { amount: true } }),
      this.prisma.order.groupBy({
        by: ['status'],
        where: { status: { not: OrderStatus.CANCELLED } },
        _count: { _all: true },
      }),
      this.prisma.order.findMany({
        where: { orderDate: { gte: new Date(now.getTime() - 7 * 86400000) }, status: { not: OrderStatus.CANCELLED } },
        orderBy: { orderDate: 'asc' },
        select: { orderDate: true, grandTotal: true },
      }),
      this.prisma.order.findMany({
        where: { status: { not: OrderStatus.CANCELLED } },
        orderBy: { orderDate: 'desc' }, take: 10,
        select: { id: true, orderNumber: true, status: true, grandTotal: true, orderDate: true },
      }),
    ]);

    const todayValue = Number(todayOrderAgg._sum.grandTotal ?? 0);
    const thisMonthSale = Number(thisMonthOrderAgg._sum.grandTotal ?? 0);
    const lastMonthRevenue = Number(lastMonthOrderAgg._sum.grandTotal ?? 0);
    const averagePerDay = daysElapsed > 0 ? thisMonthSale / daysElapsed : 0;
    const monthlyRunRate = averagePerDay * daysInMonth;
    const growth = lastMonthRevenue > 0 ? Math.round(((thisMonthSale - lastMonthRevenue) / lastMonthRevenue) * 100) : 0;

    const totalOrderValue = Number(allOrderAgg._sum.grandTotal ?? 0);
    const totalPaid       = Number(allPaymentAgg._sum.amount ?? 0);

    const byStatus: Record<string, number> = {};
    for (const row of statusCounts) byStatus[row.status] = row._count._all;

    // Last 7 days by date
   const dayMap: Record<string, { count: number; revenue: number }> = {};
for (let i = 6; i >= 0; i--) {
  const d = new Date(now.getTime() - i * 86400000);
  dayMap[d.toISOString().slice(0, 10)] = { count: 0, revenue: 0 };
}
for (const o of last7DaysOrders) {
  const key = o.orderDate.toISOString().slice(0, 10);
  if (key in dayMap) { dayMap[key].count++; dayMap[key].revenue += Number(o.grandTotal); }
}
const last7Days = Object.entries(dayMap).map(([date, val]) => ({
  date: new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
  count: val.count,
  revenue: val.revenue,
}));

    return {
      revenue: { today: todayValue, thisMonth: thisMonthSale, lastMonth: lastMonthRevenue, growth, averagePerDay, monthlyRunRate, daysElapsed, daysInMonth },
      orders: {
        total: allOrderAgg._count._all,
        thisMonth: thisMonthOrderCount,
        byStatus,
        last7Days,
      },
      finance: { totalOrderValue, totalPaid, totalOutstanding: Math.max(0, totalOrderValue - totalPaid) },
      pending: {
        approval:        byStatus[OrderStatus.PENDING_APPROVAL] ?? 0,
        dispatchApproval: byStatus[OrderStatus.PENDING_DISPATCH_APPROVAL] ?? 0,
        inProduction:    byStatus[OrderStatus.IN_PRODUCTION] ?? 0,
        readyForDispatch: byStatus[OrderStatus.READY_FOR_DISPATCH] ?? 0,
      },
      recentOrders: recentOrders.map(o => ({
        id: o.id,
        orderNo: o.orderNumber,
        status: o.status,
        total: Number(o.grandTotal),
        date: o.orderDate.toISOString(),
      })),
    };
  }

  // ── Agent leaderboard ────────────────────────────────────────────────────
  async getAgentLeaderboard() {
    const now = new Date();
    const istOffsetMs = 330 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffsetMs);
    const startOfMonth = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), 1) - istOffsetMs);
    const startOfNextMonth = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth() + 1, 1) - istOffsetMs);
    const orders = await this.prisma.order.findMany({
      where: { salesAgentId: { not: null }, status: { not: OrderStatus.CANCELLED } },
      include: { payments: true, salesAgent: { select: { id: true, fullName: true, email: true } } },
    });
    const map: Record<string, any> = {};
    for (const o of orders) {
      const id = o.salesAgentId!;
      if (!map[id]) map[id] = { id, name: o.salesAgent?.fullName ?? id, email: o.salesAgent?.email ?? "", totalOrders: 0, monthOrders: 0, totalRevenue: 0, monthRevenue: 0, totalValue: 0 };
     const orderValue = Number(o.grandTotal);
      map[id].totalOrders++;
      map[id].totalRevenue += orderValue;
      map[id].totalValue += orderValue;
      if (o.orderDate >= startOfMonth && o.orderDate < startOfNextMonth) { map[id].monthOrders++; map[id].monthRevenue += orderValue; }
    }
    const allAgents = await this.prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, fullName: true, email: true, role: true },
    });
    for (const agent of allAgents) {
      if (!map[agent.id] && (agent.role === 'SALES_AGENT' || (agent.role as string) === 'AGENT')) {
        map[agent.id] = { id: agent.id, name: agent.fullName, email: agent.email, totalOrders: 0, monthOrders: 0, totalRevenue: 0, monthRevenue: 0, totalValue: 0 };
      }
    }
    return Object.values(map).sort((a: any, b: any) => b.monthRevenue - a.monthRevenue || b.totalRevenue - a.totalRevenue);
  }
  // ── Product category quantity by stage ──────────────────────────────────
  async getCategoryStageQuantities() {
    const items = await this.prisma.orderItem.findMany({
      where: {
        order: {
          status: {
            in: [OrderStatus.APPROVED, OrderStatus.IN_PRODUCTION, OrderStatus.READY_FOR_DISPATCH],
          },
        },
        itemProductionStage: { not: OrderProductionStage.NOT_PRINTED },
      },
      include: {
        product: { include: { category: true } },
      },
    });

    const result: Record<string, Record<string, number>> = {};
    for (const item of items) {
      const cat   = item.product.category.name;
      const stage = item.itemProductionStage;
      if (!result[cat]) result[cat] = {};
      result[cat][stage] = (result[cat][stage] ?? 0) + item.quantity;
    }

    return Object.entries(result).map(([category, stages]) => ({
      category,
      printing:         stages[OrderProductionStage.PRINTING]           ?? 0,
      processing:       stages[OrderProductionStage.PROCESSING]         ?? 0,
      readyForDispatch: stages[OrderProductionStage.READY_FOR_DISPATCH] ?? 0,
    }));
  }

  // ── Average production time per category ────────────────────────────────
  async getAvgProductionTime() {
    // Items that completed (reached READY_FOR_DISPATCH) — measure from order approval to ready
    const items = await this.prisma.orderItem.findMany({
      where: { itemProductionStage: OrderProductionStage.READY_FOR_DISPATCH },
      include: {
        product: { include: { category: true } },
        stageLogs: { orderBy: { createdAt: 'asc' } },
        order: true,
      },
    });

    const catTimes: Record<string, number[]> = {};
    for (const item of items) {
      const startLog = item.stageLogs.find(l => l.toStage === OrderProductionStage.PRINTING);
      const endLog   = item.stageLogs.find(l => l.toStage === OrderProductionStage.READY_FOR_DISPATCH);
      if (!startLog || !endLog) continue;
      const hours = (endLog.createdAt.getTime() - startLog.createdAt.getTime()) / 3600000;
      const cat   = item.product.category.name;
      if (!catTimes[cat]) catTimes[cat] = [];
      catTimes[cat].push(hours);
    }

    return Object.entries(catTimes).map(([category, times]) => ({
      category,
      avgHours:  Math.round(times.reduce((s, t) => s + t, 0) / times.length),
      avgDays:   +(times.reduce((s, t) => s + t, 0) / times.length / 24).toFixed(1),
      sampleSize: times.length,
    }));
  }

  private hoursBetween(start?: Date | null, end?: Date | null) {
    if (!start || !end) return null;
    const hours = (end.getTime() - start.getTime()) / 3600000;
    return Number.isFinite(hours) && hours >= 0 ? hours : null;
  }

  private avg(values: (number | null)[]) {
    const clean = values.filter((value): value is number => value !== null && Number.isFinite(value));
    if (!clean.length) return null;
    return clean.reduce((sum, value) => sum + value, 0) / clean.length;
  }

  private metric(key: string, label: string, values: (number | null)[], note: string): ProductionKpiMetric {
    const clean = values.filter((value): value is number => value !== null && Number.isFinite(value));
    const avgHours = this.avg(clean);
    return {
      key,
      label,
      avgHours: avgHours === null ? null : +avgHours.toFixed(1),
      avgDays: avgHours === null ? null : +(avgHours / 24).toFixed(1),
      sampleSize: clean.length,
      note,
    };
  }

  private firstStatusLog<T extends { toStatus: OrderStatus; createdAt: Date }>(logs: T[], status: OrderStatus) {
    return logs.find((log) => log.toStatus === status)?.createdAt ?? null;
  }

  private firstMetadataLog<T extends { metadata: unknown; createdAt: Date }>(
    logs: T[],
    eventType: string,
    predicate?: (metadata: Record<string, unknown>) => boolean,
  ) {
    return logs.find((log) => {
      const metadata = log.metadata as Record<string, unknown> | null;
      return metadata?.eventType === eventType && (!predicate || predicate(metadata));
    })?.createdAt ?? null;
  }

  async getProductionKpis() {
    const since = new Date();
    since.setDate(since.getDate() - 120);

    const [orders, payments, jobWorks, sheetItems, sheetLogs] = await Promise.all([
      this.prisma.order.findMany({
        where: { status: { not: OrderStatus.CANCELLED }, orderDate: { gte: since } },
        orderBy: { orderDate: 'desc' },
        take: 750,
        include: {
          statusLogs: { where: { createdAt: { gte: since } }, orderBy: { createdAt: 'asc' } },
          shipments: { orderBy: { createdAt: 'asc' } },
          items: { include: { product: { include: { category: true } } } },
        },
      }),
      this.prisma.payment.findMany({
        where: { verificationStatus: 'VERIFIED', verifiedAt: { not: null }, createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 1000,
        select: { createdAt: true, verifiedAt: true },
      }),
      this.prisma.jobWork.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 1000,
        include: {
          orderItem: {
            include: {
              order: { include: { statusLogs: { where: { createdAt: { gte: since } }, orderBy: { createdAt: 'asc' } } } },
            },
          },
        },
      }),
      this.prisma.printSheetItem.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 1000,
        include: {
          orderItem: {
            include: {
              order: { include: { statusLogs: { where: { createdAt: { gte: since } }, orderBy: { createdAt: 'asc' } } } },
            },
          },
        },
      }),
      this.prisma.statusLog.findMany({
        where: { createdAt: { gte: since }, reason: { contains: 'Sheet' } },
        orderBy: { createdAt: 'asc' },
        take: 2000,
        select: { createdAt: true, metadata: true },
      }),
    ]);

    const approvalTimes = orders.map((order) =>
      this.hoursBetween(
        this.firstStatusLog(order.statusLogs, OrderStatus.PENDING_APPROVAL) ?? order.createdAt,
        this.firstStatusLog(order.statusLogs, OrderStatus.APPROVED),
      ),
    );

    const receiptVerifyTimes = payments.map((payment) => this.hoursBetween(payment.createdAt, payment.verifiedAt));

    const categoryAssignmentTimes = {
      [ProductionCategory.INHOUSE]: [] as (number | null)[],
      [ProductionCategory.CLUBBING]: [] as (number | null)[],
      [ProductionCategory.SHEET_PRODUCTION]: [] as (number | null)[],
    };

    const inhousePrintingStartTimes: (number | null)[] = [];
    const categoryCycleTimes: Record<string, number[]> = {};
    const readyToBookingTimes: (number | null)[] = [];

    for (const order of orders) {
      const approvedAt = this.firstStatusLog(order.statusLogs, OrderStatus.APPROVED);
      const readyAt = this.firstStatusLog(order.statusLogs, OrderStatus.READY_FOR_DISPATCH);
      const dispatchedAt = this.firstStatusLog(order.statusLogs, OrderStatus.DISPATCHED)
        ?? this.firstStatusLog(order.statusLogs, OrderStatus.PARTIALLY_DISPATCHED)
        ?? order.shipments[0]?.createdAt
        ?? null;

      if (readyAt && dispatchedAt) readyToBookingTimes.push(this.hoursBetween(readyAt, dispatchedAt));

      for (const item of order.items) {
        const productionCategory = item.productionCategory;
        if (productionCategory && productionCategory in categoryAssignmentTimes) {
          const assignedAt = this.firstMetadataLog(
            order.statusLogs,
            'PRODUCTION_CATEGORY_ASSIGNED',
            (metadata) => metadata.orderItemId === item.id || metadata.productionCategory === productionCategory,
          ) ?? (approvedAt && item.updatedAt >= approvedAt ? item.updatedAt : null);
          categoryAssignmentTimes[productionCategory].push(this.hoursBetween(approvedAt, assignedAt));
        }

        if (productionCategory === ProductionCategory.INHOUSE) {
          const printingAt = this.firstMetadataLog(
            order.statusLogs,
            'ITEM_STAGE_CHANGED',
            (metadata) => metadata.orderItemId === item.id && metadata.itemStage === OrderProductionStage.PRINTING,
          ) ?? order.statusLogs.find((log) => log.reason?.includes('Printing'))?.createdAt ?? null;
          inhousePrintingStartTimes.push(this.hoursBetween(approvedAt, printingAt));
        }

        if (readyAt) {
          const category = item.product.category.name;
          if (!categoryCycleTimes[category]) categoryCycleTimes[category] = [];
          const hours = this.hoursBetween(order.orderDate, readyAt);
          if (hours !== null) categoryCycleTimes[category].push(hours);
        }
      }
    }

    const vendorAssignmentTimes = [
      ...jobWorks.map((jobWork) =>
        this.hoursBetween(
          this.firstStatusLog(jobWork.orderItem.order.statusLogs, OrderStatus.APPROVED),
          jobWork.createdAt,
        ),
      ),
      ...sheetLogs
        .filter((log) => (log.metadata as any)?.eventType === 'SHEET_STAGE_VENDOR_ASSIGNED')
        .map((log) => {
          const metadata = log.metadata as Record<string, unknown>;
          const sheetAssignedAt = sheetLogs.find((candidate) =>
            (candidate.metadata as any)?.eventType === 'SHEET_ASSIGNED' &&
            (candidate.metadata as any)?.sheetId === metadata.sheetId
          )?.createdAt ?? null;
          return this.hoursBetween(sheetAssignedAt, log.createdAt);
        }),
    ];

    const sheetAssignmentTimes = sheetItems.map((sheetItem) =>
      this.hoursBetween(
        this.firstStatusLog(sheetItem.orderItem.order.statusLogs, OrderStatus.APPROVED),
        sheetItem.createdAt,
      ),
    );

    const completeToPrintingTimes: (number | null)[] = [];
    const completeBySheet = new Map<string, Date>();
    for (const log of sheetLogs) {
      const metadata = log.metadata as Record<string, unknown> | null;
      if (metadata?.eventType !== 'SHEET_STATUS_CHANGED' || typeof metadata.sheetId !== 'string') continue;
      if (metadata.sheetStatus === 'COMPLETE' && !completeBySheet.has(metadata.sheetId)) {
        completeBySheet.set(metadata.sheetId, log.createdAt);
      }
      if (metadata.sheetStatus === 'PRINTING') {
        completeToPrintingTimes.push(this.hoursBetween(completeBySheet.get(metadata.sheetId), log.createdAt));
      }
    }

    const categoryRows = Object.entries(categoryCycleTimes)
      .map(([category, times]) => {
        const avgHours = this.avg(times);
        return {
          category,
          avgHours: avgHours === null ? null : +avgHours.toFixed(1),
          avgDays: avgHours === null ? null : +(avgHours / 24).toFixed(1),
          sampleSize: times.length,
        };
      })
      .sort((a, b) => (b.avgHours ?? 0) - (a.avgHours ?? 0));

    const metrics = [
      this.metric('order_approval', 'Order Approval', approvalTimes, 'Order created to accounts approval'),
      this.metric('receipt_verification', 'Receipt Verification', receiptVerifyTimes, 'Payment receipt upload to accounts verification'),
      this.metric('assign_inhouse', 'Assign Inhouse Dept.', categoryAssignmentTimes.INHOUSE, 'Accounts approval to inhouse category assignment'),
      this.metric('assign_clubbing', 'Assign Clubbing Dept.', categoryAssignmentTimes.CLUBBING, 'Accounts approval to clubbing category assignment'),
      this.metric('assign_sheet', 'Assign Sheet Dept.', categoryAssignmentTimes.SHEET_PRODUCTION, 'Accounts approval to sheet production assignment'),
      this.metric('vendor_assignment', 'Vendor Assignment', vendorAssignmentTimes, 'Production/sheet assignment to vendor selection'),
      this.metric('inhouse_print_start', 'Inhouse Printing Start', inhousePrintingStartTimes, 'Accounts approval to first inhouse printing signal'),
      this.metric('sheet_assignment', 'Sheet Assignment', sheetAssignmentTimes, 'Accounts approval to placing product on sheet'),
      this.metric('sheet_complete_to_printing', 'Sheet Complete to Printing', completeToPrintingTimes, 'Sheet COMPLETE status to PRINTING status'),
      this.metric('ready_to_booking', 'Ready to Dispatch Booking', readyToBookingTimes, 'Ready-for-dispatch to shipment booking'),
    ];

    return {
      metrics,
      categoryCycleTimes: categoryRows,
      bottlenecks: [...metrics].filter((metric) => metric.avgHours !== null).sort((a, b) => (b.avgHours ?? 0) - (a.avgHours ?? 0)).slice(0, 5),
    };
  }

  // ── Lead source analytics ────────────────────────────────────────────────
  async getLeadSourceAnalytics() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const orders = await this.prisma.order.findMany({
      where: {
        leadSource: { not: null },
        status: { not: OrderStatus.CANCELLED },
      },
      include: { payments: true },
    });

    const allTime:   Record<string, { count: number; revenue: number }> = {};
    const thisMonth: Record<string, { count: number; revenue: number }> = {};

    for (const o of orders) {
      const src     = o.leadSource ?? 'UNKNOWN';
      const revenue = o.payments.reduce((s, p) => s + Number(p.amount), 0);
      const value   = Number(o.grandTotal);

      if (!allTime[src]) allTime[src] = { count: 0, revenue: 0 };
      allTime[src].count++;
      allTime[src].revenue += revenue;

      if (o.orderDate >= startOfMonth) {
        if (!thisMonth[src]) thisMonth[src] = { count: 0, revenue: 0 };
        thisMonth[src].count++;
        thisMonth[src].revenue += revenue;
      }
    }

    return {
      allTime:   Object.entries(allTime).map(([source, d]) => ({ source, ...d })).sort((a, b) => b.revenue - a.revenue),
      thisMonth: Object.entries(thisMonth).map(([source, d]) => ({ source, ...d })).sort((a, b) => b.revenue - a.revenue),
    };
  }
}





                                                                                                                                                                                                                                                              