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

    type AvgRow     = { avg_hours: string | number | null; cnt: string | number };
    type CatRow     = { category: string; avg_hours: string | number | null; cnt: string | number };
    type CatAssign  = { production_category: string; avg_hours: string | number | null; cnt: string | number };

    const n = (v: string | number | null | undefined): number | null =>
      v == null ? null : (Number.isFinite(Number(v)) ? +Number(v).toFixed(1) : null);
    const cnt = (v: string | number): number => Number(v) || 0;

    const toData = (rows: AvgRow[]) => ({ avgHours: n(rows[0]?.avg_hours), sampleSize: cnt(rows[0]?.cnt ?? 0) });
    const mk = (key: string, label: string, d: { avgHours: number | null; sampleSize: number }, note: string): ProductionKpiMetric => ({
      key, label, note, avgHours: d.avgHours,
      avgDays: d.avgHours != null ? +(d.avgHours / 24).toFixed(1) : null,
      sampleSize: d.sampleSize,
    });

    const [approvalR, receiptR, catAssignR, vendorR, sheetAssignR, readyBookR, inhousePrintR, sheetCPR, catTimeR] =
      await Promise.all([

        // 1. Order approval: PENDING_APPROVAL (or createdAt) → APPROVED
        this.prisma.$queryRaw<AvgRow[]>`
          SELECT AVG(EXTRACT(EPOCH FROM (a."createdAt" - COALESCE(p."createdAt", o."createdAt"))) / 3600)::float AS avg_hours,
                 COUNT(a.id)::int AS cnt
          FROM "StatusLog" a
          JOIN "Order" o ON o.id = a."orderId"
          LEFT JOIN LATERAL (
            SELECT "createdAt" FROM "StatusLog" p2
            WHERE p2."orderId" = a."orderId" AND p2."toStatus"::text = 'PENDING_APPROVAL'
            ORDER BY "createdAt" ASC LIMIT 1
          ) p ON true
          WHERE a."toStatus"::text = 'APPROVED' AND a."createdAt" >= ${since}
        `,

        // 2. Receipt verification: payment createdAt → verifiedAt
        this.prisma.$queryRaw<AvgRow[]>`
          SELECT AVG(EXTRACT(EPOCH FROM ("verifiedAt" - "createdAt")) / 3600)::float AS avg_hours,
                 COUNT(id)::int AS cnt
          FROM "Payment"
          WHERE "verificationStatus" = 'VERIFIED' AND "verifiedAt" IS NOT NULL AND "createdAt" >= ${since}
        `,

        // 3. Category assignment: APPROVED → item.updatedAt (when productionCategory set)
        this.prisma.$queryRaw<CatAssign[]>`
          SELECT oi."productionCategory"::text AS production_category,
                 AVG(EXTRACT(EPOCH FROM (oi."updatedAt" - a."createdAt")) / 3600)::float AS avg_hours,
                 COUNT(oi.id)::int AS cnt
          FROM "OrderItem" oi
          JOIN LATERAL (
            SELECT "createdAt" FROM "StatusLog"
            WHERE "orderId" = oi."orderId" AND "toStatus"::text = 'APPROVED'
            ORDER BY "createdAt" ASC LIMIT 1
          ) a ON true
          WHERE oi."productionCategory"::text IN ('INHOUSE','CLUBBING','SHEET_PRODUCTION')
            AND oi."updatedAt" > a."createdAt"
            AND a."createdAt" >= ${since}
          GROUP BY oi."productionCategory"
        `,

        // 4. Vendor assignment: APPROVED → JobWork created
        this.prisma.$queryRaw<AvgRow[]>`
          SELECT AVG(EXTRACT(EPOCH FROM (jw."createdAt" - a."createdAt")) / 3600)::float AS avg_hours,
                 COUNT(jw.id)::int AS cnt
          FROM "JobWork" jw
          JOIN "OrderItem" oi ON oi.id = jw."orderItemId"
          JOIN LATERAL (
            SELECT "createdAt" FROM "StatusLog"
            WHERE "orderId" = oi."orderId" AND "toStatus"::text = 'APPROVED'
            ORDER BY "createdAt" ASC LIMIT 1
          ) a ON true
          WHERE jw."createdAt" >= ${since}
        `,

        // 5. Sheet assignment: APPROVED → PrintSheetItem created
        this.prisma.$queryRaw<AvgRow[]>`
          SELECT AVG(EXTRACT(EPOCH FROM (psi."createdAt" - a."createdAt")) / 3600)::float AS avg_hours,
                 COUNT(psi.id)::int AS cnt
          FROM "PrintSheetItem" psi
          JOIN "OrderItem" oi ON oi.id = psi."orderItemId"
          JOIN LATERAL (
            SELECT "createdAt" FROM "StatusLog"
            WHERE "orderId" = oi."orderId" AND "toStatus"::text = 'APPROVED'
            ORDER BY "createdAt" ASC LIMIT 1
          ) a ON true
          WHERE psi."createdAt" >= ${since}
        `,

        // 6. Ready to booking: READY_FOR_DISPATCH → first shipment
        this.prisma.$queryRaw<AvgRow[]>`
          SELECT AVG(EXTRACT(EPOCH FROM (fs."createdAt" - r."createdAt")) / 3600)::float AS avg_hours,
                 COUNT(r.id)::int AS cnt
          FROM "StatusLog" r
          JOIN LATERAL (
            SELECT MIN("createdAt") AS "createdAt" FROM "Shipment"
            WHERE "orderId" = r."orderId"
          ) fs ON fs."createdAt" > r."createdAt"
          WHERE r."toStatus"::text = 'READY_FOR_DISPATCH' AND r."createdAt" >= ${since}
        `,

        // 7. Inhouse printing start: APPROVED → ITEM_STAGE_CHANGED/PRINTING log
        this.prisma.$queryRaw<AvgRow[]>`
          SELECT AVG(EXTRACT(EPOCH FROM (sl."createdAt" - a."createdAt")) / 3600)::float AS avg_hours,
                 COUNT(sl.id)::int AS cnt
          FROM "StatusLog" sl
          JOIN LATERAL (
            SELECT "createdAt" FROM "StatusLog"
            WHERE "orderId" = sl."orderId" AND "toStatus"::text = 'APPROVED'
            ORDER BY "createdAt" ASC LIMIT 1
          ) a ON true
          WHERE sl.metadata->>'eventType' = 'ITEM_STAGE_CHANGED'
            AND sl.metadata->>'itemStage' = 'PRINTING'
            AND sl."createdAt" >= ${since}
        `,

        // 8. Sheet complete → printing
        this.prisma.$queryRaw<AvgRow[]>`
          WITH sheet_complete AS (
            SELECT metadata->>'sheetId' AS sheet_id, MIN("createdAt") AS completed_at
            FROM "StatusLog"
            WHERE metadata->>'eventType' = 'SHEET_STATUS_CHANGED'
              AND metadata->>'sheetStatus' = 'COMPLETE'
              AND "createdAt" >= ${since}
            GROUP BY metadata->>'sheetId'
          )
          SELECT AVG(EXTRACT(EPOCH FROM (sl."createdAt" - sc.completed_at)) / 3600)::float AS avg_hours,
                 COUNT(sl.id)::int AS cnt
          FROM "StatusLog" sl
          JOIN sheet_complete sc ON sc.sheet_id = sl.metadata->>'sheetId'
          WHERE sl.metadata->>'eventType' = 'SHEET_STATUS_CHANGED'
            AND sl.metadata->>'sheetStatus' = 'PRINTING'
            AND sl."createdAt" >= ${since}
            AND sl."createdAt" > sc.completed_at
        `,

        // 9. Category cycle times: orderDate → READY_FOR_DISPATCH per category
        this.prisma.$queryRaw<CatRow[]>`
          SELECT cat.name AS category,
                 AVG(EXTRACT(EPOCH FROM (r."createdAt" - o."orderDate")) / 3600)::float AS avg_hours,
                 COUNT(DISTINCT o.id)::int AS cnt
          FROM "StatusLog" r
          JOIN "Order" o ON o.id = r."orderId"
          JOIN "OrderItem" oi ON oi."orderId" = o.id
          JOIN "Product" p ON p.id = oi."productId"
          JOIN "Category" cat ON cat.id = p."categoryId"
          WHERE r."toStatus"::text = 'READY_FOR_DISPATCH' AND r."createdAt" >= ${since}
          GROUP BY cat.name
          ORDER BY avg_hours DESC NULLS LAST
        `,
      ]);

    const catAssign = (cat: string) => {
      const row = catAssignR.find(r => r.production_category === cat);
      return row ? { avgHours: n(row.avg_hours), sampleSize: cnt(row.cnt) } : { avgHours: null as number | null, sampleSize: 0 };
    };

    const metrics: ProductionKpiMetric[] = [
      mk('order_approval',            'Order Approval',            toData(approvalR),    'Order created to accounts approval'),
      mk('receipt_verification',      'Receipt Verification',      toData(receiptR),     'Payment receipt upload to accounts verification'),
      mk('assign_inhouse',            'Assign Inhouse Dept.',      catAssign('INHOUSE'), 'Accounts approval to inhouse category assignment'),
      mk('assign_clubbing',           'Assign Clubbing Dept.',     catAssign('CLUBBING'),'Accounts approval to clubbing category assignment'),
      mk('assign_sheet',              'Assign Sheet Dept.',        catAssign('SHEET_PRODUCTION'), 'Accounts approval to sheet production assignment'),
      mk('vendor_assignment',         'Vendor Assignment',         toData(vendorR),      'Production/sheet assignment to vendor selection'),
      mk('inhouse_print_start',       'Inhouse Printing Start',    toData(inhousePrintR),'Accounts approval to first inhouse printing signal'),
      mk('sheet_assignment',          'Sheet Assignment',          toData(sheetAssignR), 'Accounts approval to placing product on sheet'),
      mk('sheet_complete_to_printing','Sheet Complete to Printing',toData(sheetCPR),     'Sheet COMPLETE status to PRINTING status'),
      mk('ready_to_booking',          'Ready to Dispatch Booking', toData(readyBookR),   'Ready-for-dispatch to shipment booking'),
    ];

    const categoryRows = catTimeR.map(row => ({
      category: row.category,
      avgHours: n(row.avg_hours),
      avgDays:  row.avg_hours != null ? +(Number(row.avg_hours) / 24).toFixed(1) : null,
      sampleSize: cnt(row.cnt),
    }));

    return {
      metrics,
      categoryCycleTimes: categoryRows,
      bottlenecks: [...metrics].filter(m => m.avgHours !== null).sort((a, b) => (b.avgHours ?? 0) - (a.avgHours ?? 0)).slice(0, 5),
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
