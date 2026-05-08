import { Controller, Get, Post, UseGuards, Query, Body } from '@nestjs/common';
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

  @Get('crm/leads/meta-webhook')
  verifyMetaWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    if (mode === 'subscribe' && token === 'rareprint2024') return challenge;
    return 'Verification failed';
  }

  @Post('crm/leads/meta-webhook')
  async receiveMetaWebhook(@Body() body: any) {
    try {
      const PAGE_ACCESS_TOKEN = 'EAALuc4VndWcBRdAbNtsifQ2qMeZAwBZCBoxhIjTi5wg90Q8BoqYaNtMYoXTKz12mZAWJBVtBGUDhV9JgJOeK09kQAdMJcRJtoE1m7AAu7L59uWUr8uKGTeMUhUxo08C0zyR8D8EyZCAC2z6VE4s1wfQKoJupF6RLbRixqY9TtbC4DcjOhqlGiUE7P3FsJjZBzMPHzKojZCC5YNqmK2rY2j8DzygR4cuFRhB2J8w3oZD';
      
      // Handle Meta webhook format
      const entry = body?.entry?.[0];
      const change = entry?.changes?.[0];
      const leadgenId = change?.value?.leadgen_id;
      
      if (!leadgenId) return { status: 'no_leadgen_id' };

      // Fetch lead details from Meta Graph API
      const res = await fetch(
        `https://graph.facebook.com/v25.0/${leadgenId}?fields=field_data,created_time&access_token=${PAGE_ACCESS_TOKEN}`
      );
      const leadData = await res.json();
      
      if (!leadData.field_data) return { status: 'no_field_data', leadData };

      // Parse field_data into key-value pairs
      const fields: Record<string, string> = {};
      for (const f of leadData.field_data) {
        fields[f.name] = f.values?.[0] ?? '';
      }

      // Extract name and phone
      const name = fields['full_name'] || fields['first_name'] 
        ? `${fields['first_name'] || ''} ${fields['last_name'] || ''}`.trim()
        : fields['full_name'] || 'Facebook Lead';
      const phone = fields['phone_number'] || fields['phone'] || '';
      const email = fields['email'] || '';
      const city = fields['city'] || '';
      const productInterest = fields['product_interest'] || fields['what_product_are_you_interested_in'] || '';

      // Create lead in CRM via receiveMetaLead
      const { CrmService } = await import('./crm/crm.service');
      
      // Use prisma directly to create lead with round robin
      const agents = await this.prisma.user.findMany({
        where: { role: 'SALES_AGENT', isActive: true },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });

      if (!agents.length) return { status: 'no_agents' };

      const counts = await Promise.all(
        agents.map(async (a) => ({
          id: a.id,
          count: await this.prisma.lead.count({ where: { agentId: a.id } }),
        }))
      );
      counts.sort((a, b) => a.count - b.count);
      const agentId = counts[0].id;

      const lead = await this.prisma.lead.create({
        data: {
          name,
          phone,
          email: email || null,
          city: city || null,
          productInterest: productInterest || null,
          source: 'WHATSAPP' as any,
          status: 'NEW' as any,
          agentId,
          score: 30,
        },
      });

      // Schedule follow-ups
      const days = [1, 3, 7, 14, 30];
      await this.prisma.leadFollowUp.createMany({
        data: days.map((d) => ({
          leadId: lead.id,
          scheduledAt: new Date(Date.now() + d * 24 * 60 * 60 * 1000),
          note: `Day ${d} follow-up`,
        })),
      });

      return { status: 'lead_created', leadId: lead.id, name, phone };
    } catch (err) {
      console.error('Meta webhook error:', err);
      return { status: 'error', message: String(err) };
    }
  }

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


