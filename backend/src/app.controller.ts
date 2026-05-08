import { Controller, Get, UseGuards } from '@nestjs/common';
import { AppService } from './app.service';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from './prisma/prisma.service';
import { OrderStatus } from '@prisma/client';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('dashboard/stats')
  @UseGuards(AuthGuard('jwt'))
  async getDashboardStats() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    const startOf7Days = new Date(now);
    startOf7Days.setDate(now.getDate() - 6);

    // All orders
    const allOrders = await this.prisma.order.findMany({
      include: { payments: true },
      orderBy: { orderDate: 'desc' },
    });

    // Revenue this month
    const thisMonthPayments = await this.prisma.payment.findMany({
      where: { paymentDate: { gte: startOfMonth } },
    });
    const revenueThisMonth = thisMonthPayments.reduce((s, p) => s + Number(p.amount), 0);

    // Revenue last month
    const lastMonthPayments = await this.prisma.payment.findMany({
      where: { paymentDate: { gte: startOfLastMonth, lte: endOfLastMonth } },
    });
    const revenueLastMonth = lastMonthPayments.reduce((s, p) => s + Number(p.amount), 0);

    // Order counts by status
    const statusCounts = await this.prisma.order.groupBy({
      by: ['status'],
      _count: { status: true },
    });
    const byStatus: Record<string, number> = {};
    for (const s of statusCounts) {
      byStatus[s.status] = s._count.status;
    }

    // Total outstanding balance
    const allPayments = await this.prisma.payment.findMany();
    const totalPaid = allPayments.reduce((s, p) => s + Number(p.amount), 0);
    const totalOrderValue = allOrders.reduce((s, o) => s + Number(o.grandTotal), 0);
    const totalOutstanding = Math.max(0, totalOrderValue - totalPaid);

    // Orders created last 7 days (daily count)
    const last7Days: { date: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
      const count = allOrders.filter(o => {
        const od = new Date(o.orderDate);
        return od >= dayStart && od < dayEnd;
      }).length;
      last7Days.push({
        date: dayStart.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
        count,
      });
    }

    // Top customers by order value
    const customerMap: Record<string, { name: string; total: number; orders: number }> = {};
    for (const o of allOrders) {
      const paid = o.payments.reduce((s, p) => s + Number(p.amount), 0);
      if (!customerMap[o.customerId]) {
        customerMap[o.customerId] = { name: o.customerId, total: 0, orders: 0 };
      }
      customerMap[o.customerId].total += paid;
      customerMap[o.customerId].orders += 1;
    }

    // Recent orders (last 5)
    const recentOrders = allOrders.slice(0, 5).map(o => ({
      id: o.id,
      orderNo: o.orderNumber,
      status: o.status,
      total: Number(o.grandTotal),
      date: o.orderDate.toISOString(),
    }));

    return {
      revenue: {
        thisMonth: revenueThisMonth,
        lastMonth: revenueLastMonth,
        growth: revenueLastMonth > 0
          ? Math.round(((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100)
          : 0,
      },
      orders: {
        total: allOrders.length,
        thisMonth: allOrders.filter(o => new Date(o.orderDate) >= startOfMonth).length,
        byStatus,
        last7Days,
      },
      finance: {
        totalOrderValue,
        totalPaid,
        totalOutstanding,
      },
      pending: {
        approval: byStatus[OrderStatus.PENDING_APPROVAL] ?? 0,
        dispatchApproval: byStatus[OrderStatus.PENDING_DISPATCH_APPROVAL] ?? 0,
        inProduction: byStatus[OrderStatus.IN_PRODUCTION] ?? 0,
        readyForDispatch: byStatus[OrderStatus.READY_FOR_DISPATCH] ?? 0,
      },
      recentOrders,
    };
  }
}