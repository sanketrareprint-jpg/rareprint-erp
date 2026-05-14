// backend/src/dashboard/dashboard.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus, OrderProductionStage } from '@prisma/client';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

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
      allOrders,
      todayOrders,
      thisMonthOrders,
      lastMonthOrders,
      allPayments,
      last7DaysOrders,
      recentOrders,
    ] = await Promise.all([
      this.prisma.order.findMany({
        where: { status: { not: OrderStatus.CANCELLED } },
        select: { orderDate: true, grandTotal: true, status: true },
      }),
      this.prisma.order.findMany({
        where: { orderDate: { gte: startOfToday, lt: startOfTomorrow }, status: { not: OrderStatus.CANCELLED } },
        select: { grandTotal: true },
      }),
      this.prisma.order.findMany({
        where: { orderDate: { gte: startOfMonth, lt: startOfNextMonth }, status: { not: OrderStatus.CANCELLED } },
        select: { id: true, grandTotal: true },
      }),
      this.prisma.order.findMany({
        where: { orderDate: { gte: startOfLastMonth, lt: endOfLastMonth }, status: { not: OrderStatus.CANCELLED } },
        select: { grandTotal: true },
      }),
      this.prisma.payment.findMany(),
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

    const todayValue = todayOrders.reduce((s, o) => s + Number(o.grandTotal), 0);
    const thisMonthSale = thisMonthOrders.reduce((s, o) => s + Number(o.grandTotal), 0);
    const lastMonthRevenue = lastMonthOrders.reduce((s, o) => s + Number(o.grandTotal), 0);
    const averagePerDay = daysElapsed > 0 ? thisMonthSale / daysElapsed : 0;
    const monthlyRunRate = averagePerDay * daysInMonth;
    const growth = lastMonthRevenue > 0 ? Math.round(((thisMonthSale - lastMonthRevenue) / lastMonthRevenue) * 100) : 0;

    const totalOrderValue = allOrders.reduce((s, o) => s + Number(o.grandTotal), 0);
    const totalPaid       = allPayments.reduce((s, p) => s + Number(p.amount), 0);

    const byStatus: Record<string, number> = {};
    for (const o of allOrders) byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;

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
        total: allOrders.length,
        thisMonth: thisMonthOrders.length,
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





