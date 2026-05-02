// backend/src/dashboard/dashboard.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus, OrderProductionStage } from '@prisma/client';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    const now       = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const [
      allOrders,
      thisMonthOrders,
      lastMonthOrders,
      allPayments,
      thisMonthPayments,
      last7DaysOrders,
      recentOrders,
    ] = await Promise.all([
      this.prisma.order.findMany({ where: { status: { not: OrderStatus.CANCELLED } }, include: { payments: true } }),
      this.prisma.order.findMany({ where: { orderDate: { gte: startOfMonth }, status: { not: OrderStatus.CANCELLED } }, include: { payments: true } }),
      this.prisma.order.findMany({ where: { orderDate: { gte: startOfLastMonth, lte: endOfLastMonth }, status: { not: OrderStatus.CANCELLED } }, include: { payments: true } }),
      this.prisma.payment.findMany(),
      this.prisma.payment.findMany({ where: { paymentDate: { gte: startOfMonth } } }),
      this.prisma.payment.findMany({ where: { paymentDate: { gte: new Date(new Date().setHours(0,0,0,0)) } } }),
      this.prisma.order.findMany({
        where: { orderDate: { gte: new Date(now.getTime() - 7 * 86400000) }, status: { not: OrderStatus.CANCELLED } },
        orderBy: { orderDate: 'asc' },
      }),
      this.prisma.order.findMany({
        where: { status: { not: OrderStatus.CANCELLED } },
        orderBy: { orderDate: 'desc' }, take: 10,
        include: { items: { include: { product: true } } },
      }),
    ]);

    const thisMonthRevenue = thisMonthPayments.reduce((s, p) => s + Number(p.amount), 0);
    const lastMonthRevenue = lastMonthOrders.flatMap(o => o.payments).reduce((s, p) => s + Number(p.amount), 0);
    const growth = lastMonthRevenue > 0 ? Math.round(((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100) : 0;

    const totalOrderValue = allOrders.reduce((s, o) => s + Number(o.grandTotal), 0);
    const totalPaid       = allPayments.reduce((s, p) => s + Number(p.amount), 0);

    const byStatus: Record<string, number> = {};
    for (const o of allOrders) byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;

    // Last 7 days by date
    const dayMap: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      dayMap[d.toISOString().slice(0, 10)] = 0;
    }
    for (const o of last7DaysOrders) {
      const key = o.orderDate.toISOString().slice(0, 10);
      if (key in dayMap) dayMap[key]++;
    }
    const last7Days = Object.entries(dayMap).map(([date, count]) => ({
      date: new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      count,
    }));

    return {
      revenue: { thisMonth: thisMonthRevenue, lastMonth: lastMonthRevenue, growth },
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
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const orders = await this.prisma.order.findMany({
      where: { salesAgentId: { not: null }, status: { not: OrderStatus.CANCELLED } },
      include: { payments: true, salesAgent: { select: { id: true, fullName: true, email: true } } },
    });
    const map: Record<string, any> = {};
    for (const o of orders) {
      const id = o.salesAgentId!;
      if (!map[id]) map[id] = { id, name: o.salesAgent?.fullName ?? id, email: o.salesAgent?.email ?? "", totalOrders: 0, monthOrders: 0, totalRevenue: 0, monthRevenue: 0, totalValue: 0 };
      const rev = o.payments.reduce((s, p) => s + Number(p.amount), 0);
      map[id].totalOrders++;
      map[id].totalRevenue += rev;
      map[id].totalValue += Number(o.grandTotal);
      if (o.orderDate >= startOfMonth) { map[id].monthOrders++; map[id].monthRevenue += rev; }
    }
    return Object.values(map).sort((a: any, b: any) => b.monthRevenue - a.monthRevenue);
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



